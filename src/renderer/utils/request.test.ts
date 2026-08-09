import { afterEach, describe, expect, it, vi } from 'vitest'

const platformMock = vi.hoisted(() => ({
  type: 'desktop' as const,
  getInfiniteCanvasUrl: vi.fn(),
}))

vi.mock('@/platform', () => ({ default: platformMock }))

import { apiRequest, resolveDesktopProviderUrl } from './request'

describe('desktop provider request routing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    platformMock.type = 'desktop'
  })

  it('routes the fixed sub2api gateway through the app loopback proxy', async () => {
    platformMock.getInfiniteCanvasUrl.mockResolvedValue('http://127.0.0.1:45678/')

    await expect(resolveDesktopProviderUrl('https://naonaoai.shop/v1/chat/completions?stream=true')).resolves.toBe(
      'http://127.0.0.1:45678/_naonao_proxy/naonaoai.shop/v1/chat/completions?stream=true'
    )
  })

  it('keeps other provider URLs unchanged', async () => {
    platformMock.getInfiniteCanvasUrl.mockResolvedValue('http://127.0.0.1:45678/')

    await expect(resolveDesktopProviderUrl('https://api.openai.com/v1/chat/completions')).resolves.toBe(
      'https://api.openai.com/v1/chat/completions'
    )
  })

  it('uses the rewritten URL for a POST while preserving request headers and body', async () => {
    platformMock.getInfiniteCanvasUrl.mockResolvedValue('http://127.0.0.1:45678/')
    const fetchMock = vi.fn().mockResolvedValue(new Response('data: [DONE]\n\n', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest.post(
      'https://naonaoai.shop/v1/chat/completions',
      { Authorization: 'Bearer test-key' },
      '{"model":"test-model","stream":true}',
      { retry: 0 }
    )

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(requestUrl).toBe('http://127.0.0.1:45678/_naonao_proxy/naonaoai.shop/v1/chat/completions')
    expect(requestInit).toMatchObject({
      method: 'POST',
      body: '{"model":"test-model","stream":true}',
    })
    expect(new Headers(requestInit.headers).get('authorization')).toBe('Bearer test-key')
    expect(new Headers(requestInit.headers).get('content-type')).toBe('application/json')
  })
})
