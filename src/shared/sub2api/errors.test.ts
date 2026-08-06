import { describe, expect, it } from 'vitest'
import {
  classifySub2ApiError,
  parseSub2ApiIpcError,
  Sub2ApiContractError,
  Sub2ApiError,
  serializeSub2ApiError,
} from './errors'

describe('sub2api error classification', () => {
  it.each([
    ['SESSION_EXPIRED', 'session_expired'],
    ['NETWORK_ERROR', 'network'],
    ['TIMEOUT_ERROR', 'timeout'],
  ] as const)('classifies %s as %s', (code, kind) => {
    expect(classifySub2ApiError(new Sub2ApiError('internal detail', code))).toMatchObject({ kind })
  })

  it('classifies rate limits and preserves only bounded retry metadata', () => {
    const error = new Sub2ApiError('server detail', 'RATE_LIMIT', 429, undefined, 12)
    expect(classifySub2ApiError(error)).toEqual({ kind: 'rate_limited', status: 429, retryAfterSeconds: 12 })
    expect(parseSub2ApiIpcError(new Error(serializeSub2ApiError(error)))).toEqual({
      kind: 'rate_limited',
      status: 429,
      retryAfterSeconds: 12,
    })
  })

  it('does not expose raw messages or malformed descriptors over IPC', () => {
    const serialized = serializeSub2ApiError(new Sub2ApiError('contains a token', 'AUTH', 401))
    expect(serialized).not.toContain('contains a token')
    expect(parseSub2ApiIpcError(new Error('__NAONAO_SUB2API_ERROR__{"kind":"unknown","status":"bad"}'))).toEqual({
      kind: 'unknown',
      status: undefined,
      retryAfterSeconds: undefined,
    })
    expect(classifySub2ApiError(new Sub2ApiContractError())).toEqual({ kind: 'invalid_response' })
  })
})
