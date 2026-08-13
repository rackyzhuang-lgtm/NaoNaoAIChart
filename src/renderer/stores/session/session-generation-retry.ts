import { parseSub2ApiIpcError } from '@shared/sub2api/errors'
import type { MessageStatus } from '@shared/types'

export const MAX_SESSION_GENERATION_RETRIES = 5
export const SESSION_RETRY_INITIAL_DELAY_MS = 1_000
export const SESSION_RETRY_MAX_DELAY_MS = 30_000

const retryBackoffs = new Map<string, AbortController>()

export interface SessionRetryScope {
  sessionId: string
  messageId: string
}

export interface SessionRetryAttemptContext extends SessionRetryScope {
  /** Zero for the original request, then 1..MAX_SESSION_GENERATION_RETRIES. */
  retryNumber: number
  /** Undefined for the original request unless its caller already supplied one. */
  requestAttemptId?: string
  controller: AbortController
}

export type SessionRetryAttemptResult<TFailure> =
  | { type: 'complete' }
  | { type: 'failed'; error: unknown; failure: TFailure }

export function createSessionRetryStatus(retryNumber: number): MessageStatus {
  return {
    type: 'retrying',
    attempt: retryNumber,
    maxAttempts: MAX_SESSION_GENERATION_RETRIES,
  }
}

interface RunSessionScopedGenerationRetryOptions<TFailure> extends SessionRetryScope {
  initialRequestAttemptId?: string
  createRequestAttemptId: () => string
  runAttempt: (context: SessionRetryAttemptContext) => Promise<SessionRetryAttemptResult<TFailure>>
  onRetryScheduled: (options: {
    scope: SessionRetryScope
    retryNumber: number
    maxRetries: number
    error: unknown
    controller: AbortController
  }) => Promise<void>
  onFinalFailure: (failure: TFailure, error: unknown) => Promise<void>
  onCancelled: () => Promise<void>
  shouldRetry?: (error: unknown) => boolean
  getDelayMs?: (error: unknown, retryNumber: number) => number
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>
}

/**
 * Runs one logical assistant generation as strictly serial network attempts.
 * The retry counter belongs to this session/message invocation and is never
 * shared with another window or message.
 */
export async function runSessionScopedGenerationRetry<TFailure>(
  options: RunSessionScopedGenerationRetryOptions<TFailure>
): Promise<void> {
  const controller = new AbortController()
  const shouldRetry = options.shouldRetry ?? shouldRetrySessionGeneration
  const getDelayMs = options.getDelayMs ?? getSessionRetryDelayMs
  const wait = options.wait ?? waitForSessionRetry

  for (let retryNumber = 0; retryNumber <= MAX_SESSION_GENERATION_RETRIES; retryNumber += 1) {
    const result = await options.runAttempt({
      sessionId: options.sessionId,
      messageId: options.messageId,
      retryNumber,
      requestAttemptId: retryNumber === 0 ? options.initialRequestAttemptId : options.createRequestAttemptId(),
      controller,
    })

    if (result.type === 'complete') {
      return
    }

    if (controller.signal.aborted || retryNumber === MAX_SESSION_GENERATION_RETRIES || !shouldRetry(result.error)) {
      if (controller.signal.aborted) {
        await options.onCancelled()
      } else {
        await options.onFinalFailure(result.failure, result.error)
      }
      return
    }

    const nextRetryNumber = retryNumber + 1
    await options.onRetryScheduled({
      scope: { sessionId: options.sessionId, messageId: options.messageId },
      retryNumber: nextRetryNumber,
      maxRetries: MAX_SESSION_GENERATION_RETRIES,
      error: result.error,
      controller,
    })

    try {
      const backoffKey = retryBackoffKey(options.sessionId, options.messageId)
      retryBackoffs.set(backoffKey, controller)
      try {
        await wait(getDelayMs(result.error, nextRetryNumber), controller.signal)
      } finally {
        if (retryBackoffs.get(backoffKey) === controller) {
          retryBackoffs.delete(backoffKey)
        }
      }
    } catch (error) {
      if (!controller.signal.aborted && !isAbortLikeError(error)) {
        throw error
      }
      await options.onCancelled()
      return
    }
  }
}

/** Abort only a scheduled backoff. Active provider attempts are never registered here. */
export function interruptSessionRetryBackoff(sessionId: string, messageId?: string): boolean {
  let interrupted = false
  for (const [key, controller] of retryBackoffs) {
    if (key === retryBackoffKey(sessionId, messageId) || (!messageId && key.startsWith(`${sessionId}:`))) {
      controller.abort()
      interrupted = true
    }
  }
  return interrupted
}

function retryBackoffKey(sessionId: string, messageId?: string): string {
  return `${sessionId}:${messageId ?? ''}`
}

export function shouldRetrySessionGeneration(error: unknown): boolean {
  if (isAbortLikeError(error)) {
    return false
  }

  const messages = collectErrorMessages(error)
  if (
    messages.some((message) =>
      /request[_ -]?id[_ -]?(?:conflict|replay)|conflicting .*request id|request .*already accepted|request[_ -]?in[_ -]?progress|gateway returned an invalid response/i.test(
        message
      )
    )
  ) {
    return false
  }

  const descriptor = findSub2ApiDescriptor(error)
  // The IPC contract intentionally redacts the concrete local error code.
  // These two descriptor shapes include request-ID conflict/replay/in-progress,
  // so fail closed instead of risking a second billable request.
  if (descriptor?.kind === 'invalid_response') {
    return false
  }
  if (descriptor?.kind === 'service_error' && descriptor.status === undefined) {
    return false
  }

  return true
}

export function getSessionRetryDelayMs(error: unknown, retryNumber: number): number {
  const retryAfterMs = getRetryAfterMs(error)
  if (retryAfterMs !== undefined) {
    return Math.min(retryAfterMs, SESSION_RETRY_MAX_DELAY_MS)
  }

  const exponent = Math.max(0, retryNumber - 1)
  return Math.min(SESSION_RETRY_INITIAL_DELAY_MS * 2 ** exponent, SESSION_RETRY_MAX_DELAY_MS)
}

export function waitForSessionRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(createAbortError())
  }

  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(
      () => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      },
      Math.max(0, delayMs)
    )
    const onAbort = () => {
      globalThis.clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(createAbortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function getRetryAfterMs(error: unknown): number | undefined {
  const descriptor = findSub2ApiDescriptor(error)
  if (descriptor?.retryAfterSeconds !== undefined) {
    return descriptor.retryAfterSeconds * 1_000
  }

  for (const value of walkErrorChain(error)) {
    if (!value || typeof value !== 'object') continue
    const record = value as Record<string, unknown>
    const headerValue =
      readHeader(record.responseHeaders, 'retry-after') ??
      readHeader(record.headers, 'retry-after') ??
      readHeader(
        record.response && typeof record.response === 'object'
          ? (record.response as Record<string, unknown>).headers
          : undefined,
        'retry-after'
      )
    const parsed = parseRetryAfterHeader(headerValue)
    if (parsed !== undefined) return parsed
  }
  return undefined
}

function readHeader(headers: unknown, name: string): string | undefined {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return headers.get(name) ?? undefined
  }
  if (!headers || typeof headers !== 'object') return undefined
  const record = headers as Record<string, unknown>
  const value = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()]
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined
}

function parseRetryAfterHeader(value: string | undefined): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000
  }
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return undefined
  return Math.max(0, timestamp - Date.now())
}

function findSub2ApiDescriptor(error: unknown): ReturnType<typeof parseSub2ApiIpcError> {
  for (const value of walkErrorChain(error)) {
    const descriptor = parseSub2ApiIpcError(value)
    if (descriptor) return descriptor
  }
  return null
}

function collectErrorMessages(error: unknown): string[] {
  return walkErrorChain(error)
    .map((value) => (value instanceof Error ? value.message : typeof value === 'string' ? value : undefined))
    .filter((value): value is string => Boolean(value))
}

function walkErrorChain(error: unknown): unknown[] {
  const values: unknown[] = []
  const pending = [error]
  const seen = new Set<unknown>()

  while (pending.length > 0 && values.length < 12) {
    const value = pending.shift()
    if (value === undefined || value === null || seen.has(value)) continue
    seen.add(value)
    values.push(value)
    if (typeof value !== 'object') continue
    const record = value as Record<string, unknown>
    for (const key of ['cause', 'error', 'lastError']) {
      if (record[key] !== undefined) pending.push(record[key])
    }
  }
  return values
}

function isAbortLikeError(error: unknown): boolean {
  return walkErrorChain(error).some((value) => {
    if (typeof DOMException !== 'undefined' && value instanceof DOMException && value.name === 'AbortError') return true
    if (!(value instanceof Error)) return false
    return value.name === 'AbortError' || /(?:request was )?abort(?:ed)?|request cancel(?:led|ed)/i.test(value.message)
  })
}

function createAbortError(): Error {
  const error = new Error('The request was aborted')
  error.name = 'AbortError'
  return error
}
