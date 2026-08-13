export type Sub2ApiErrorCode = number | string

export type Sub2ApiErrorKind =
  | 'session_expired'
  | 'authentication_failed'
  | 'network'
  | 'timeout'
  | 'rate_limited'
  | 'feature_unavailable'
  | 'invalid_response'
  | 'service_error'
  | 'unknown'

export interface Sub2ApiErrorDescriptor {
  kind: Sub2ApiErrorKind
  status?: number
  retryAfterSeconds?: number
}

const SUB2API_IPC_ERROR_PREFIX = '__NAONAOAI_SUB2API_ERROR__'
const SESSION_ERROR_CODES = new Set(['NOT_AUTHENTICATED', 'REFRESH_TOKEN_MISSING', 'SESSION_EXPIRED'])
const NETWORK_ERROR_CODES = new Set(['NETWORK_ERROR', 'REQUEST_CANCELLED'])
const INVALID_RESPONSE_CODES = new Set(['INVALID_RESPONSE', 'REQUEST_ID_CONFLICT', 'REQUEST_ID_REPLAY'])
const SERVICE_ERROR_CODES = new Set(['GATEWAY_ERROR', 'REQUEST_IN_PROGRESS'])
const ERROR_KINDS = new Set<Sub2ApiErrorKind>([
  'session_expired',
  'authentication_failed',
  'network',
  'timeout',
  'rate_limited',
  'feature_unavailable',
  'invalid_response',
  'service_error',
  'unknown',
])

export class Sub2ApiError extends Error {
  constructor(
    message: string,
    public readonly code: Sub2ApiErrorCode,
    public readonly status?: number,
    public readonly reason?: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(message)
    this.name = 'Sub2ApiError'
  }
}

export class Sub2ApiContractError extends Sub2ApiError {
  constructor(message = 'sub2api returned an unexpected response') {
    super(message, 'INVALID_RESPONSE')
    this.name = 'Sub2ApiContractError'
  }
}

export function classifySub2ApiError(error: unknown): Sub2ApiErrorDescriptor {
  if (error instanceof Sub2ApiContractError) {
    return { kind: 'invalid_response' }
  }
  if (!(error instanceof Sub2ApiError)) {
    return { kind: 'unknown' }
  }

  const code = String(error.code)
  if (SESSION_ERROR_CODES.has(code)) {
    return { kind: 'session_expired', status: 401 }
  }
  if (NETWORK_ERROR_CODES.has(code)) {
    return { kind: 'network' }
  }
  if (code === 'TIMEOUT_ERROR') {
    return { kind: 'timeout' }
  }
  if (error.status === 429) {
    return { kind: 'rate_limited', status: 429, retryAfterSeconds: error.retryAfterSeconds }
  }
  if (error.status === 403 || error.status === 404) {
    return { kind: 'feature_unavailable', status: error.status }
  }
  if (error.status === 401) {
    return { kind: 'authentication_failed', status: 401 }
  }
  if (error.status !== undefined) {
    return { kind: 'service_error', status: error.status }
  }
  if (INVALID_RESPONSE_CODES.has(code)) {
    return { kind: 'invalid_response' }
  }
  if (SERVICE_ERROR_CODES.has(code)) {
    return { kind: 'service_error' }
  }
  return { kind: 'unknown' }
}

export function serializeSub2ApiError(error: Sub2ApiError): string {
  return `${SUB2API_IPC_ERROR_PREFIX}${JSON.stringify(classifySub2ApiError(error))}`
}

export function parseSub2ApiIpcError(error: unknown): Sub2ApiErrorDescriptor | null {
  if (!(error instanceof Error)) {
    return null
  }
  const markerIndex = error.message.indexOf(SUB2API_IPC_ERROR_PREFIX)
  if (markerIndex < 0) {
    return null
  }

  try {
    const parsed = JSON.parse(error.message.slice(markerIndex + SUB2API_IPC_ERROR_PREFIX.length)) as Record<
      string,
      unknown
    >
    if (typeof parsed.kind !== 'string' || !ERROR_KINDS.has(parsed.kind as Sub2ApiErrorKind)) {
      return null
    }
    const status = typeof parsed.status === 'number' && Number.isInteger(parsed.status) ? parsed.status : undefined
    const retryAfterSeconds =
      typeof parsed.retryAfterSeconds === 'number' &&
      Number.isInteger(parsed.retryAfterSeconds) &&
      parsed.retryAfterSeconds >= 0 &&
      parsed.retryAfterSeconds <= 86_400
        ? parsed.retryAfterSeconds
        : undefined
    return { kind: parsed.kind as Sub2ApiErrorKind, status, retryAfterSeconds }
  } catch {
    return null
  }
}
