import { describe, expect, it, vi } from 'vitest'
import type { ModelDependencies } from '../../types/adapters'
import { createFetchWithProxy } from './fetch-proxy'

function createDependencies(apiRequest: ModelDependencies['request']['apiRequest']): ModelDependencies {
  return {
    request: {
      apiRequest,
      fetchWithOptions: vi.fn(),
    },
    storage: {
      saveImage: vi.fn(),
      getImage: vi.fn(),
    },
    sentry: {
      captureException: vi.fn(),
      withScope: vi.fn(),
    },
    getRemoteConfig: vi.fn(),
  }
}

describe('createFetchWithProxy', () => {
  it('uses five retries for provider POST requests by default', async () => {
    const apiRequest = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const fetchWithProxy = createFetchWithProxy(false, createDependencies(apiRequest))

    await fetchWithProxy('https://naonaoai.shop/v1/responses', {
      method: 'POST',
      body: '{"model":"test"}',
    })

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        retry: 5,
      })
    )
  })
})
