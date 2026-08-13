type SessionDeletionStorage<TSession, TMeta> = {
  readSession: () => Promise<TSession | null>
  readMeta: () => Promise<TMeta | null>
  removeSession: () => Promise<void>
  removeMeta: () => Promise<void>
  restoreSession: (session: TSession) => Promise<void>
  restoreMeta: (meta: TMeta) => Promise<void>
  onRollbackFailure?: (error: unknown) => void
}

export async function deleteSessionStorageRecords<TSession, TMeta>(
  storage: SessionDeletionStorage<TSession, TMeta>
): Promise<void> {
  const [sessionSnapshot, metaSnapshot] = await Promise.all([storage.readSession(), storage.readMeta()])

  try {
    await storage.removeSession()
    await storage.removeMeta()
  } catch (error) {
    const rollbacks: Promise<void>[] = []
    if (sessionSnapshot) rollbacks.push(storage.restoreSession(sessionSnapshot))
    if (metaSnapshot) rollbacks.push(storage.restoreMeta(metaSnapshot))
    const results = await Promise.allSettled(rollbacks)
    for (const result of results) {
      if (result.status === 'rejected') storage.onRollbackFailure?.(result.reason)
    }
    throw error
  }
}
