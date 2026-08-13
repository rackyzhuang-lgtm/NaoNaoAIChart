import type { FollowUpQueueItem, Message, Session } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  generateSideChatReply: vi.fn(),
  setSessionWebBrowsing: vi.fn(),
}))

vi.mock('@/platform', () => ({ default: { type: 'desktop' } }))

vi.mock('../chatStore', () => ({
  createSession: vi.fn((input: Omit<Session, 'id'>) => {
    const created = { ...input, id: 'side-chat-integration' } as Session
    mocks.sessions.set(created.id, created)
    return Promise.resolve(created)
  }),
  deleteSession: vi.fn((id: string) => {
    mocks.sessions.delete(id)
    return Promise.resolve()
  }),
  getSession: vi.fn((id: string) => Promise.resolve(mocks.sessions.get(id) ?? null)),
  updateMessage: vi.fn((sessionId: string, messageId: string, message: Message) => {
    const current = requireSession(sessionId)
    mocks.sessions.set(sessionId, {
      ...current,
      messages: current.messages.map((candidate) => (candidate.id === messageId ? message : candidate)),
    })
    return Promise.resolve()
  }),
  updateSession: vi.fn((sessionId: string, update: Partial<Session> | ((session: Session) => Partial<Session>)) => {
    const current = requireSession(sessionId)
    const changes = typeof update === 'function' ? update(current) : update
    const next = { ...current, ...changes }
    mocks.sessions.set(sessionId, next)
    return Promise.resolve(next)
  }),
}))

vi.mock('../sessionAttachmentRagIndexing', () => ({
  ensureMessageFileSessionAttachment: vi.fn(),
}))

vi.mock('../uiStore', () => ({
  uiStore: { getState: () => ({ setSessionWebBrowsing: mocks.setSessionWebBrowsing }) },
}))

vi.mock('./generation', () => ({
  generateSideChatReply: mocks.generateSideChatReply,
}))

vi.mock('./goal', () => ({ createGoal: vi.fn() }))

import { dispatchReadyFollowUps, getFollowUpScope } from './follow-up-queue'
import { openFollowUpInSideChat, startFollowUpSideChatGeneration } from './side-chat'

describe('Side Chat queue integration', () => {
  beforeEach(() => {
    mocks.sessions.clear()
    vi.clearAllMocks()
  })

  it('starts the Side Chat once and excludes the consumed item from source terminal dispatch', async () => {
    const selected = item('selected', 'Open separately')
    const sibling = item('sibling', 'Send after terminal')
    mocks.sessions.set('source', {
      id: 'source',
      name: 'Source',
      type: 'chat',
      messages: [{ id: 'system', role: 'system', contentParts: [{ type: 'text', text: 'Stay focused.' }] }],
      settings: { provider: 'openai-responses', modelId: 'gpt-5.6-sol' },
      activeThreadId: 'thread',
      followUpState: {
        version: 1,
        scopes: { thread: { threadId: 'thread', status: 'active', items: [selected, sibling] } },
      },
    })

    const sideChat = await openFollowUpInSideChat('source', selected)
    await Promise.all([
      startFollowUpSideChatGeneration(sideChat.id, true),
      startFollowUpSideChatGeneration(sideChat.id, true),
    ])
    const source = requireSession('source')
    expect(getFollowUpScope(source, 'thread')?.items).toEqual([expect.objectContaining({ id: sibling.id })])
    expect(source.followUpState?.sideChats?.[selected.id]?.sessionId).toBe(sideChat.id)
    expect(mocks.generateSideChatReply).toHaveBeenCalledOnce()

    const dispatch = vi.fn().mockResolvedValue({ terminal: true })
    await dispatchReadyFollowUps('source', 'thread', dispatch)
    expect(dispatch).toHaveBeenCalledOnce()
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: sibling.id }))
  })
})

function item(id: string, text: string): FollowUpQueueItem {
  return {
    id,
    threadId: 'thread',
    userMessage: { id: `message-${id}`, role: 'user', contentParts: [{ type: 'text', text }] },
    reservedAssistantMessageId: `assistant-${id}`,
    intent: 'queue',
    status: 'ready',
    createdAt: 1,
    updatedAt: 1,
  }
}

function requireSession(id: string): Session {
  const session = mocks.sessions.get(id)
  if (!session) throw new Error(`Session ${id} not found`)
  return session
}
