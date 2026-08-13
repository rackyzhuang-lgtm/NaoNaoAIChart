import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/models/errors'
import type { Sub2ApiDirectGatewayStreamEvent } from '../../shared/sub2api/contracts'
import { getSessionRetryDelayMs } from '../stores/session/session-generation-retry'

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

  it('keeps non-gateway POST headers and body unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('data: [DONE]\n\n', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest.post(
      'https://api.example.com/v1/responses',
      { Authorization: 'Bearer test-key' },
      '{"model":"test-model","stream":true}',
      { retry: 0 }
    )

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(requestUrl).toBe('https://api.example.com/v1/responses')
    expect(requestInit).toMatchObject({
      method: 'POST',
      body: '{"model":"test-model","stream":true}',
    })
    expect(new Headers(requestInit.headers).get('authorization')).toBe('Bearer test-key')
    expect(new Headers(requestInit.headers).get('content-type')).toBe('application/json')
  })

  it('uses one request ID for the trusted main-process stream bridge', async () => {
    const logicalRequestId = '77777777-7777-4777-8777-777777777777'
    const openDirectGatewayStream = vi.fn(
      (requestId: string, _request: unknown, onEvent: (event: Sub2ApiDirectGatewayStreamEvent) => void) => {
        onEvent({ requestId, type: 'response', status: 200, headers: { 'content-type': 'text/event-stream' } })
        onEvent({ requestId, type: 'data', data: 'data: [DONE]\n\n' })
        onEvent({ requestId, type: 'complete' })
        return Promise.resolve({ requestId })
      }
    )
    vi.stubGlobal('window', { electronAPI: { sub2api: { openDirectGatewayStream } } })

    const response = await apiRequest.post(
      'https://naonaoai.shop/v1/responses',
      { Authorization: 'Bearer test-key' },
      '{"model":"test-model","stream":true}',
      { retry: 0, requestId: logicalRequestId }
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('data: [DONE]\n\n')
    expect(openDirectGatewayStream).toHaveBeenCalledWith(
      logicalRequestId,
      expect.objectContaining({
        url: 'https://naonaoai.shop/v1/responses',
        method: 'POST',
        body: '{"model":"test-model","stream":true}',
        headers: expect.objectContaining({ 'cache-control': 'no-cache, no-store, max-age=0' }),
      }),
      expect.any(Function)
    )
  })

  it('does not retry a direct sub2api POST after the gateway request fails', async () => {
    const openDirectGatewayStream = vi.fn().mockRejectedValue(new Error('gateway unavailable'))
    vi.stubGlobal('window', { electronAPI: { sub2api: { openDirectGatewayStream } } })

    await expect(
      apiRequest.post(
        'https://naonaoai.shop/v1/responses',
        { Authorization: 'Bearer test-key' },
        '{"model":"test-model","stream":true}',
        { retry: 5 }
      )
    ).rejects.toThrow('gateway unavailable')

    expect(openDirectGatewayStream).toHaveBeenCalledTimes(1)
  })

  it('rejects an active request ID reused with a different body', async () => {
    let emit: ((event: Sub2ApiDirectGatewayStreamEvent) => void) | undefined
    const requestId = '88888888-8888-4888-8888-888888888888'
    const openDirectGatewayStream = vi.fn(
      (id: string, _request: unknown, onEvent: (event: Sub2ApiDirectGatewayStreamEvent) => void) => {
        emit = onEvent
        return Promise.resolve({ requestId: id })
      }
    )
    vi.stubGlobal('window', { electronAPI: { sub2api: { openDirectGatewayStream } } })

    const first = apiRequest.post('https://naonaoai.shop/v1/responses', {}, '{"input":"first"}', {
      requestId,
      retry: 0,
    })
    await vi.waitFor(() => expect(emit).toBeDefined())
    await expect(
      apiRequest.post('https://naonaoai.shop/v1/responses', {}, '{"input":"different"}', {
        requestId,
        retry: 0,
      })
    ).rejects.toThrow('Conflicting sub2api gateway request ID')
    expect(openDirectGatewayStream).toHaveBeenCalledOnce()

    emit?.({ requestId, type: 'response', status: 200, headers: { 'content-type': 'text/event-stream' } })
    emit?.({ requestId, type: 'data', data: 'data: [DONE]\n\n' })
    emit?.({ requestId, type: 'complete' })
    await expect(first.then((response) => response.text())).resolves.toBe('data: [DONE]\n\n')
  })

  it('rejects a bodyless response when the bridge reports a terminal error', async () => {
    let emit: ((event: Sub2ApiDirectGatewayStreamEvent) => void) | undefined
    let requestId = ''
    const openDirectGatewayStream = vi.fn(
      (id: string, _request: unknown, onEvent: (event: Sub2ApiDirectGatewayStreamEvent) => void) => {
        requestId = id
        emit = onEvent
        return Promise.resolve({ requestId: id })
      }
    )
    vi.stubGlobal('window', { electronAPI: { sub2api: { openDirectGatewayStream } } })

    const response = apiRequest.post('https://naonaoai.shop/v1/responses', {}, '{"stream":true}', { retry: 0 })
    await vi.waitFor(() => expect(emit).toBeDefined())
    emit?.({ requestId, type: 'response', status: 204, headers: { 'content-type': 'text/event-stream' } })
    emit?.({ requestId, type: 'error', error: 'gateway stream ended early' })

    await expect(response).rejects.toThrow('NaoNaoAI gateway request failed')
    expect(openDirectGatewayStream).toHaveBeenCalledOnce()
  })

  it('does not expose the private IPC marker for a known gateway error', async () => {
    const openDirectGatewayStream = vi.fn(
      (requestId: string, _request: unknown, onEvent: (event: Sub2ApiDirectGatewayStreamEvent) => void) => {
        onEvent({
          requestId,
          type: 'error',
          error: '__NAONAOAI_SUB2API_ERROR__{"kind":"service_error","status":503}',
        })
        return Promise.resolve({ requestId })
      }
    )
    vi.stubGlobal('window', { electronAPI: { sub2api: { openDirectGatewayStream } } })

    const error = await apiRequest
      .post('https://naonaoai.shop/v1/responses', {}, '{"stream":true}', { retry: 5 })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('NaoNaoAI gateway request failed (HTTP 503)')
    expect((error as Error).message).not.toContain('__NAONAOAI_SUB2API_ERROR__')
    expect(openDirectGatewayStream).toHaveBeenCalledOnce()
  })

  it('preserves only Retry-After for a fixed-gateway HTTP error', async () => {
    const openDirectGatewayStream = vi.fn(
      (requestId: string, _request: unknown, onEvent: (event: Sub2ApiDirectGatewayStreamEvent) => void) => {
        onEvent({
          requestId,
          type: 'response',
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': '7',
            authorization: 'Bearer should-not-be-exposed',
            'x-request-id': 'safe-upstream-id',
          },
        })
        onEvent({ requestId, type: 'data', data: '{"error":"rate limited"}' })
        onEvent({ requestId, type: 'complete' })
        return Promise.resolve({ requestId })
      }
    )
    vi.stubGlobal('window', { electronAPI: { sub2api: { openDirectGatewayStream } } })

    const error = await apiRequest
      .post('https://naonaoai.shop/v1/responses', { Authorization: 'Bearer client-key' }, '{"stream":true}', {
        retry: 5,
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).statusCode).toBe(429)
    expect((error as ApiError).responseHeaders).toEqual({ 'retry-after': '7' })
    expect((error as ApiError).responseHeaders).not.toHaveProperty('authorization')
    expect((error as ApiError).responseBody).toBeUndefined()
    expect(JSON.stringify(error)).not.toContain('rate limited')
    expect(JSON.stringify(error)).not.toContain('Bearer should-not-be-exposed')
    expect(getSessionRetryDelayMs(error, 1)).toBe(7_000)
    expect(openDirectGatewayStream).toHaveBeenCalledOnce()
  })

  it('delivers a stream chunk before the terminal event', async () => {
    let emit: ((event: Sub2ApiDirectGatewayStreamEvent) => void) | undefined
    let requestId = ''
    const releaseDirectGatewayStream = vi.fn()
    const openDirectGatewayStream = vi.fn(
      (id: string, _request: unknown, onEvent: (event: Sub2ApiDirectGatewayStreamEvent) => void) => {
        requestId = id
        emit = onEvent
        return Promise.resolve({ requestId: id })
      }
    )
    vi.stubGlobal('window', {
      electronAPI: { sub2api: { openDirectGatewayStream, releaseDirectGatewayStream } },
    })

    const responsePromise = apiRequest.post(
      'https://naonaoai.shop/v1/responses',
      { Authorization: 'Bearer test-key' },
      '{"model":"test-model","stream":true}',
      { retry: 5 }
    )
    await vi.waitFor(() => expect(emit).toBeDefined())
    emit?.({ requestId, type: 'response', status: 200, headers: { 'content-type': 'text/event-stream' } })
    const response = await responsePromise
    const reader = response.body?.getReader()
    const firstRead = reader?.read()

    emit?.({ requestId, type: 'data', data: 'data: first\n\n' })
    await expect(firstRead).resolves.toEqual({ done: false, value: new TextEncoder().encode('data: first\n\n') })
    expect(releaseDirectGatewayStream).not.toHaveBeenCalled()

    emit?.({ requestId, type: 'complete' })
    await expect(reader?.read()).resolves.toEqual({ done: true, value: undefined })
    expect(releaseDirectGatewayStream).toHaveBeenCalledWith(requestId)
    expect(openDirectGatewayStream).toHaveBeenCalledTimes(1)
  })

  it('propagates a terminal bridge error through an already-open response stream', async () => {
    let emit: ((event: Sub2ApiDirectGatewayStreamEvent) => void) | undefined
    let requestId = ''
    const releaseDirectGatewayStream = vi.fn()
    const openDirectGatewayStream = vi.fn(
      (id: string, _request: unknown, onEvent: (event: Sub2ApiDirectGatewayStreamEvent) => void) => {
        requestId = id
        emit = onEvent
        return Promise.resolve({ requestId: id })
      }
    )
    vi.stubGlobal('window', {
      electronAPI: { sub2api: { openDirectGatewayStream, releaseDirectGatewayStream } },
    })

    const responsePromise = apiRequest.post('https://naonaoai.shop/v1/responses', {}, '{"stream":true}', { retry: 5 })
    await vi.waitFor(() => expect(emit).toBeDefined())
    emit?.({ requestId, type: 'response', status: 200, headers: { 'content-type': 'text/event-stream' } })
    const response = await responsePromise
    const reader = response.body?.getReader()

    emit?.({ requestId, type: 'data', data: 'data: partial\n\n' })
    await expect(reader?.read()).resolves.toEqual({
      done: false,
      value: new TextEncoder().encode('data: partial\n\n'),
    })
    emit?.({
      requestId,
      type: 'error',
      error: '__NAONAOAI_SUB2API_ERROR__{"kind":"network"}',
    })

    await expect(reader?.read()).rejects.toThrow('NaoNaoAI gateway connection was interrupted')
    expect(releaseDirectGatewayStream).toHaveBeenCalledWith(requestId)
    expect(openDirectGatewayStream).toHaveBeenCalledOnce()
  })

  it('forwards renderer abort to the matching main-process request ID', async () => {
    let emit: ((event: Sub2ApiDirectGatewayStreamEvent) => void) | undefined
    let requestId = ''
    const cancelDirectGatewayStream = vi.fn(() => Promise.resolve())
    const openDirectGatewayStream = vi.fn(
      (id: string, _request: unknown, onEvent: (event: Sub2ApiDirectGatewayStreamEvent) => void) => {
        requestId = id
        emit = onEvent
        return Promise.resolve({ requestId: id })
      }
    )
    vi.stubGlobal('window', {
      electronAPI: { sub2api: { openDirectGatewayStream, cancelDirectGatewayStream } },
    })
    const abortController = new AbortController()

    const responsePromise = apiRequest.post('https://naonaoai.shop/v1/responses', {}, '{"stream":true}', {
      signal: abortController.signal,
      retry: 5,
    })
    await vi.waitFor(() => expect(emit).toBeDefined())
    emit?.({ requestId, type: 'response', status: 200, headers: { 'content-type': 'text/event-stream' } })
    const response = await responsePromise
    const readPromise = response.body?.getReader().read()
    abortController.abort()

    await expect(readPromise).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancelDirectGatewayStream).toHaveBeenCalledOnce()
    expect(cancelDirectGatewayStream).toHaveBeenCalledWith(requestId)
    expect(openDirectGatewayStream).toHaveBeenCalledTimes(1)
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
