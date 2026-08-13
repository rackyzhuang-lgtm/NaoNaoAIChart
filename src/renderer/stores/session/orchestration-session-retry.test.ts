import type { Message } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  completeFollowUpsMock,
  getSessionMock,
  getSessionSettingsMock,
  pauseCancelledFollowUpsMock,
  persistStreamingMessageMock,
  runSessionScopedGenerationRetryMock,
  updateStreamingCacheMock,
} = vi.hoisted(() => {
  const storage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
  }
  ;(globalThis as unknown as { localStorage: typeof storage }).localStorage = storage
  ;(globalThis as unknown as { window: { localStorage: typeof storage } }).window = { localStorage: storage }
  return {
    completeFollowUpsMock: vi.fn(),
    getSessionMock: vi.fn(),
    getSessionSettingsMock: vi.fn(),
    pauseCancelledFollowUpsMock: vi.fn(),
    persistStreamingMessageMock: vi.fn(),
    runSessionScopedGenerationRetryMock: vi.fn(),
    updateStreamingCacheMock: vi.fn(),
  }
})

vi.mock('../chatStore', () => ({
  getSession: getSessionMock,
  getSessionSettings: getSessionSettingsMock,
}))
vi.mock('../settingsStore', () => ({
  settingsStore: { getState: () => ({ getSettings: () => ({}) }) },
}))
vi.mock('./request-policy', () => ({
  usesFixedSub2ApiGateway: () => true,
}))
vi.mock('./messages', () => ({
  modifyMessage: vi.fn(),
  persistStreamingMessage: persistStreamingMessageMock,
  updateStreamingCache: updateStreamingCacheMock,
}))
vi.mock('./follow-up-queue', () => ({
  claimSteerAtPrepareStep: vi.fn(),
  completeFollowUpsForGeneration: completeFollowUpsMock,
  getFollowUpText: vi.fn(),
  pauseFollowUpsForCancelledGeneration: pauseCancelledFollowUpsMock,
  resolveFollowUpThreadIdForMessage: vi.fn(),
}))
vi.mock('./session-generation-retry', async (importOriginal) => {
  const original = await importOriginal<typeof import('./session-generation-retry')>()
  return {
    ...original,
    runSessionScopedGenerationRetry: runSessionScopedGenerationRetryMock,
  }
})

import { orchestrateGeneration, settleClaimedFollowUpsForGeneration } from './orchestration'

describe('orchestration session retry integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSessionSettingsMock.mockResolvedValue({ provider: 'openai-responses', modelId: 'gpt-5.6-sol' })
    completeFollowUpsMock.mockResolvedValue(undefined)
    pauseCancelledFollowUpsMock.mockResolvedValue(undefined)
    persistStreamingMessageMock.mockResolvedValue(undefined)
  })

  it('scopes retry orchestration to the current session and assistant message', async () => {
    runSessionScopedGenerationRetryMock.mockResolvedValue(undefined)
    const target = message('assistant-1', 'original content')

    await orchestrateGeneration('session-1', target, { operationType: 'send_message' })

    expect(runSessionScopedGenerationRetryMock).toHaveBeenCalledOnce()
    expect(runSessionScopedGenerationRetryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        messageId: 'assistant-1',
        initialRequestAttemptId: undefined,
      })
    )
  })

  it('clears failed transient state and exposes retry progress without changing the message identity', async () => {
    runSessionScopedGenerationRetryMock.mockImplementation(async (options) => {
      const controller = new AbortController()
      await options.onRetryScheduled({
        scope: { sessionId: 'session-1', messageId: 'assistant-1' },
        retryNumber: 2,
        maxRetries: 5,
        error: new Error('failed partial stream'),
        controller,
      })
    })
    const target = message('assistant-1', 'baseline')
    target.error = 'old error'
    target.errorCode = 10002

    await orchestrateGeneration('session-1', target)

    expect(persistStreamingMessageMock).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        id: 'assistant-1',
        contentParts: [{ type: 'text', text: 'baseline' }],
        generating: true,
        cancel: undefined,
        error: undefined,
        errorCode: undefined,
        status: [{ type: 'retrying', attempt: 2, maxAttempts: 5 }],
      })
    )
    expect(updateStreamingCacheMock).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        id: 'assistant-1',
        cancel: expect.any(Function),
        status: [{ type: 'retrying', attempt: 2, maxAttempts: 5 }],
      })
    )
  })

  it('pauses rather than consumes a claimed steer after explicit cancellation', async () => {
    await settleClaimedFollowUpsForGeneration('session-1', 'thread-1', 'assistant-1', true)

    expect(pauseCancelledFollowUpsMock).toHaveBeenCalledWith('session-1', 'thread-1', 'assistant-1')
    expect(completeFollowUpsMock).not.toHaveBeenCalled()
    expect(getSessionMock).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'success', terminal: { generating: false, finishReason: 'stop' } },
    { label: 'final failure', terminal: { generating: false, error: 'request failed' } },
  ])('consumes a claimed steer after $label terminal state', async ({ terminal }) => {
    getSessionMock.mockResolvedValue({
      id: 'session-1',
      name: 'Test',
      messages: [{ id: 'assistant-1', role: 'assistant', contentParts: [], ...terminal }],
    })

    await settleClaimedFollowUpsForGeneration('session-1', 'thread-1', 'assistant-1', false)

    expect(completeFollowUpsMock).toHaveBeenCalledWith('session-1', 'thread-1', 'assistant-1')
    expect(pauseCancelledFollowUpsMock).not.toHaveBeenCalled()
  })
})

function message(id: string, text: string): Message {
  return {
    id,
    role: 'assistant',
    contentParts: [{ type: 'text', text }],
    generating: true,
  }
}
