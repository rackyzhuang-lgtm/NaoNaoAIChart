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
  it('disables retries for fixed sub2api POST requests', async () => {
    const apiRequest = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const fetchWithProxy = createFetchWithProxy(false, createDependencies(apiRequest))

    await fetchWithProxy('https://naonaoai.shop/v1/responses', {
      method: 'POST',
      body: '{"model":"test"}',
    })

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        retry: 0,
      })
    )
  })

  it('keeps five retries for other provider POST requests', async () => {
    const apiRequest = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const fetchWithProxy = createFetchWithProxy(false, createDependencies(apiRequest))

    await fetchWithProxy('https://api.example.com/v1/responses', {
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

  it('derives stable request IDs for each provider step in one logical generation', async () => {
    const firstApiRequest = vi.fn<ModelDependencies['request']['apiRequest']>(
      async () => new Response(null, { status: 200 })
    )
    const firstFetch = createFetchWithProxy(false, createDependencies(firstApiRequest), {
      requestId: 'assistant-message-1',
      requestSequence: 2,
    })

    await firstFetch('https://naonaoai.shop/v1/responses', { method: 'POST' })
    await firstFetch('https://naonaoai.shop/v1/responses', { method: 'POST' })
    const firstIds = firstApiRequest.mock.calls.map(([options]) => options.requestId)

    const repeatedApiRequest = vi.fn<ModelDependencies['request']['apiRequest']>(
      async () => new Response(null, { status: 200 })
    )
    const repeatedFetch = createFetchWithProxy(false, createDependencies(repeatedApiRequest), {
      requestId: 'assistant-message-1',
      requestSequence: 2,
    })
    await repeatedFetch('https://naonaoai.shop/v1/responses', { method: 'POST' })
    await repeatedFetch('https://naonaoai.shop/v1/responses', { method: 'POST' })

    expect(firstIds[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(firstIds[1]).toMatch(/^[0-9a-f-]{36}$/)
    expect(firstIds[1]).not.toBe(firstIds[0])
    expect(repeatedApiRequest.mock.calls.map(([options]) => options.requestId)).toEqual(firstIds)
  })
})
