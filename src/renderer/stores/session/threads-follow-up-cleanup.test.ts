import { createMessage, type FollowUpState, type Session, type SessionThread } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  sessions,
  cleanupFollowUpThreadAttachmentsMock,
  deleteOwnedSideChatSessionsMock,
  pauseFollowUpQueueMock,
  updateSessionWithMessagesMock,
} = vi.hoisted(() => {
  const sessions = new Map<string, Session>()
  return {
    sessions,
    cleanupFollowUpThreadAttachmentsMock: vi.fn(),
    deleteOwnedSideChatSessionsMock: vi.fn(),
    pauseFollowUpQueueMock: vi.fn(),
    updateSessionWithMessagesMock: vi.fn((sessionId: string, updater: (session: Session) => Session) => {
      const current = sessions.get(sessionId)
      if (!current) throw new Error(`Session ${sessionId} not found`)
      const next = updater(current)
      sessions.set(sessionId, next)
      return next
    }),
  }
})

vi.mock('../chatStore', () => ({
  getSession: vi.fn(async (sessionId: string) => sessions.get(sessionId)),
  deleteOwnedSideChatSessions: deleteOwnedSideChatSessionsMock,
  updateSessionWithMessages: updateSessionWithMessagesMock,
}))

vi.mock('./follow-up-queue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./follow-up-queue')>()
  return {
    ...actual,
    cleanupFollowUpThreadAttachments: cleanupFollowUpThreadAttachmentsMock,
    pauseFollowUpQueue: pauseFollowUpQueueMock,
  }
})

vi.mock('./crud', () => ({
  _copySession: vi.fn(),
  switchCurrentSession: vi.fn(),
}))

vi.mock('@/hooks/dom', () => ({ focusMessageInput: vi.fn() }))
vi.mock('../scrollActions', () => ({ scrollToBottom: vi.fn() }))

import { removeCurrentThread, removeThread } from './threads'

beforeEach(() => {
  sessions.clear()
  pauseFollowUpQueueMock.mockReset()
  cleanupFollowUpThreadAttachmentsMock.mockReset()
  deleteOwnedSideChatSessionsMock.mockReset()
  deleteOwnedSideChatSessionsMock.mockImplementation(async (sessionId: string, threadId: string) => {
    const current = sessions.get(sessionId)
    if (!current?.followUpState) return []
    const ownedQueueItemIds = new Set(
      Object.values(followUpState().sideChats ?? {})
        .filter((link) => link.threadId === threadId)
        .map((link) => link.queueItemId)
    )
    for (const item of followUpState().scopes[threadId]?.items ?? []) ownedQueueItemIds.add(item.id)
    current.followUpState.sideChats = Object.fromEntries(
      Object.entries(current.followUpState.sideChats ?? {}).filter(
        ([queueItemId, link]) => link.threadId !== threadId && !ownedQueueItemIds.has(queueItemId)
      )
    )
    return []
  })
  updateSessionWithMessagesMock.mockClear()
})

describe('thread follow-up state cleanup', () => {
  it('removes a historical thread, its queue attachments, and its Side Chat links in one session update', async () => {
    sessions.set('session-1', session())

    await removeThread('session-1', 'thread-history')

    const stored = sessions.get('session-1')
    expect(stored).toBeDefined()
    expect(updateSessionWithMessagesMock).toHaveBeenCalledOnce()
    expect(deleteOwnedSideChatSessionsMock).toHaveBeenCalledWith('session-1', 'thread-history')
    expect(cleanupFollowUpThreadAttachmentsMock).toHaveBeenCalledWith(expect.anything(), 'thread-history')
    expect(stored?.threads).toHaveLength(0)
    expect(stored?.followUpState?.scopes).not.toHaveProperty('thread-history')
    expect(stored?.followUpState?.scopes).toHaveProperty('thread-current')
    expect(stored?.followUpState?.sideChats).toEqual({
      'current-item': expect.objectContaining({ sessionId: 'side-current', threadId: 'thread-current' }),
    })
  })

  it('removes current-thread follow-up state while restoring the latest historical thread atomically', async () => {
    sessions.set('session-1', session())

    await removeCurrentThread('session-1')

    const stored = sessions.get('session-1')
    expect(stored).toBeDefined()
    expect(pauseFollowUpQueueMock).toHaveBeenCalledWith('session-1', 'thread-current', 'thread-switch')
    expect(deleteOwnedSideChatSessionsMock).toHaveBeenCalledWith('session-1', 'thread-current')
    expect(cleanupFollowUpThreadAttachmentsMock).toHaveBeenCalledWith(expect.anything(), 'thread-current')
    expect(updateSessionWithMessagesMock).toHaveBeenCalledOnce()
    expect(stored?.activeThreadId).toBe('thread-history')
    expect(stored?.messages.map((message) => message.id)).toEqual(['history-system', 'history-user'])
    expect(stored?.followUpState?.scopes).not.toHaveProperty('thread-current')
    expect(stored?.followUpState?.scopes).toHaveProperty('thread-history')
    expect(stored?.followUpState?.sideChats).toEqual({
      'history-item': expect.objectContaining({ sessionId: 'side-history' }),
      'completed-history-item': expect.objectContaining({ sessionId: 'side-completed-history' }),
    })
  })

  it('removes the parent thread before attempting recoverable Side Chat cleanup', async () => {
    sessions.set('session-1', session())
    deleteOwnedSideChatSessionsMock.mockRejectedValueOnce(new Error('side chat cleanup failed'))

    await expect(removeThread('session-1', 'thread-history')).rejects.toThrow('side chat cleanup failed')

    expect(updateSessionWithMessagesMock).toHaveBeenCalledOnce()
    expect(sessions.get('session-1')?.threads).toEqual([])
  })

  it('does not clean Side Chats for an unknown historical thread', async () => {
    sessions.set('session-1', session())

    await removeThread('session-1', 'missing-thread')

    expect(deleteOwnedSideChatSessionsMock).not.toHaveBeenCalled()
    expect(updateSessionWithMessagesMock).not.toHaveBeenCalled()
  })
})

function session(): Session {
  const currentSystem = createMessage('system', 'Current system')
  currentSystem.id = 'current-system'
  const currentUser = createMessage('user', 'Current user')
  currentUser.id = 'current-user'
  const historySystem = createMessage('system', 'History system')
  historySystem.id = 'history-system'
  const historyUser = createMessage('user', 'History user')
  historyUser.id = 'history-user'

  const history: SessionThread = {
    id: 'thread-history',
    name: 'History',
    messages: [historySystem, historyUser],
    createdAt: 1,
  }

  return {
    id: 'session-1',
    name: 'Session',
    type: 'chat',
    messages: [currentSystem, currentUser],
    threads: [history],
    activeThreadId: 'thread-current',
    followUpState: followUpState(),
  } as Session
}

function followUpState(): FollowUpState {
  const currentMessage = createMessage('user', 'Current queued attachment')
  currentMessage.files = [
    { id: 'current-file', name: 'current.txt', fileType: 'text/plain', storageKey: 'current-blob' },
  ]
  const historyMessage = createMessage('user', 'History queued attachment')
  historyMessage.files = [
    { id: 'history-file', name: 'history.txt', fileType: 'text/plain', storageKey: 'history-blob' },
  ]
  return {
    version: 1,
    scopes: {
      'thread-current': {
        threadId: 'thread-current',
        status: 'active',
        items: [queueItem('current-item', 'thread-current', currentMessage)],
      },
      'thread-history': {
        threadId: 'thread-history',
        status: 'active',
        items: [queueItem('history-item', 'thread-history', historyMessage)],
      },
    },
    sideChats: {
      'current-item': sideChatLink('current-item', 'side-current', 'thread-current'),
      'history-item': sideChatLink('history-item', 'side-history'),
      'completed-history-item': sideChatLink('completed-history-item', 'side-completed-history', 'thread-history'),
    },
  }
}

function queueItem(id: string, threadId: string, userMessage: ReturnType<typeof createMessage>) {
  return {
    id,
    threadId,
    userMessage,
    reservedAssistantMessageId: `${id}-assistant`,
    intent: 'queue' as const,
    status: 'ready' as const,
    createdAt: 1,
    updatedAt: 1,
  }
}

function sideChatLink(queueItemId: string, sessionId: string, threadId = 'thread-history') {
  return { queueItemId, sessionId, threadId, createdAt: 1, updatedAt: 1 }
}
