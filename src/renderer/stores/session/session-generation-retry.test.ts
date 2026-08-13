import { Sub2ApiError, serializeSub2ApiError } from '@shared/sub2api/errors'
import { describe, expect, it, vi } from 'vitest'
import {
  createSessionRetryStatus,
  getSessionRetryDelayMs,
  interruptSessionRetryBackoff,
  MAX_SESSION_GENERATION_RETRIES,
  runSessionScopedGenerationRetry,
  shouldRetrySessionGeneration,
} from './session-generation-retry'

describe('session-scoped generation retry', () => {
  it('sends only the original request when it succeeds', async () => {
    const runAttempt = vi.fn().mockResolvedValue({ type: 'complete' })

    await runRetry({ runAttempt })

    expect(runAttempt).toHaveBeenCalledOnce()
    expect(runAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        messageId: 'message-1',
        retryNumber: 0,
        requestAttemptId: undefined,
      })
    )
  })

  it('waits for each failed attempt to settle and then retries at most five times', async () => {
    let activeAttempts = 0
    let maxActiveAttempts = 0
    const events: string[] = []
    const runAttempt = vi.fn(async ({ retryNumber }: { retryNumber: number }) => {
      activeAttempts += 1
      maxActiveAttempts = Math.max(maxActiveAttempts, activeAttempts)
      events.push(`attempt:${retryNumber}:start`)
      await Promise.resolve()
      events.push(`attempt:${retryNumber}:end`)
      activeAttempts -= 1
      return { type: 'failed' as const, error: new Error(`failure-${retryNumber}`), failure: retryNumber }
    })
    const onRetryScheduled = vi.fn(({ retryNumber }: { retryNumber: number }) => {
      events.push(`retry:${retryNumber}`)
      return Promise.resolve()
    })
    const onFinalFailure = vi.fn()

    await runRetry({ runAttempt, onRetryScheduled, onFinalFailure })

    expect(runAttempt).toHaveBeenCalledTimes(1 + MAX_SESSION_GENERATION_RETRIES)
    expect(onRetryScheduled).toHaveBeenCalledTimes(MAX_SESSION_GENERATION_RETRIES)
    expect(onFinalFailure).toHaveBeenCalledOnce()
    expect(onFinalFailure).toHaveBeenCalledWith(5, expect.objectContaining({ message: 'failure-5' }))
    expect(maxActiveAttempts).toBe(1)
    expect(events).toEqual([
      'attempt:0:start',
      'attempt:0:end',
      'retry:1',
      'attempt:1:start',
      'attempt:1:end',
      'retry:2',
      'attempt:2:start',
      'attempt:2:end',
      'retry:3',
      'attempt:3:start',
      'attempt:3:end',
      'retry:4',
      'attempt:4:start',
      'attempt:4:end',
      'retry:5',
      'attempt:5:start',
      'attempt:5:end',
    ])
  })

  it('uses the caller request ID once and a fresh attempt ID for every automatic retry', async () => {
    const attemptIds = ['retry-1', 'retry-2', 'retry-3']
    const createRequestAttemptId = vi.fn(() => attemptIds.shift() ?? 'unexpected')
    const observedIds: Array<string | undefined> = []

    await runRetry({
      initialRequestAttemptId: 'manual-attempt',
      createRequestAttemptId,
      runAttempt: vi.fn(({ requestAttemptId, retryNumber }: { requestAttemptId?: string; retryNumber: number }) => {
        observedIds.push(requestAttemptId)
        return Promise.resolve(
          retryNumber < 3
            ? { type: 'failed' as const, error: new Error('failed'), failure: retryNumber }
            : { type: 'complete' as const }
        )
      }) as Parameters<typeof runSessionScopedGenerationRetry>[0]['runAttempt'],
    })

    expect(observedIds).toEqual(['manual-attempt', 'retry-1', 'retry-2', 'retry-3'])
    expect(createRequestAttemptId).toHaveBeenCalledTimes(3)
  })

  it('keeps retry counters independent between sessions and messages', async () => {
    const observed: string[] = []
    const runFor = (sessionId: string, messageId: string) =>
      runRetry({
        sessionId,
        messageId,
        runAttempt: vi.fn(({ retryNumber, messageId: attemptMessageId }) => {
          observed.push(`${sessionId}:${attemptMessageId}:${retryNumber}`)
          return Promise.resolve(
            retryNumber === 0
              ? { type: 'failed' as const, error: new Error('failed'), failure: retryNumber }
              : { type: 'complete' as const }
          )
        }) as Parameters<typeof runSessionScopedGenerationRetry>[0]['runAttempt'],
      })

    await Promise.all([
      runFor('session-a', 'message-1'),
      runFor('session-a', 'message-2'),
      runFor('session-b', 'message-1'),
    ])

    expect(observed.filter((entry) => entry.startsWith('session-a:message-1'))).toEqual([
      'session-a:message-1:0',
      'session-a:message-1:1',
    ])
    expect(observed.filter((entry) => entry.startsWith('session-a:message-2'))).toEqual([
      'session-a:message-2:0',
      'session-a:message-2:1',
    ])
    expect(observed.filter((entry) => entry.startsWith('session-b'))).toEqual([
      'session-b:message-1:0',
      'session-b:message-1:1',
    ])
  })

  it('lets two sessions fail and retry independently while keeping each session attempt serial', async () => {
    const events: string[] = []
    const activeBySession = new Map<string, number>()
    const maxActiveBySession = new Map<string, number>()
    const retryStatuses = new Map<string, ReturnType<typeof createSessionRetryStatus>>()
    const attemptIds = new Map<string, Array<string | undefined>>()
    const initialA = deferred<void>()
    const initialB = deferred<void>()
    const waitA = deferred<void>()
    const waitB = deferred<void>()

    const runFor = (sessionId: string) =>
      runRetry({
        sessionId,
        messageId: `${sessionId}-assistant`,
        initialRequestAttemptId: `${sessionId}-initial`,
        createRequestAttemptId: vi.fn(() => `${sessionId}-retry-${crypto.randomUUID()}`),
        runAttempt: vi.fn(async ({ retryNumber, requestAttemptId }) => {
          const active = (activeBySession.get(sessionId) ?? 0) + 1
          activeBySession.set(sessionId, active)
          maxActiveBySession.set(sessionId, Math.max(maxActiveBySession.get(sessionId) ?? 0, active))
          attemptIds.set(sessionId, [...(attemptIds.get(sessionId) ?? []), requestAttemptId])
          events.push(`${sessionId}:${retryNumber}:start`)
          if (retryNumber === 0) {
            await (sessionId === 'session-a' ? initialA.promise : initialB.promise)
          }
          events.push(`${sessionId}:${retryNumber}:end`)
          activeBySession.set(sessionId, active - 1)
          return retryNumber === 0
            ? { type: 'failed' as const, error: new Error(`${sessionId}-local-failure`), failure: retryNumber }
            : { type: 'complete' as const }
        }),
        onRetryScheduled: vi.fn(({ scope, retryNumber }) => {
          retryStatuses.set(scope.sessionId, createSessionRetryStatus(retryNumber))
          return Promise.resolve()
        }),
        wait: vi.fn(() => (sessionId === 'session-a' ? waitA.promise : waitB.promise)),
      })

    const sessionA = runFor('session-a')
    const sessionB = runFor('session-b')

    await vi.waitFor(() => {
      expect(events).toEqual(expect.arrayContaining(['session-a:0:start', 'session-b:0:start']))
    })

    initialA.resolve()
    await vi.waitFor(() => expect(retryStatuses.get('session-a')).toEqual(createSessionRetryStatus(1)))
    expect(retryStatuses.has('session-b')).toBe(false)
    expect(events).not.toContain('session-a:1:start')
    expect(events).not.toContain('session-b:1:start')

    initialB.resolve()
    await vi.waitFor(() => expect(retryStatuses.get('session-b')).toEqual(createSessionRetryStatus(1)))
    expect(events).not.toContain('session-a:1:start')
    expect(events).not.toContain('session-b:1:start')

    waitB.resolve()
    await vi.waitFor(() => expect(events).toContain('session-b:1:start'))
    expect(events).not.toContain('session-a:1:start')

    waitA.resolve()
    await Promise.all([sessionA, sessionB])

    expect(maxActiveBySession).toEqual(
      new Map([
        ['session-a', 1],
        ['session-b', 1],
      ])
    )
    expect(retryStatuses).toEqual(
      new Map([
        ['session-a', { type: 'retrying', attempt: 1, maxAttempts: 5 }],
        ['session-b', { type: 'retrying', attempt: 1, maxAttempts: 5 }],
      ])
    )
    expect(events.slice(0, 2).sort()).toEqual(['session-a:0:start', 'session-b:0:start'])
    expect(events.filter((event) => event.endsWith(':1:start')).sort()).toEqual([
      'session-a:1:start',
      'session-b:1:start',
    ])
    expect(attemptIds.get('session-a')).toHaveLength(2)
    expect(attemptIds.get('session-b')).toHaveLength(2)
    expect(attemptIds.get('session-a')?.[0]).toBe('session-a-initial')
    expect(attemptIds.get('session-b')?.[0]).toBe('session-b-initial')
    expect(attemptIds.get('session-a')?.[1]).not.toBe(attemptIds.get('session-b')?.[1])
  })

  it('does not retry a local request-ID conflict, replay, or in-progress result', async () => {
    const errors = [
      new Error('Conflicting sub2api gateway request ID'),
      new Error('NaoNaoAI gateway returned an invalid response'),
      new Error(serializeSub2ApiError(new Sub2ApiError('redacted', 'REQUEST_ID_REPLAY'))),
      new Error(serializeSub2ApiError(new Sub2ApiError('redacted', 'REQUEST_IN_PROGRESS'))),
    ]

    for (const error of errors) {
      const runAttempt = vi.fn().mockResolvedValue({ type: 'failed', error, failure: 'failure' })
      const onFinalFailure = vi.fn()
      await runRetry({ runAttempt, onFinalFailure })
      expect(runAttempt).toHaveBeenCalledOnce()
      expect(onFinalFailure).toHaveBeenCalledOnce()
    }
  })

  it('cancels during backoff without starting the next request', async () => {
    const runAttempt = vi.fn().mockResolvedValue({
      type: 'failed',
      error: new Error('network failed'),
      failure: 'failure',
    })
    const onCancelled = vi.fn()

    await runRetry({
      runAttempt,
      onCancelled,
      wait: vi.fn((_delayMs, signal) => {
        const context = runAttempt.mock.calls[0][0]
        context.controller.abort()
        if (signal.aborted) {
          const error = new Error('aborted')
          error.name = 'AbortError'
          return Promise.reject(error)
        }
        return Promise.resolve()
      }),
    })

    expect(runAttempt).toHaveBeenCalledOnce()
    expect(onCancelled).toHaveBeenCalledOnce()
  })

  it('lets steer interrupt only retry backoff without starting the next attempt', async () => {
    const backoffStarted = deferred<void>()
    const runAttempt = vi.fn().mockResolvedValue({
      type: 'failed',
      error: new Error('network failed'),
      failure: 'failure',
    })
    const onCancelled = vi.fn()
    const pending = runRetry({
      runAttempt,
      onCancelled,
      wait: vi.fn((_delayMs, signal) => {
        backoffStarted.resolve()
        return new Promise<void>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              const error = new Error('aborted')
              error.name = 'AbortError'
              reject(error)
            },
            { once: true }
          )
        })
      }),
    })

    await backoffStarted.promise
    expect(interruptSessionRetryBackoff('session-1', 'message-1')).toBe(true)
    await pending

    expect(runAttempt).toHaveBeenCalledOnce()
    expect(onCancelled).toHaveBeenCalledOnce()
    expect(interruptSessionRetryBackoff('session-1', 'message-1')).toBe(false)
  })
})

describe('session retry policy', () => {
  it('exposes the per-message retry counter through the existing retrying status', () => {
    expect(createSessionRetryStatus(3)).toEqual({
      type: 'retrying',
      attempt: 3,
      maxAttempts: 5,
    })
  })

  it('does not retry explicit cancellation errors', () => {
    const error = new Error('The request was aborted')
    error.name = 'AbortError'
    expect(shouldRetrySessionGeneration(error)).toBe(false)
  })

  it('honors a server retry-after value and caps excessive delays', () => {
    const short = new Error(serializeSub2ApiError(new Sub2ApiError('redacted', 'RATE_LIMIT', 429, undefined, 3)))
    const long = new Error(serializeSub2ApiError(new Sub2ApiError('redacted', 'RATE_LIMIT', 429, undefined, 60)))

    expect(getSessionRetryDelayMs(short, 1)).toBe(3_000)
    expect(getSessionRetryDelayMs(long, 1)).toBe(30_000)
  })

  it('reads a Retry-After header from an API error response', () => {
    const error = Object.assign(new Error('Status Code 429'), {
      response: { headers: new Headers({ 'Retry-After': '7' }) },
    })

    expect(getSessionRetryDelayMs(error, 1)).toBe(7_000)
  })

  it('uses capped exponential backoff when the server provides no delay', () => {
    expect(getSessionRetryDelayMs(new Error('failed'), 1)).toBe(1_000)
    expect(getSessionRetryDelayMs(new Error('failed'), 2)).toBe(2_000)
    expect(getSessionRetryDelayMs(new Error('failed'), 5)).toBe(16_000)
  })
})

function runRetry(
  overrides: Partial<Parameters<typeof runSessionScopedGenerationRetry>[0]> & {
    runAttempt: Parameters<typeof runSessionScopedGenerationRetry>[0]['runAttempt']
  }
) {
  return runSessionScopedGenerationRetry({
    sessionId: 'session-1',
    messageId: 'message-1',
    createRequestAttemptId: vi.fn(() => crypto.randomUUID()),
    onRetryScheduled: vi.fn().mockResolvedValue(undefined),
    onFinalFailure: vi.fn().mockResolvedValue(undefined),
    onCancelled: vi.fn().mockResolvedValue(undefined),
    getDelayMs: vi.fn(() => 0),
    wait: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  })
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
