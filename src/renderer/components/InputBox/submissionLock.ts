export interface SubmissionLock {
  current: boolean
}

/** Acquire synchronously so repeated UI events cannot enter before React rerenders. */
export function acquireSubmissionLock(lock: SubmissionLock): boolean {
  if (lock.current) return false
  lock.current = true
  return true
}

export function releaseSubmissionLock(lock: SubmissionLock): void {
  lock.current = false
}
