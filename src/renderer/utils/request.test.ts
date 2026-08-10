import { afterEach, describe, expect, it, vi } from 'vitest'

const platformMock = vi.hoisted(() => ({ type: 'desktop' as const }))

vi.mock('@/platform', () => ({ default: platformMock }))

import { apiRequest, DEFAULT_REQUEST_RETRIES, resolveDesktopProviderUrl } from './request'

describe('desktop provider request routing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    platformMock.type = 'desktop'
  })

  it('keeps the fixed sub2api Responses endpoint direct', () => {
    expect(resolveDesktopProviderUrl('https://naonaoai.shop/v1/responses?stream=true')).toBe(
      'https://naonaoai.shop/v1/responses?stream=true'
    )
  })

  it('keeps other provider URLs unchanged', () => {
    expect(resolveDesktopProviderUrl('https://api.openai.com/v1/chat/completions')).toBe(
      'https://api.openai.com/v1/chat/completions'
    )
  })

  it('uses the direct Responses URL for a POST while preserving request headers and body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('data: [DONE]\n\n', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest.post(
      'https://naonaoai.shop/v1/responses',
      { Authorization: 'Bearer test-key' },
      '{"model":"test-model","stream":true}',
      { retry: 0 }
    )

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(requestUrl).toBe('https://naonaoai.shop/v1/responses')
    expect(requestInit).toMatchObject({
      method: 'POST',
      body: '{"model":"test-model","stream":true}',
    })
    expect(new Headers(requestInit.headers).get('authorization')).toBe('Bearer test-key')
    expect(new Headers(requestInit.headers).get('content-type')).toBe('application/json')
  })

  it('uses the trusted main-process bridge for the direct sub2api request', async () => {
    const directGatewayRequest = vi.fn(async () => ({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: 'data: [DONE]\n\n',
    }))
    vi.stubGlobal('window', { electronAPI: { sub2api: { directGatewayRequest } } })

    const response = await apiRequest.post(
      'https://naonaoai.shop/v1/responses',
      { Authorization: 'Bearer test-key' },
      '{"model":"test-model","stream":true}',
      { retry: 0 }
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('data: [DONE]\n\n')
    expect(directGatewayRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://naonaoai.shop/v1/responses',
        method: 'POST',
        body: '{"model":"test-model","stream":true}',
      })
    )
  })

  it('retries a non-2xx response before returning a later successful response', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => new Response('temporarily unavailable', { status: 503 }))
      .mockImplementationOnce(async () => new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const responsePromise = apiRequest.get('https://api.example.com/v1/models', {})
    await vi.runAllTimersAsync()
    const response = await responsePromise

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uses five default retries before exposing the final API error', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockImplementation(async () => new Response('unavailable', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    const responsePromise = apiRequest.get('https://api.example.com/v1/models', {})
    const assertion = expect(responsePromise).rejects.toMatchObject({ statusCode: 503 })
    await vi.runAllTimersAsync()
    await assertion

    expect(DEFAULT_REQUEST_RETRIES).toBe(5)
    expect(fetchMock).toHaveBeenCalledTimes(DEFAULT_REQUEST_RETRIES + 1)
  })
})
