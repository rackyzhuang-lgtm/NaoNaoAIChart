import { describe, expect, test, vi } from 'vitest'
import { clearStartupTestCaches, isStartupCacheClearingEnabled, TEST_CACHE_ENV } from './test-cache'

describe('startup test cache clearing', () => {
  test('requires an explicit opt-in environment flag', () => {
    expect(isStartupCacheClearingEnabled({})).toBe(false)
    expect(isStartupCacheClearingEnabled({ [TEST_CACHE_ENV]: '1' })).toBe(true)
    expect(isStartupCacheClearingEnabled({ [TEST_CACHE_ENV]: 'false' })).toBe(false)
  })

  test('clears rebuildable caches without touching durable data', async () => {
    const session = {
      clearCache: vi.fn().mockResolvedValue(undefined),
      clearStorageData: vi.fn().mockResolvedValue(undefined),
    }
    const clearModelRegistryCache = vi.fn().mockResolvedValue(undefined)

    await clearStartupTestCaches({
      session,
      clearModelRegistryCache,
      env: { [TEST_CACHE_ENV]: 'true' },
    })

    expect(session.clearCache).toHaveBeenCalledOnce()
    expect(session.clearStorageData).toHaveBeenCalledWith({
      storages: ['cachestorage', 'shadercache', 'serviceworkers'],
    })
    expect(clearModelRegistryCache).toHaveBeenCalledOnce()
  })

  test('does nothing when the flag is disabled', async () => {
    const session = {
      clearCache: vi.fn().mockResolvedValue(undefined),
      clearStorageData: vi.fn().mockResolvedValue(undefined),
    }
    const clearModelRegistryCache = vi.fn().mockResolvedValue(undefined)

    await clearStartupTestCaches({ session, clearModelRegistryCache, env: {} })

    expect(session.clearCache).not.toHaveBeenCalled()
    expect(session.clearStorageData).not.toHaveBeenCalled()
    expect(clearModelRegistryCache).not.toHaveBeenCalled()
  })
})
