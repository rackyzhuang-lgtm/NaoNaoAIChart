import type { Message } from '@shared/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getSessionMock,
  getSessionSettingsMock,
  insertMessageAfterMock,
  findMessageLocationMock,
  orchestrateGenerationMock,
  dispatchReadyFollowUpsMock,
  resumeFollowUpQueueMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getSessionSettingsMock: vi.fn(),
  insertMessageAfterMock: vi.fn(),
  findMessageLocationMock: vi.fn(),
  orchestrateGenerationMock: vi.fn(),
  dispatchReadyFollowUpsMock: vi.fn(),
  resumeFollowUpQueueMock: vi.fn(),
}))

vi.mock('../chatStore', () => ({
  getSession: getSessionMock,
  getSessionSettings: getSessionSettingsMock,
}))
vi.mock('./attachment-resolver', () => ({ createAttachmentResolver: vi.fn() }))
vi.mock('./forks', () => ({ createNewFork: vi.fn(), findMessageLocation: findMessageLocationMock }))
vi.mock('./messages', () => ({ insertMessageAfter: insertMessageAfterMock }))
vi.mock('./orchestration', () => ({ orchestrateGeneration: orchestrateGenerationMock }))
vi.mock('./pictures', () => ({ orchestratePictureGeneration: vi.fn() }))
vi.mock('./follow-up-queue', () => ({
  dispatchFollowUpById: vi.fn(),
  dispatchReadyFollowUps: dispatchReadyFollowUpsMock,
  resolveFollowUpThreadIdForMessage: vi.fn(),
  resumeFollowUpQueue: resumeFollowUpQueueMock,
}))
vi.mock('./utils', () => ({ getSessionWebBrowsing: vi.fn() }))

import {
  generate,
  generateSideChatReply,
  resumeAndDispatchQueuedFollowUps,
  wakeAndDispatchQueuedFollowUps,
} from './generation'
import { resetSessionGenerationLocksForTests } from './generation-lock'

function message(id: string): Message {
  return { id, role: 'assistant', contentParts: [], generating: true }
}

describe('generation entry-point locking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSessionGenerationLocksForTests()
    getSessionMock.mockResolvedValue({ id: 'session-1', name: 'Session', messages: [] })
    getSessionSettingsMock.mockResolvedValue({})
    insertMessageAfterMock.mockResolvedValue(undefined)
    dispatchReadyFollowUpsMock.mockResolvedValue(undefined)
    resumeFollowUpQueueMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    resetSessionGenerationLocksForTests()
  })

  it('serializes public generation calls for the same session', async () => {
    let finishFirst = () => {}
    const firstGeneration = new Promise<void>((resolve) => {
      finishFirst = resolve
    })
    orchestrateGenerationMock.mockReturnValueOnce(firstGeneration).mockResolvedValueOnce(undefined)

    const first = generate('session-1', message('assistant-1'))
    const second = generate('session-1', message('assistant-2'))

    await vi.waitFor(() => expect(orchestrateGenerationMock).toHaveBeenCalledOnce())
    finishFirst()
    await Promise.all([first, second])

    expect(orchestrateGenerationMock.mock.calls.map((call) => call[1].id)).toEqual(['assistant-1', 'assistant-2'])
  })

  it('starts public generation calls for different sessions concurrently', async () => {
    let finishSessionA = () => {}
    let finishSessionB = () => {}
    const sessionAGeneration = new Promise<void>((resolve) => {
      finishSessionA = resolve
    })
    const sessionBGeneration = new Promise<void>((resolve) => {
      finishSessionB = resolve
    })
    orchestrateGenerationMock.mockImplementation((sessionId: string) =>
      sessionId === 'session-a' ? sessionAGeneration : sessionBGeneration
    )

    const sessionA = generate('session-a', message('assistant-a'))
    const sessionB = generate('session-b', message('assistant-b'))

    await vi.waitFor(() => expect(orchestrateGenerationMock).toHaveBeenCalledTimes(2))
    expect(orchestrateGenerationMock.mock.calls.map(([sessionId, target]) => [sessionId, target.id])).toEqual([
      ['session-a', 'assistant-a'],
      ['session-b', 'assistant-b'],
    ])

    finishSessionA()
    finishSessionB()
    await Promise.all([sessionA, sessionB])
  })

  it('reuses one in-flight task for duplicate generation of the same assistant message', async () => {
    let finishGeneration = () => {}
    const generation = new Promise<void>((resolve) => {
      finishGeneration = resolve
    })
    orchestrateGenerationMock.mockReturnValue(generation)
    const target = message('assistant-1')

    const first = generate('session-1', target)
    const duplicate = generate('session-1', target)

    expect(duplicate).toBe(first)
    await vi.waitFor(() => expect(orchestrateGenerationMock).toHaveBeenCalledOnce())
    finishGeneration()
    await first
    expect(orchestrateGenerationMock).toHaveBeenCalledOnce()
  })

  it('keeps a normal window and Side Chat concurrent while deduplicating the Side Chat start', async () => {
    let finishNormal = () => {}
    let finishSideChat = () => {}
    const normalGeneration = new Promise<void>((resolve) => {
      finishNormal = resolve
    })
    const sideChatGeneration = new Promise<void>((resolve) => {
      finishSideChat = resolve
    })
    const sideUser = { id: 'side-user', role: 'user', contentParts: [] } as Message
    getSessionMock.mockImplementation((sessionId: string) =>
      Promise.resolve(
        sessionId === 'side-chat'
          ? { id: 'side-chat', name: 'Side', type: 'chat', hidden: true, messages: [sideUser] }
          : { id: sessionId, name: 'Session', messages: [] }
      )
    )
    findMessageLocationMock.mockReturnValue({ list: [sideUser], index: 0 })
    orchestrateGenerationMock.mockImplementation((sessionId: string) =>
      sessionId === 'side-chat' ? sideChatGeneration : normalGeneration
    )

    const normal = generate('session-1', message('assistant-1'))
    const side = generateSideChatReply('side-chat', sideUser.id)
    const duplicateSide = generateSideChatReply('side-chat', sideUser.id)

    expect(duplicateSide).toBe(side)
    await vi.waitFor(() => expect(orchestrateGenerationMock).toHaveBeenCalledTimes(2))
    expect(orchestrateGenerationMock.mock.calls.map(([sessionId]) => sessionId).sort()).toEqual([
      'session-1',
      'side-chat',
    ])
    expect(insertMessageAfterMock).toHaveBeenCalledOnce()

    finishNormal()
    finishSideChat()
    await Promise.all([normal, side])
  })

  it('resumes and drains a paused queue only after the active generation releases the session lock', async () => {
    let finishGeneration = () => {}
    orchestrateGenerationMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishGeneration = resolve
      })
    )

    const generation = generate('session-1', message('assistant-1'))
    const resumed = resumeAndDispatchQueuedFollowUps('session-1', 'thread-1')

    await vi.waitFor(() => expect(orchestrateGenerationMock).toHaveBeenCalledOnce())
    expect(resumeFollowUpQueueMock).not.toHaveBeenCalled()
    expect(dispatchReadyFollowUpsMock).not.toHaveBeenCalled()

    finishGeneration()
    await Promise.all([generation, resumed])

    expect(resumeFollowUpQueueMock).toHaveBeenCalledWith('session-1', 'thread-1')
    expect(dispatchReadyFollowUpsMock).toHaveBeenCalledOnce()
  })

  it('registers each persisted enqueue behind the active generation without an early dispatch', async () => {
    let finishGeneration = () => {}
    orchestrateGenerationMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishGeneration = resolve
      })
    )

    const generation = generate('session-1', message('assistant-1'))
    const firstWake = wakeAndDispatchQueuedFollowUps('session-1', 'thread-1', 'queue-1')
    const secondWake = wakeAndDispatchQueuedFollowUps('session-1', 'thread-1', 'queue-2')

    await vi.waitFor(() => expect(orchestrateGenerationMock).toHaveBeenCalledOnce())
    expect(dispatchReadyFollowUpsMock).not.toHaveBeenCalled()

    finishGeneration()
    await Promise.all([generation, firstWake, secondWake])

    expect(dispatchReadyFollowUpsMock).toHaveBeenCalledTimes(2)
  })
})
