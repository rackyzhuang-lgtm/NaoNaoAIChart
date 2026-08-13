import { describe, expect, it } from 'vitest'
import { acquireSubmissionLock, releaseSubmissionLock } from './submissionLock'

describe('submissionLock', () => {
  it('allows only one submit until the active submit releases the lock', () => {
    const lock = { current: false }

    expect(acquireSubmissionLock(lock)).toBe(true)
    expect(acquireSubmissionLock(lock)).toBe(false)

    releaseSubmissionLock(lock)
    expect(acquireSubmissionLock(lock)).toBe(true)
  })
})
