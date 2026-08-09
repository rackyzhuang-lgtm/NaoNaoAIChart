import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLocalStorageUsage } from '../../../vendor/infinite-canvas/web/src/services/local-storage-usage'

describe('readLocalStorageUsage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns empty usage when browser storage APIs are unavailable', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('indexedDB', undefined)

    await expect(readLocalStorageUsage()).resolves.toEqual({
      usage: 0,
      quota: 0,
      contentBytes: 0,
      databases: [{ name: 'infinite-canvas', version: 0, bytes: 0, stores: [] }],
    })
  })

  it('returns empty usage when the storage estimate and IndexedDB open fail', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        estimate: vi.fn().mockRejectedValue(new Error('Storage estimate is unavailable')),
      },
    })
    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => {
        throw new Error('IndexedDB is unavailable')
      }),
    })

    await expect(readLocalStorageUsage()).resolves.toEqual({
      usage: 0,
      quota: 0,
      contentBytes: 0,
      databases: [{ name: 'infinite-canvas', version: 0, bytes: 0, stores: [] }],
    })
  })
})
