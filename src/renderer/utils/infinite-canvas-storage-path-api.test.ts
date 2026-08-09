import { describe, expect, it } from 'vitest'
import { getInfiniteCanvasStoragePathApi } from './infinite-canvas-storage-path-api'

describe('getInfiniteCanvasStoragePathApi', () => {
  it('accepts a complete storage path API', () => {
    const api = {
      getInfiniteCanvasStoragePath: async () => 'C:\\canvas-storage',
      chooseInfiniteCanvasStoragePath: async () => ({ canceled: true }),
    }

    expect(getInfiniteCanvasStoragePathApi(api)).toBe(api)
  })

  it('rejects a missing or incomplete preload API', () => {
    expect(getInfiniteCanvasStoragePathApi(undefined)).toBeNull()
    expect(
      getInfiniteCanvasStoragePathApi({ getInfiniteCanvasStoragePath: async () => 'C:\\canvas-storage' })
    ).toBeNull()
  })
})
