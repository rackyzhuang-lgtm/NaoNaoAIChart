export const TEST_CACHE_ENV = 'NAONAOAI_CLEAR_CACHES_ON_STARTUP'

export interface TestCacheSession {
  clearCache(): Promise<void>
  clearStorageData(options: { storages: TestCacheStorageName[] }): Promise<void>
}

export type TestCacheStorageName = 'cachestorage' | 'shadercache' | 'serviceworkers'

export interface TestCacheOptions {
  session: TestCacheSession
  clearModelRegistryCache: () => Promise<void>
  env?: NodeJS.ProcessEnv
}

export function isStartupCacheClearingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return ['1', 'true', 'yes', 'on'].includes((env[TEST_CACHE_ENV] || '').trim().toLowerCase())
}

/**
 * Clear only data that Chromium/models.dev can rebuild. Durable app data is intentionally excluded.
 */
export async function clearStartupTestCaches(options: TestCacheOptions): Promise<void> {
  if (!isStartupCacheClearingEnabled(options.env)) return

  await options.session.clearCache()
  await options.session.clearStorageData({
    storages: ['cachestorage', 'shadercache', 'serviceworkers'],
  })
  await options.clearModelRegistryCache()
}
