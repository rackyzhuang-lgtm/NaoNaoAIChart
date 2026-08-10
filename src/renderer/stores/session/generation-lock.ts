const sessionGenerationTails = new Map<string, Promise<void>>()
const inFlightGenerationTasks = new Map<string, Map<string, Promise<unknown>>>()

/**
 * Serializes message submission and background follow-up generation per session.
 * The queued tail is independent from the task result, so a failed generation
 * cannot poison later submissions.
 */
export function withSessionGenerationLock<T>(
  sessionId: string,
  task: () => Promise<T>,
  operationKey?: string
): Promise<T> {
  if (operationKey) {
    const existing = inFlightGenerationTasks.get(sessionId)?.get(operationKey)
    if (existing) {
      return existing as Promise<T>
    }
  }

  const queuedTask = runWithSessionGenerationLock(sessionId, task)
  if (!operationKey) {
    return queuedTask
  }

  let sessionTasks = inFlightGenerationTasks.get(sessionId)
  if (!sessionTasks) {
    sessionTasks = new Map()
    inFlightGenerationTasks.set(sessionId, sessionTasks)
  }
  sessionTasks.set(operationKey, queuedTask)
  void queuedTask.then(
    () => clearInFlightGenerationTask(sessionId, operationKey, queuedTask),
    () => clearInFlightGenerationTask(sessionId, operationKey, queuedTask)
  )
  return queuedTask
}

function clearInFlightGenerationTask(sessionId: string, operationKey: string, task: Promise<unknown>): void {
  const sessionTasks = inFlightGenerationTasks.get(sessionId)
  if (sessionTasks?.get(operationKey) !== task) return
  sessionTasks.delete(operationKey)
  if (sessionTasks.size === 0) {
    inFlightGenerationTasks.delete(sessionId)
  }
}

async function runWithSessionGenerationLock<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
  const previous = sessionGenerationTails.get(sessionId) ?? Promise.resolve()
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => gate)
  sessionGenerationTails.set(sessionId, tail)

  await previous
  try {
    return await task()
  } finally {
    release()
    if (sessionGenerationTails.get(sessionId) === tail) {
      sessionGenerationTails.delete(sessionId)
    }
  }
}

export function resetSessionGenerationLocksForTests(): void {
  sessionGenerationTails.clear()
  inFlightGenerationTasks.clear()
}
