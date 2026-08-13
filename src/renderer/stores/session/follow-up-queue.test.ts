import type { Message, Session } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sessions, updateSessionMock, deleteMessageAttachmentsMock } = vi.hoisted(() => {
  const sessions = new Map<string, Session>()
  const updateSessionMock = vi.fn(async (sessionId: string, updater: (session: Session) => Session) => {
    const current = sessions.get(sessionId)
    if (!current) throw new Error('missing session')
    const next = updater(current)
    sessions.set(sessionId, next)
    return next
  })
  return { sessions, updateSessionMock, deleteMessageAttachmentsMock: vi.fn() }
})

vi.mock('@/platform', () => ({
  default: {
    type: 'desktop',
    getSessionAttachmentRagController: () => ({ deleteMessageAttachments: deleteMessageAttachmentsMock }),
  },
}))

vi.mock('../chatStore', () => ({
  getSession: vi.fn(async (sessionId: string) => sessions.get(sessionId)),
  updateSession: updateSessionMock,
}))

import {
  claimSteerAtPrepareStep,
  consumeFollowUpIntoSideChat,
  dispatchFollowUpById,
  dispatchReadyFollowUps,
  editFollowUp,
  enqueueFollowUp,
  getFollowUpScope,
  pauseFollowUpQueuesForLifecycle,
  pauseFollowUpsForCancelledGeneration,
  promoteFollowUpToSteer,
  removeFollowUp,
  reorderFollowUps,
  resolveActiveFollowUpThreadId,
  resumeFollowUpQueue,
} from './follow-up-queue'

beforeEach(() => {
  sessions.clear()
  updateSessionMock.mockClear()
  deleteMessageAttachmentsMock.mockReset()
  deleteMessageAttachmentsMock.mockResolvedValue([])
  sessions.set('session-1', session())
})

describe('follow-up queue core', () => {
  it('falls back to session id and persists FIFO items without changing lastActivityAt', async () => {
    expect(resolveActiveFollowUpThreadId(session())).toBe('session-1')
    const first = await enqueueFollowUp('session-1', { userMessage: user('first', 'First'), intent: 'queue' })
    const second = await enqueueFollowUp('session-1', { userMessage: user('second', 'Second'), intent: 'queue' })

    const stored = sessions.get('session-1')!
    expect(getFollowUpScope(stored)?.items.map((item) => item.id)).toEqual([first.id, second.id])
    expect(stored.lastActivityAt).toBe(100)
  })

  it('edits, reorders, and removes only non-dispatching items atomically', async () => {
    const first = await enqueueFollowUp('session-1', { userMessage: user('first', 'First'), intent: 'queue' })
    const second = await enqueueFollowUp('session-1', { userMessage: user('second', 'Second'), intent: 'queue' })
    await reorderFollowUps('session-1', 'session-1', [second.id, first.id])
    await editFollowUp('session-1', 'session-1', second.id, user('second', 'Edited'))
    await removeFollowUp('session-1', 'session-1', first.id)

    expect(getFollowUpScope(sessions.get('session-1')!)?.items).toMatchObject([
      { id: second.id, userMessage: { contentParts: [{ type: 'text', text: 'Edited' }] } },
    ])
    expect(deleteMessageAttachmentsMock).toHaveBeenCalledWith('first')
  })

  it('atomically links a Side Chat and consumes its source queue item', async () => {
    const first = await enqueueFollowUp('session-1', { userMessage: user('first', 'First'), intent: 'queue' })
    const second = await enqueueFollowUp('session-1', { userMessage: user('second', 'Second'), intent: 'queue' })

    await consumeFollowUpIntoSideChat('session-1', first.id, 'side-chat-1')

    const state = sessions.get('session-1')?.followUpState
    expect(state?.scopes['session-1'].items).toEqual([expect.objectContaining({ id: second.id })])
    expect(state?.sideChats?.[first.id]).toMatchObject({
      queueItemId: first.id,
      sessionId: 'side-chat-1',
      threadId: 'session-1',
    })
    expect(deleteMessageAttachmentsMock).toHaveBeenCalledWith('first')

    const dispatch = vi.fn().mockResolvedValue({ terminal: true })
    await dispatchReadyFollowUps('session-1', 'session-1', dispatch)
    expect(dispatch).toHaveBeenCalledOnce()
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: second.id }))
  })

  it('does not consume a source item that has already started dispatching', async () => {
    const queued = await enqueueFollowUp('session-1', { userMessage: user('first', 'First'), intent: 'queue' })
    let releaseDispatch!: () => void
    const dispatchPending = new Promise<void>((resolve) => {
      releaseDispatch = resolve
    })
    const dispatching = dispatchReadyFollowUps('session-1', 'session-1', async () => {
      await dispatchPending
      return { terminal: true }
    })
    await vi.waitFor(() => {
      expect(getFollowUpScope(sessions.get('session-1')!)?.items[0]?.status).toBe('dispatching')
    })

    await expect(consumeFollowUpIntoSideChat('session-1', queued.id, 'side-chat-1')).rejects.toThrow(
      'already being dispatched'
    )
    expect(getFollowUpScope(sessions.get('session-1')!)?.items).toEqual([
      expect.objectContaining({ id: queued.id, status: 'dispatching' }),
    ])
    expect(sessions.get('session-1')?.followUpState?.sideChats).toBeUndefined()

    releaseDispatch()
    await dispatching
  })

  it('pauses residual ready or dispatching work on startup and never dispatches while paused', async () => {
    await enqueueFollowUp('session-1', { userMessage: user('first', 'First'), intent: 'queue' })
    await pauseFollowUpQueuesForLifecycle(['session-1'], 'startup')
    const dispatch = vi.fn().mockResolvedValue({ terminal: true })

    await dispatchReadyFollowUps('session-1', 'session-1', dispatch)

    expect(dispatch).not.toHaveBeenCalled()
    expect(getFollowUpScope(sessions.get('session-1')!)).toMatchObject({
      status: 'paused',
      pausedReason: 'startup',
      items: [{ status: 'paused' }],
    })
  })

  it('keeps a claimed item until its generated assistant reaches terminal state', async () => {
    const queued = await enqueueFollowUp('session-1', { userMessage: user('first', 'First'), intent: 'queue' })
    let observedDuringDispatch = false
    const dispatch = vi.fn(async () => {
      observedDuringDispatch = getFollowUpScope(sessions.get('session-1')!)?.items[0]?.status === 'dispatching'
      return { terminal: true }
    })

    await dispatchReadyFollowUps('session-1', 'session-1', dispatch)

    expect(observedDuringDispatch).toBe(true)
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: queued.id }))
    expect(getFollowUpScope(sessions.get('session-1')!)?.items).toEqual([])
  })

  it('prioritizes steer at terminal fallback, then consumes queued work in FIFO order', async () => {
    const first = await enqueueFollowUp('session-1', { userMessage: user('first', 'First'), intent: 'queue' })
    const steer = await enqueueFollowUp('session-1', { userMessage: user('steer', 'Steer'), intent: 'steer' })
    const third = await enqueueFollowUp('session-1', { userMessage: user('third', 'Third'), intent: 'queue' })
    const dispatched: string[] = []

    await dispatchReadyFollowUps('session-1', 'session-1', async (item) => {
      dispatched.push(item.id)
      return { terminal: true }
    })

    expect(dispatched).toEqual([steer.id, first.id, third.id])
  })

  it('does not inject a terminal-fallback steer again in its independent generation', async () => {
    const steer = await enqueueFollowUp('session-1', { userMessage: user('steer', 'Steer'), intent: 'steer' })

    await dispatchReadyFollowUps('session-1', 'session-1', async (item) => {
      expect(item).toMatchObject({
        id: steer.id,
        status: 'dispatching',
        dispatchTargetMessageId: steer.reservedAssistantMessageId,
        dispatchAttemptId: undefined,
      })
      await expect(
        claimSteerAtPrepareStep({
          sessionId: 'session-1',
          threadId: 'session-1',
          targetMessageId: steer.reservedAssistantMessageId,
          attemptId: 'independent-attempt',
        })
      ).resolves.toBeUndefined()
      return { terminal: true }
    })
  })

  it('reinjects a prepareStep-claimed steer only when a later retry attempt starts', async () => {
    const steer = await enqueueFollowUp('session-1', { userMessage: user('steer', 'Steer'), intent: 'steer' })

    await expect(
      claimSteerAtPrepareStep({
        sessionId: 'session-1',
        threadId: 'session-1',
        targetMessageId: 'assistant-active',
        attemptId: 'attempt-1',
      })
    ).resolves.toMatchObject({ id: steer.id, dispatchAttemptId: 'attempt-1' })
    await expect(
      claimSteerAtPrepareStep({
        sessionId: 'session-1',
        threadId: 'session-1',
        targetMessageId: 'assistant-active',
        attemptId: 'attempt-1',
      })
    ).resolves.toBeUndefined()
    await expect(
      claimSteerAtPrepareStep({
        sessionId: 'session-1',
        threadId: 'session-1',
        targetMessageId: 'assistant-active',
        attemptId: 'attempt-2',
      })
    ).resolves.toMatchObject({ id: steer.id, dispatchAttemptId: 'attempt-2' })
  })

  it('retains a non-terminal dispatch and pauses it for explicit recovery', async () => {
    const queued = await enqueueFollowUp('session-1', { userMessage: user('first', 'First'), intent: 'queue' })
    await dispatchReadyFollowUps('session-1', 'session-1', async () => ({ terminal: false }))

    expect(getFollowUpScope(sessions.get('session-1')!)).toMatchObject({
      status: 'paused',
      items: [{ id: queued.id, status: 'paused' }],
    })
    await resumeFollowUpQueue('session-1', 'session-1')
    expect(getFollowUpScope(sessions.get('session-1')!)?.items[0]).toMatchObject({
      status: 'ready',
      dispatchTargetMessageId: undefined,
    })
    await dispatchReadyFollowUps('session-1', 'session-1', async () => ({ terminal: true }))
    expect(getFollowUpScope(sessions.get('session-1')!)?.items).toEqual([])
  })

  it('immediately dispatches only the selected paused item and leaves siblings paused', async () => {
    const first = await enqueueFollowUp('session-1', { userMessage: user('first', 'First'), intent: 'queue' })
    const second = await enqueueFollowUp('session-1', { userMessage: user('second', 'Second'), intent: 'queue' })
    await pauseFollowUpQueuesForLifecycle(['session-1'], 'navigation')
    const dispatch = vi.fn().mockResolvedValue({ terminal: true })

    await dispatchFollowUpById('session-1', 'session-1', second.id, dispatch)

    expect(dispatch).toHaveBeenCalledOnce()
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: second.id, status: 'dispatching' }))
    expect(getFollowUpScope(sessions.get('session-1')!)).toMatchObject({
      status: 'paused',
      items: [{ id: first.id, status: 'paused' }],
    })
  })

  it('promotes one queued item to steer without dispatching a provider request', async () => {
    const queued = await enqueueFollowUp('session-1', { userMessage: user('first', 'First'), intent: 'queue' })

    await promoteFollowUpToSteer('session-1', 'session-1', queued.id)

    expect(getFollowUpScope(sessions.get('session-1')!)?.items).toMatchObject([
      { id: queued.id, intent: 'steer', status: 'ready' },
    ])
  })

  it('keeps attachment steering out of prepareStep and dispatches it after terminal state', async () => {
    const message = user('file', 'Use this file instead')
    message.files = [
      { id: 'file-1', name: 'notes.txt', fileType: 'text/plain', storageKey: 'local-file', parserType: 'plain' },
    ]
    const queued = await enqueueFollowUp('session-1', { userMessage: message, intent: 'steer' })
    await expect(
      claimSteerAtPrepareStep({
        sessionId: 'session-1',
        threadId: 'session-1',
        targetMessageId: 'assistant-active',
        attemptId: 'attempt-1',
      })
    ).resolves.toBeUndefined()

    const dispatch = vi.fn().mockResolvedValue({ terminal: true })
    await dispatchReadyFollowUps('session-1', 'session-1', dispatch)
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: queued.id, intent: 'steer' }))
  })

  it('retains a prepareStep-claimed steer as paused when its generation is cancelled', async () => {
    const queued = await enqueueFollowUp('session-1', {
      userMessage: user('steer', 'Change direction'),
      intent: 'steer',
    })
    await claimSteerAtPrepareStep({
      sessionId: 'session-1',
      threadId: 'session-1',
      targetMessageId: 'assistant-active',
      attemptId: 'attempt-1',
    })

    await pauseFollowUpsForCancelledGeneration('session-1', 'session-1', 'assistant-active')

    expect(getFollowUpScope(sessions.get('session-1')!)).toMatchObject({
      status: 'paused',
      pausedReason: 'user',
      items: [
        {
          id: queued.id,
          status: 'paused',
          dispatchTargetMessageId: 'assistant-active',
          dispatchAttemptId: 'attempt-1',
        },
      ],
    })
  })
})

function session(): Session {
  return { id: 'session-1', name: 'Test', messages: [], lastActivityAt: 100 }
}

function user(id: string, text: string): Message {
  return { id, role: 'user', contentParts: [{ type: 'text', text }] }
}
