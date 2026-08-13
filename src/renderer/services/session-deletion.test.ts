import { describe, expect, it, vi } from 'vitest'
import { deleteSessionStorageRecords } from './session-deletion'

function createStorage() {
  return {
    readSession: vi.fn(async () => ({ id: 'session-1' })),
    readMeta: vi.fn(async () => ({ id: 'session-1', archivedAt: 1 })),
    removeSession: vi.fn(async () => {}),
    removeMeta: vi.fn(async () => {}),
    restoreSession: vi.fn(async () => {}),
    restoreMeta: vi.fn(async () => {}),
    onRollbackFailure: vi.fn(),
  }
}

describe('deleteSessionStorageRecords', () => {
  it('removes the session body before its metadata', async () => {
    const storage = createStorage()

    await deleteSessionStorageRecords(storage)

    expect(storage.removeSession).toHaveBeenCalledOnce()
    expect(storage.removeMeta).toHaveBeenCalledOnce()
    expect(storage.removeSession.mock.invocationCallOrder[0]).toBeLessThan(
      storage.removeMeta.mock.invocationCallOrder[0]
    )
    expect(storage.restoreSession).not.toHaveBeenCalled()
    expect(storage.restoreMeta).not.toHaveBeenCalled()
  })

  it('restores both records when metadata deletion fails', async () => {
    const storage = createStorage()
    storage.removeMeta.mockRejectedValueOnce(new Error('metadata unavailable'))

    await expect(deleteSessionStorageRecords(storage)).rejects.toThrow('metadata unavailable')

    expect(storage.restoreSession).toHaveBeenCalledWith({ id: 'session-1' })
    expect(storage.restoreMeta).toHaveBeenCalledWith({ id: 'session-1', archivedAt: 1 })
  })

  it('reports rollback failures while preserving the original deletion error', async () => {
    const storage = createStorage()
    storage.removeSession.mockRejectedValueOnce(new Error('session storage unavailable'))
    storage.restoreSession.mockRejectedValueOnce(new Error('session rollback unavailable'))

    await expect(deleteSessionStorageRecords(storage)).rejects.toThrow('session storage unavailable')
    expect(storage.onRollbackFailure).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'session rollback unavailable' })
    )
  })
})
