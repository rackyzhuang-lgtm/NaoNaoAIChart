import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Sub2ApiDirectGatewayStreamEvent } from '../../shared/sub2api/contracts'
import { Sub2ApiError } from '../../shared/sub2api/errors'
import { Sub2ApiClient } from './client'
import { Sub2ApiSession } from './session'

afterEach(() => {
  vi.useRealTimers()
})

const user = {
  id: 1,
  username: 'test-user',
  email: 'user@example.test',
  role: 'user',
  balance: 10,
  concurrency: 2,
  status: 'active',
}

const apiKeyRecord = {
  id: 7,
  user_id: 1,
  key: 'synthetic-user-api-key',
  name: 'desktop-key',
  group_id: null,
  status: 'active',
  quota: 0,
  quota_used: 0,
  expires_at: null,
  created_at: '2026-08-06T00:00:00Z',
  updated_at: '2026-08-06T00:00:00Z',
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function success(data: unknown): Response {
  return jsonResponse({ code: 0, message: 'success', data })
}

function authSuccess(accessToken = 'access-token', refreshToken = 'refresh-token'): Response {
  return success({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 900,
    token_type: 'Bearer',
    user,
  })
}

describe('Sub2ApiClient', () => {
  it('classifies timeout, rate-limit, and unavailable-feature responses', async () => {
    const timeoutClient = new Sub2ApiClient(
      new Sub2ApiSession(),
      vi.fn(() => {
        throw new DOMException('timed out', 'TimeoutError')
      })
    )
    await expect(timeoutClient.getPublicSettings()).rejects.toMatchObject({ code: 'TIMEOUT_ERROR' })

    const rateLimitedClient = new Sub2ApiClient(
      new Sub2ApiSession(),
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'RATE_LIMIT', message: 'too many requests' }), {
            status: 429,
            headers: { 'Retry-After': '7' },
          })
      )
    )
    await expect(rateLimitedClient.getPublicSettings()).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 7,
    })

    const unavailableClient = new Sub2ApiClient(
      new Sub2ApiSession(),
      vi.fn(async () => new Response(JSON.stringify({ code: 'DISABLED' }), { status: 403 }))
    )
    await expect(unavailableClient.getPublicSettings()).rejects.toMatchObject({ status: 403 })
  })

  it('stores login tokens in main-process session state without returning them', async () => {
    const fetchImplementation = vi.fn(async () => authSuccess())
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)

    const result = await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    expect(result).toEqual({ status: 'authenticated', user })
    expect(JSON.stringify(result)).not.toContain('access-token')
    expect(JSON.stringify(result)).not.toContain('refresh-token')
    expect(client.getSessionState()).toMatchObject({ authenticated: true, user })
  })

  it('sends the registration code and establishes the registered session in the main process', async () => {
    const fetchImplementation = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/auth/send-verify-code')) {
        return Promise.resolve(success({ message: 'Verification code sent successfully', countdown: 60 }))
      }
      if (url.endsWith('/auth/register')) {
        return Promise.resolve(authSuccess('registered-access', 'registered-refresh'))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)

    await expect(client.sendRegistrationCode({ email: 'new-user@qq.com' })).resolves.toEqual({
      message: 'Verification code sent successfully',
      countdown: 60,
    })
    const result = await client.register({
      email: 'new-user@qq.com',
      password: 'synthetic-password',
      verify_code: '123456',
    })

    expect(fetchImplementation.mock.calls[0][0].toString()).toMatch(/\/api\/v1\/auth\/send-verify-code$/)
    expect(fetchImplementation.mock.calls[1][0].toString()).toMatch(/\/api\/v1\/auth\/register$/)
    expect(fetchImplementation.mock.calls[1][1]?.body).toBe(
      JSON.stringify({ email: 'new-user@qq.com', password: 'synthetic-password', verify_code: '123456' })
    )
    expect(result).toEqual({ status: 'authenticated', user })
    expect(JSON.stringify(result)).not.toContain('registered-access')
    expect(JSON.stringify(result)).not.toContain('registered-refresh')
    expect(client.getSessionState()).toMatchObject({ authenticated: true, user })
  })

  it('streams gateway bytes from the main process without opening an arbitrary proxy', async () => {
    const fetchImplementation = vi.fn<typeof fetch>((input, init) => {
      expect(String(input)).toBe('https://naonaoai.shop/v1/responses')
      expect(init?.method).toBe('POST')
      return Promise.resolve(
        new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    const events: Sub2ApiDirectGatewayStreamEvent[] = []

    await expect(
      client.streamDirectGatewayRequest(
        '00000000-0000-4000-8000-000000000001',
        {
          url: 'https://naonaoai.shop/v1/responses',
          method: 'POST',
          headers: { Authorization: 'Bearer synthetic-key' },
          body: '{"model":"test-model","stream":true}',
        },
        (event) => events.push(event)
      )
    ).resolves.toBeUndefined()
    expect(events).toEqual([
      expect.objectContaining({ type: 'response', status: 200 }),
      expect.objectContaining({ type: 'data', data: 'data: [DONE]\n\n' }),
      expect.objectContaining({ type: 'complete' }),
    ])
    await expect(
      client.streamDirectGatewayRequest(
        '00000000-0000-4000-8000-000000000002',
        { url: 'https://example.com/v1/responses', method: 'GET' },
        () => undefined
      )
    ).rejects.toMatchObject({ code: 'GATEWAY_ERROR' })
  })

  it('emits the first stream chunk before the request completes', async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    })
    const client = new Sub2ApiClient(
      new Sub2ApiSession(),
      vi.fn(async () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }))
    )
    const events: Sub2ApiDirectGatewayStreamEvent[] = []
    let completed = false
    const pending = client
      .streamDirectGatewayRequest(
        '00000000-0000-4000-8000-000000000003',
        { url: 'https://naonaoai.shop/v1/responses', method: 'POST', body: '{"stream":true}' },
        (event) => events.push(event)
      )
      .then(() => {
        completed = true
      })

    await vi.waitFor(() => expect(events[0]).toMatchObject({ type: 'response' }))
    streamController?.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta"}\n\n'))
    await vi.waitFor(() => expect(events.some((event) => event.type === 'data')).toBe(true))
    expect(completed).toBe(false)

    streamController?.enqueue(new TextEncoder().encode('data: {"type":"response.completed"}\n\n'))
    await expect(pending).resolves.toBeUndefined()
    expect(events.at(-1)).toMatchObject({ type: 'complete' })
  })

  it('treats an SSE disconnect without a terminal provider event as one failure', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response('data: {"type":"response.output_text.delta"}\n\n', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )
    )
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    const events: Sub2ApiDirectGatewayStreamEvent[] = []

    await expect(
      client.streamDirectGatewayRequest(
        '00000000-0000-4000-8000-000000000011',
        { url: 'https://naonaoai.shop/v1/responses', method: 'POST', body: '{"stream":true}' },
        (event) => events.push(event)
      )
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' })

    expect(fetchImplementation).toHaveBeenCalledOnce()
    expect(events.some((event) => event.type === 'complete')).toBe(false)
  })

  it('rejects a request ID replay after a transport failure without another fetch', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() => Promise.reject(new Error('connection failed')))
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    const requestId = '00000000-0000-4000-8000-000000000019'
    const request = {
      url: 'https://naonaoai.shop/v1/responses',
      method: 'POST' as const,
      body: '{"stream":true}',
    }

    await expect(client.streamDirectGatewayRequest(requestId, request, () => undefined)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
    await expect(client.streamDirectGatewayRequest(requestId, request, () => undefined)).rejects.toMatchObject({
      code: 'REQUEST_ID_REPLAY',
    })
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it('reuses the promise for the same request ID without a second fetch', async () => {
    let resolveFetch = (_response: Response) => {}
    const fetchImplementation = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        })
    )
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    const request = {
      url: 'https://naonaoai.shop/v1/responses',
      method: 'POST' as const,
      headers: { Authorization: 'Bearer synthetic-key' },
      body: '{"model":"test-model","input":"hi","stream":true}',
    }

    const requestId = '00000000-0000-4000-8000-000000000004'
    const first = client.streamDirectGatewayRequest(requestId, request, () => undefined)
    const duplicate = client.streamDirectGatewayRequest(requestId, request, () => undefined)

    await Promise.resolve()
    expect(duplicate).toBe(first)
    expect(fetchImplementation).toHaveBeenCalledOnce()
    resolveFetch(new Response('data: [DONE]\n\n', { status: 200 }))
    await expect(Promise.all([first, duplicate])).resolves.toEqual([undefined, undefined])
  })

  it('rejects a conflicting body for an active request ID without another fetch', async () => {
    let resolveFetch = (_response: Response) => {}
    const fetchImplementation = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        })
    )
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    const requestId = '00000000-0000-4000-8000-000000000016'
    const first = client.streamDirectGatewayRequest(
      requestId,
      {
        url: 'https://naonaoai.shop/v1/responses',
        method: 'POST',
        body: '{"model":"test-model","input":"first","stream":true}',
      },
      () => undefined
    )

    await expect(
      client.streamDirectGatewayRequest(
        requestId,
        {
          url: 'https://naonaoai.shop/v1/responses',
          method: 'POST',
          body: '{"model":"test-model","input":"different","stream":true}',
        },
        () => undefined
      )
    ).rejects.toMatchObject({ code: 'REQUEST_ID_CONFLICT' })
    expect(fetchImplementation).toHaveBeenCalledOnce()

    resolveFetch(new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    await expect(first).resolves.toBeUndefined()
  })

  it('streams independent request IDs concurrently without queuing either request', async () => {
    let firstStreamController: ReadableStreamDefaultController<Uint8Array> | undefined
    const firstStream = new ReadableStream<Uint8Array>({
      start(controller) {
        firstStreamController = controller
      },
    })
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(firstStream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      )
      .mockResolvedValueOnce(
        new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      )
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    const request = {
      url: 'https://naonaoai.shop/v1/responses',
      method: 'POST' as const,
      body: '{"model":"test-model","input":"first","stream":true}',
    }

    const first = client.streamDirectGatewayRequest('00000000-0000-4000-8000-000000000005', request, () => undefined)
    const secondRequestId = '00000000-0000-4000-8000-000000000006'
    const second = client.streamDirectGatewayRequest(
      secondRequestId,
      { ...request, body: '{"model":"test-model","input":"second","stream":true}' },
      () => undefined
    )

    await expect(second).resolves.toBeUndefined()
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
    firstStreamController?.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta"}\n\n'))
    await Promise.resolve()
    expect(fetchImplementation).toHaveBeenCalledTimes(2)

    firstStreamController?.enqueue(new TextEncoder().encode('data: {"type":"response.completed"}\n\n'))
    await expect(first).resolves.toBeUndefined()
    expect(fetchImplementation).toHaveBeenCalledTimes(2)

    await expect(client.streamDirectGatewayRequest(secondRequestId, request, () => undefined)).rejects.toMatchObject({
      code: 'REQUEST_ID_REPLAY',
    })
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })

  it('keeps a concurrent request independent from another request transport failure', async () => {
    let rejectFirst = (_error: Error) => {}
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectFirst = reject
          })
      )
      .mockResolvedValueOnce(
        new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      )
      .mockResolvedValueOnce(
        new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      )
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    const request = {
      url: 'https://naonaoai.shop/v1/responses',
      method: 'POST' as const,
      body: '{"model":"test-model","input":"first","stream":true}',
    }

    const first = client.streamDirectGatewayRequest('00000000-0000-4000-8000-000000000007', request, () => undefined)
    const second = client.streamDirectGatewayRequest(
      '00000000-0000-4000-8000-000000000008',
      { ...request, body: '{"model":"test-model","input":"second","stream":true}' },
      () => undefined
    )

    await expect(second).resolves.toBeUndefined()
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
    rejectFirst(new Error('connection failed'))
    await expect(first).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(fetchImplementation).toHaveBeenCalledTimes(2)

    await expect(
      client.streamDirectGatewayRequest(
        '00000000-0000-4000-8000-000000000013',
        { ...request, body: '{"model":"test-model","input":"explicit-retry","stream":true}' },
        () => undefined
      )
    ).resolves.toBeUndefined()
    expect(fetchImplementation).toHaveBeenCalledTimes(3)
  })

  it('cancels only the matching request while another request remains active', async () => {
    const signals: AbortSignal[] = []
    const resolvers: Array<(response: Response) => void> = []
    const fetchImplementation = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((resolve, reject) => {
          if (init?.signal) signals.push(init.signal)
          resolvers.push(resolve)
          init?.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))
        })
    )
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    const firstId = '00000000-0000-4000-8000-000000000017'
    const secondId = '00000000-0000-4000-8000-000000000018'
    const first = client.streamDirectGatewayRequest(
      firstId,
      { url: 'https://naonaoai.shop/v1/responses', method: 'POST', body: '{"input":"first","stream":true}' },
      () => undefined
    )
    const second = client.streamDirectGatewayRequest(
      secondId,
      { url: 'https://naonaoai.shop/v1/responses', method: 'POST', body: '{"input":"second","stream":true}' },
      () => undefined
    )

    await vi.waitFor(() => expect(signals).toHaveLength(2))
    client.cancelDirectGatewayRequest(firstId)

    await expect(first).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' })
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    resolvers[1](new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } }))
    await expect(second).resolves.toBeUndefined()
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })

  it('rejects the same request ID after completion without a second fetch', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )
    )
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    const requestId = '00000000-0000-4000-8000-000000000014'
    const request = { url: 'https://naonaoai.shop/v1/responses', method: 'POST' as const, body: '{"stream":true}' }

    await expect(client.streamDirectGatewayRequest(requestId, request, () => undefined)).resolves.toBeUndefined()
    await expect(client.streamDirectGatewayRequest(requestId, request, () => undefined)).rejects.toMatchObject({
      code: 'REQUEST_ID_REPLAY',
    })
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it('rejects an empty SSE response without a provider terminal event', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    )
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)

    await expect(
      client.streamDirectGatewayRequest(
        '00000000-0000-4000-8000-000000000015',
        { url: 'https://naonaoai.shop/v1/responses', method: 'POST', body: '{"stream":true}' },
        () => undefined
      )
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it('does not abort or resend a gateway request while waiting for response headers', async () => {
    vi.useFakeTimers()
    let resolveResponse: ((response: Response) => void) | undefined
    let requestSignal: AbortSignal | null | undefined
    const fetchImplementation = vi.fn<typeof fetch>((_input, init) => {
      requestSignal = init?.signal
      return new Promise<Response>((resolve) => {
        resolveResponse = resolve
      })
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)

    const responsePromise = client.streamDirectGatewayRequest(
      '00000000-0000-4000-8000-000000000009',
      { url: 'https://naonaoai.shop/v1/responses', method: 'POST', body: '{"stream":true}' },
      () => undefined
    )
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(180_001)

    expect(requestSignal?.aborted).toBe(false)
    resolveResponse?.(new Response('data: [DONE]\n\n', { status: 200 }))
    await expect(responsePromise).resolves.toBeUndefined()
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it('cancels the matching main-process fetch without sending another request', async () => {
    let requestSignal: AbortSignal | null | undefined
    const fetchImplementation = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          requestSignal = init?.signal
          init?.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))
        })
    )
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    const requestId = '00000000-0000-4000-8000-000000000010'
    const pending = client.streamDirectGatewayRequest(
      requestId,
      { url: 'https://naonaoai.shop/v1/responses', method: 'POST', body: '{"stream":true}' },
      () => undefined
    )

    await vi.waitFor(() => expect(requestSignal).toBeDefined())
    client.cancelDirectGatewayRequest(requestId)

    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' })
    expect(requestSignal?.aborted).toBe(true)
    await expect(
      client.streamDirectGatewayRequest(
        requestId,
        { url: 'https://naonaoai.shop/v1/responses', method: 'POST', body: '{"stream":true}' },
        () => undefined
      )
    ).rejects.toMatchObject({ code: 'REQUEST_ID_REPLAY' })
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it('restores an opted-in session without sending the UI preference to sub2api', async () => {
    let persistedRefreshToken: string | null = null
    const autoLoginStore = {
      isAvailable: () => true,
      load: () => persistedRefreshToken,
      save: (refreshToken: string) => {
        persistedRefreshToken = refreshToken
        return true
      },
      clear: () => {
        persistedRefreshToken = null
      },
    }
    const loginFetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      authSuccess('first-access', 'first-refresh')
    )
    const firstClient = new Sub2ApiClient(new Sub2ApiSession(), loginFetch)
    firstClient.configureAutoLogin(autoLoginStore)

    await firstClient.login({ email: 'user@example.test', password: 'synthetic-password', auto_login: true })

    expect(loginFetch.mock.calls[0][1]?.body).not.toContain('auto_login')
    expect(persistedRefreshToken).toBe('first-refresh')

    const restoredClient = new Sub2ApiClient(
      new Sub2ApiSession(),
      vi.fn(async () =>
        success({
          access_token: 'restored-access',
          refresh_token: 'rotated-refresh',
          expires_in: 900,
          token_type: 'Bearer',
        })
      )
    )
    restoredClient.configureAutoLogin(autoLoginStore)

    await expect(restoredClient.restoreAutoLogin()).resolves.toBe(true)
    expect(restoredClient.getSessionState()).toMatchObject({ authenticated: true, user: null })
    expect(persistedRefreshToken).toBe('rotated-refresh')
  })

  it('keeps the temporary 2FA token out of renderer-facing results', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        success({ requires_2fa: true, temp_token: 'temporary-token', user_email_masked: 'u***@example.test' })
      )
      .mockResolvedValueOnce(authSuccess())
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)

    const pending = await client.login({ email: 'user@example.test', password: 'synthetic-password' })
    expect(pending).toEqual({ status: 'two_factor_required', userEmailMasked: 'u***@example.test' })
    expect(JSON.stringify(pending)).not.toContain('temporary-token')

    await client.completeTwoFactor('654321')
    const secondRequest = fetchImplementation.mock.calls[1]
    expect(secondRequest[0].toString().endsWith('/api/v1/auth/login/2fa')).toBe(true)
    expect(secondRequest[1]?.body).toContain('temporary-token')
  })

  it('shares one refresh request across concurrent 401 responses', async () => {
    let currentUserAttempts = 0
    let refreshRequests = 0
    const fetchImplementation = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/auth/login')) {
        return authSuccess('old-access', 'old-refresh')
      }
      if (url.endsWith('/auth/refresh')) {
        refreshRequests += 1
        await Promise.resolve()
        return success({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 900,
          token_type: 'Bearer',
        })
      }
      if (url.endsWith('/auth/me')) {
        currentUserAttempts += 1
        const authorization = new Headers(init?.headers).get('Authorization')
        if (authorization === 'Bearer old-access') {
          return jsonResponse({ code: 'TOKEN_EXPIRED', message: 'Token has expired' }, 401)
        }
        expect(authorization).toBe('Bearer new-access')
        return success(user)
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    const results = await Promise.all([client.getCurrentUser(), client.getCurrentUser()])

    expect(results).toEqual([user, user])
    expect(refreshRequests).toBe(1)
    expect(currentUserAttempts).toBe(4)
  })

  it('clears the session when refresh fails and does not include tokens in errors', async () => {
    const fetchImplementation = vi.fn((input: string | URL | Request) => {
      const url = input.toString()
      if (url.endsWith('/auth/login')) {
        return Promise.resolve(authSuccess('sensitive-access', 'sensitive-refresh'))
      }
      if (url.endsWith('/auth/me')) {
        return Promise.resolve(jsonResponse({ code: 'TOKEN_EXPIRED', message: 'Token has expired' }, 401))
      }
      return Promise.resolve(jsonResponse({ code: 401, message: 'Refresh token is invalid' }, 401))
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    const error = await client.getCurrentUser().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Sub2ApiError)
    expect(JSON.stringify(error)).not.toContain('sensitive-access')
    expect(JSON.stringify(error)).not.toContain('sensitive-refresh')
    expect(client.getSessionState().authenticated).toBe(false)
  })

  it('completes local logout when remote logout fails', async () => {
    const fetchImplementation = vi.fn().mockResolvedValueOnce(authSuccess()).mockRejectedValueOnce(new Error('offline'))
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    await expect(client.logout()).resolves.toBeUndefined()
    expect(client.getSessionState().authenticated).toBe(false)
  })

  it('uses panel JWT for API key CRUD and the selected user key for model discovery', async () => {
    const availableGroups = [{ id: 4, name: 'Standard', platform: 'openai' }]
    const copiedKeys: string[] = []
    const requests: {
      url: string
      method: string
      authorization: string | null
      cache?: RequestCache
      cacheControl?: string | null
      body?: unknown
    }[] = []
    const fetchImplementation = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString()
      const method = init?.method || 'GET'
      const authorization = new Headers(init?.headers).get('Authorization')
      requests.push({
        url,
        method,
        authorization,
        cache: init?.cache,
        cacheControl: new Headers(init?.headers).get('Cache-Control'),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })

      if (url.endsWith('/auth/login')) {
        return Promise.resolve(authSuccess('panel-access', 'panel-refresh'))
      }
      if (url.includes('/api/v1/keys?page=')) {
        return Promise.resolve(success({ items: [apiKeyRecord], total: 1, page: 1, page_size: 100, pages: 1 }))
      }
      if (url.endsWith('/api/v1/groups/available')) {
        return Promise.resolve(success(availableGroups))
      }
      if (url.endsWith('/api/v1/keys') && method === 'POST') {
        return Promise.resolve(success(apiKeyRecord))
      }
      if (url.endsWith('/api/v1/keys/7') && method === 'PUT') {
        return Promise.resolve(success({ ...apiKeyRecord, name: 'renamed-key' }))
      }
      if (url.endsWith('/api/v1/keys/7') && method === 'GET') {
        return Promise.resolve(success(apiKeyRecord))
      }
      if (url.endsWith('/v1/models')) {
        return Promise.resolve(
          jsonResponse({
            object: 'list',
            data: [{ id: 'gpt-test' }, { id: 'gemini-2.5-flash-image' }, { id: 'codex-test' }],
          })
        )
      }
      if (url.endsWith('/api/v1/keys/7') && method === 'DELETE') {
        return Promise.resolve(success({ message: 'deleted' }))
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    await expect(client.listApiKeys()).resolves.toMatchObject({ total: 1, items: [apiKeyRecord] })
    await expect(client.getAvailableGroups()).resolves.toEqual(availableGroups)
    await expect(client.createApiKey({ name: 'desktop-key', group_id: 4 })).resolves.toMatchObject(apiKeyRecord)
    await expect(client.updateApiKey(7, { name: 'renamed-key', group_id: 4 })).resolves.toMatchObject({
      name: 'renamed-key',
    })
    await expect(client.copyApiKeyToClipboard(7, (key) => copiedKeys.push(key))).resolves.toBeUndefined()
    expect(copiedKeys).toEqual(['synthetic-user-api-key'])
    await expect(client.prepareProviderBinding(7)).resolves.toEqual({
      apiKey: 'synthetic-user-api-key',
      apiHost: 'https://naonaoai.shop/v1',
      models: [{ id: 'gpt-test' }, { id: 'gemini-2.5-flash-image' }, { id: 'codex-test' }],
    })
    await expect(client.prepareInfiniteCanvasImport(7)).resolves.toEqual({
      keyId: 7,
      keyName: 'desktop-key',
      baseUrl: 'https://naonaoai.shop',
      apiKey: 'synthetic-user-api-key',
      models: [
        { id: 'gpt-test', capability: 'text', apiFormat: 'openai' },
        { id: 'gemini-2.5-flash-image', capability: 'image', apiFormat: 'gemini' },
        { id: 'codex-test', capability: 'text', apiFormat: 'openai' },
      ],
    })
    await expect(client.deleteApiKey(7)).resolves.toBeUndefined()

    const panelRequests = requests.filter((request) => request.url.includes('/api/v1/keys'))
    expect(panelRequests.every((request) => request.authorization === 'Bearer panel-access')).toBe(true)
    expect(requests.find((request) => request.url.endsWith('/v1/models'))?.authorization).toBe(
      'Bearer synthetic-user-api-key'
    )
    expect(requests.find((request) => request.url.endsWith('/v1/models'))?.cache).toBe('no-store')
    expect(requests.find((request) => request.url.endsWith('/v1/models'))?.cacheControl).toBe(
      'no-cache, no-store, max-age=0'
    )
    expect(requests.find((request) => request.method === 'POST' && request.url.endsWith('/api/v1/keys'))?.body).toEqual(
      { name: 'desktop-key', group_id: 4 }
    )
    expect(
      requests.find((request) => request.method === 'PUT' && request.url.endsWith('/api/v1/keys/7'))?.body
    ).toEqual({ name: 'renamed-key', group_id: 4 })
  })

  it('rejects a Canvas import when the selected key returns no models', async () => {
    const fetchImplementation = vi.fn((input: string | URL | Request) => {
      const url = input.toString()
      if (url.endsWith('/auth/login')) return Promise.resolve(authSuccess('panel-access', 'panel-refresh'))
      if (url.endsWith('/api/v1/keys/7')) return Promise.resolve(success(apiKeyRecord))
      if (url.endsWith('/v1/models')) return Promise.resolve(jsonResponse({ object: 'list', data: [] }))
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    await expect(client.prepareInfiniteCanvasImport(7)).rejects.toThrow(
      'The selected API key did not return any importable models'
    )
  })

  it('uses panel JWT for read-only usage and subscription summaries', async () => {
    const dashboardStats = {
      total_api_keys: 1,
      active_api_keys: 1,
      total_requests: 12,
      total_input_tokens: 100,
      total_output_tokens: 40,
      total_cache_creation_tokens: 0,
      total_cache_read_tokens: 10,
      total_tokens: 150,
      total_cost: 0.6,
      total_actual_cost: 0.5,
      today_requests: 3,
      today_input_tokens: 20,
      today_output_tokens: 10,
      today_cache_creation_tokens: 0,
      today_cache_read_tokens: 2,
      today_tokens: 32,
      today_cost: 0.15,
      today_actual_cost: 0.12,
      average_duration_ms: 600,
      rpm: 0.2,
      tpm: 4,
    }
    const subscriptionSummary = {
      active_count: 0,
      total_used_usd: 0,
      subscriptions: [],
    }
    const fetchImplementation = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/auth/login')) {
        return Promise.resolve(authSuccess('panel-access', 'panel-refresh'))
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer panel-access')
      if (url.endsWith('/api/v1/usage/dashboard/stats')) {
        return Promise.resolve(success(dashboardStats))
      }
      if (url.endsWith('/api/v1/subscriptions/summary')) {
        return Promise.resolve(success(subscriptionSummary))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    await expect(client.getUsageDashboardStats()).resolves.toEqual(dashboardStats)
    await expect(client.getSubscriptionSummary()).resolves.toEqual(subscriptionSummary)
  })

  it('does not expose the removed platform quotas request', async () => {
    const platformQuotas = { platform_quotas: [] }
    const fetchImplementation = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/auth/login')) {
        return Promise.resolve(authSuccess('panel-access', 'panel-refresh'))
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer panel-access')
      if (url.endsWith('/api/v1/user/platform-quotas')) {
        return Promise.resolve(success(platformQuotas))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    expect('getPlatformQuotas' in client).toBe(false)
  })

  it('uses panel JWT for read-only channel monitors', async () => {
    const channelMonitors = {
      items: [
        {
          id: 2,
          name: 'GPT stable',
          provider: 'openai',
          group_name: '',
          primary_model: 'gpt-5.6-terra',
          primary_status: 'operational',
          primary_latency_ms: 1200,
          primary_ping_latency_ms: 15,
          availability_7d: 99.2,
          timeline: [],
        },
      ],
    }
    const fetchImplementation = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/auth/login')) {
        return Promise.resolve(authSuccess('panel-access', 'panel-refresh'))
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer panel-access')
      if (url.endsWith('/api/v1/channel-monitors')) {
        return Promise.resolve(success(channelMonitors))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    await expect(client.getChannelMonitors()).resolves.toEqual(channelMonitors)
  })

  it('does not expose the removed model plaza request', async () => {
    const modelPlaza = {
      description: 'Available models',
      groups: [
        {
          id: 2,
          name: 'GPT group',
          platform: 'openai',
          rate_multiplier: 0.8,
          models: [{ name: 'gpt-5.6-terra', pricing: { input_price: 1.25 } }],
        },
      ],
    }
    const fetchImplementation = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/auth/login')) return Promise.resolve(authSuccess('panel-access', 'panel-refresh'))
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer panel-access')
      if (url.endsWith('/api/v1/model-plaza')) return Promise.resolve(success(modelPlaza))
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    expect('getModelPlaza' in client).toBe(false)
  })

  it('uses panel JWT for announcements and validates the read id', async () => {
    const announcements = [
      {
        id: 9,
        title: 'Maintenance',
        content: 'Service window',
        notify_mode: 'popup',
        read_at: null,
        created_at: '2026-08-06T00:00:00Z',
        updated_at: '2026-08-06T01:00:00Z',
      },
    ]
    const fetchImplementation = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/auth/login')) return Promise.resolve(authSuccess('panel-access', 'panel-refresh'))
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer panel-access')
      if (url.endsWith('/api/v1/announcements') && init?.method === 'GET')
        return Promise.resolve(success(announcements))
      if (url.endsWith('/api/v1/announcements/9/read') && init?.method === 'POST') {
        return Promise.resolve(success({ message: 'read' }))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    await expect(client.getAnnouncements()).resolves.toEqual(announcements)
    await expect(client.markAnnouncementRead(9)).resolves.toBeUndefined()
    await expect(client.markAnnouncementRead(0)).rejects.toThrow()
  })

  it('uses panel JWT for read-only trend and model summaries', async () => {
    const trend = { trend: [], start_date: '2026-07-30', end_date: '2026-08-05', granularity: 'day' }
    const models = { models: [], start_date: '2026-07-30', end_date: '2026-08-05' }
    const fetchImplementation = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/auth/login')) {
        return Promise.resolve(authSuccess('panel-access', 'panel-refresh'))
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer panel-access')
      if (url.endsWith('/api/v1/usage/dashboard/trend?period=week')) {
        return Promise.resolve(success(trend))
      }
      if (url.endsWith('/api/v1/usage/dashboard/models?period=week')) {
        return Promise.resolve(success(models))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    await expect(client.getUsageDashboardTrend()).resolves.toEqual(trend)
    await expect(client.getUsageDashboardModels()).resolves.toEqual(models)
  })

  it('does not expose the removed usage records request', async () => {
    const records = { items: [], total: 0, page: 2, page_size: 20, pages: 1 }
    const fetchImplementation = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/auth/login')) {
        return Promise.resolve(authSuccess('panel-access', 'panel-refresh'))
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer panel-access')
      if (url.endsWith('/api/v1/usage?page=2&page_size=20')) {
        return Promise.resolve(success(records))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    expect('getUsageRecords' in client).toBe(false)
  })

  it('does not expose removed error-request actions', async () => {
    const errors = { items: [], total: 0, page: 1, page_size: 20, pages: 1 }
    const detail = {
      id: 41,
      created_at: '2026-08-05T13:00:00Z',
      model: 'gpt-5',
      inbound_endpoint: '/v1/chat/completions',
      status_code: 429,
      category: 'rate_limit',
      platform: 'openai',
      message: 'Rate limit exceeded',
      key_name: 'desktop-key',
      key_deleted: false,
      stream: true,
      error_body: '{"error":"rate limited"}',
      upstream_status_code: 429,
    }
    const fetchImplementation = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/auth/login')) {
        return Promise.resolve(authSuccess('panel-access', 'panel-refresh'))
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer panel-access')
      if (url.endsWith('/api/v1/usage/errors?page=1&page_size=20')) {
        return Promise.resolve(success(errors))
      }
      if (url.endsWith('/api/v1/usage/errors/41')) {
        return Promise.resolve(success(detail))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    expect('getUsageErrors' in client).toBe(false)
    expect('getUsageErrorDetail' in client).toBe(false)
  })

  it('uses panel JWT for redemption and history', async () => {
    const history = [
      {
        id: 1,
        code: 'secret-code',
        type: 'balance',
        value: 5,
        status: 'used',
        used_at: '2026-08-06T00:00:00Z',
        created_at: '2026-08-06T00:00:00Z',
      },
    ]
    const redeemed = { message: 'Redeemed', type: 'balance', value: 5, new_balance: 15 }
    const fetchImplementation = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/auth/login')) {
        return Promise.resolve(authSuccess('panel-access', 'panel-refresh'))
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer panel-access')
      if (url.endsWith('/api/v1/redeem') && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ code: 'redeem-code' })
        return Promise.resolve(success(redeemed))
      }
      if (url.endsWith('/api/v1/redeem/history')) {
        return Promise.resolve(success(history))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    await expect(client.redeemCode({ code: ' redeem-code ' })).resolves.toEqual(redeemed)
    await expect(client.getRedeemHistory()).resolves.toEqual(history)
    await expect(client.redeemCode({ code: ' ' })).rejects.toThrow()
  })

  it('does not let an old refresh overwrite a newer login', async () => {
    const secondUser = { ...user, id: 2, username: 'second-user', email: 'second@example.test' }
    let resolveOldRefresh: ((response: Response) => void) | undefined
    let notifyOldRefreshStarted: (() => void) | undefined
    const oldRefreshStarted = new Promise<void>((resolve) => {
      notifyOldRefreshStarted = resolve
    })
    const fetchImplementation = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      await Promise.resolve()
      const url = input.toString()
      if (url.endsWith('/auth/login')) {
        const body = JSON.parse(String(init?.body)) as { email: string }
        return body.email === 'first@example.test'
          ? authSuccess('first-access', 'first-refresh')
          : success({
              access_token: 'second-access',
              refresh_token: 'second-refresh',
              expires_in: 900,
              token_type: 'Bearer',
              user: secondUser,
            })
      }
      if (url.endsWith('/auth/refresh')) {
        notifyOldRefreshStarted?.()
        return new Promise<Response>((resolveRefresh) => {
          resolveOldRefresh = resolveRefresh
        })
      }
      if (url.endsWith('/auth/me')) {
        const authorization = new Headers(init?.headers).get('Authorization')
        if (authorization === 'Bearer first-access') {
          return jsonResponse({ code: 'TOKEN_EXPIRED', message: 'Token has expired' }, 401)
        }
        expect(authorization).toBe('Bearer second-access')
        return success(secondUser)
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'first@example.test', password: 'synthetic-password' })

    const staleRequest = client.getCurrentUser()
    await oldRefreshStarted
    await client.login({ email: 'second@example.test', password: 'synthetic-password' })
    resolveOldRefresh?.(
      success({
        access_token: 'stale-access',
        refresh_token: 'stale-refresh',
        expires_in: 900,
        token_type: 'Bearer',
      })
    )

    await expect(staleRequest).resolves.toEqual(secondUser)
    expect(client.getSessionState()).toMatchObject({ authenticated: true, user: secondUser })
  })

  it('does not let an old refresh failure clear a newer login', async () => {
    const secondUser = { ...user, id: 2, username: 'second-user', email: 'second@example.test' }
    let rejectOldRefresh: ((reason: Error) => void) | undefined
    let notifyOldRefreshStarted: (() => void) | undefined
    const oldRefreshStarted = new Promise<void>((resolve) => {
      notifyOldRefreshStarted = resolve
    })
    const fetchImplementation = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      await Promise.resolve()
      const url = input.toString()
      if (url.endsWith('/auth/login')) {
        const body = JSON.parse(String(init?.body)) as { email: string }
        return body.email === 'first@example.test'
          ? authSuccess('first-access', 'first-refresh')
          : success({
              access_token: 'second-access',
              refresh_token: 'second-refresh',
              expires_in: 900,
              token_type: 'Bearer',
              user: secondUser,
            })
      }
      if (url.endsWith('/auth/refresh')) {
        notifyOldRefreshStarted?.()
        return new Promise<Response>((_, rejectRefresh) => {
          rejectOldRefresh = rejectRefresh
        })
      }
      if (url.endsWith('/auth/me')) {
        const authorization = new Headers(init?.headers).get('Authorization')
        if (authorization === 'Bearer first-access') {
          return jsonResponse({ code: 'TOKEN_EXPIRED', message: 'Token has expired' }, 401)
        }
        expect(authorization).toBe('Bearer second-access')
        return success(secondUser)
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'first@example.test', password: 'synthetic-password' })

    const staleRequest = client.getCurrentUser()
    await oldRefreshStarted
    await client.login({ email: 'second@example.test', password: 'synthetic-password' })
    rejectOldRefresh?.(new Error('old refresh failed'))

    await expect(staleRequest).resolves.toEqual(secondUser)
    expect(client.getSessionState()).toMatchObject({ authenticated: true, user: secondUser })
  })

  it('does not let a delayed logout clear a newer login', async () => {
    const secondUser = { ...user, id: 2, username: 'second-user', email: 'second@example.test' }
    let resolveLogout: ((response: Response) => void) | undefined
    let notifyLogoutStarted: (() => void) | undefined
    const logoutStarted = new Promise<void>((resolve) => {
      notifyLogoutStarted = resolve
    })
    let loginCount = 0
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      await Promise.resolve()
      const url = input.toString()
      if (url.endsWith('/auth/login')) {
        loginCount += 1
        return loginCount === 1
          ? authSuccess('first-access', 'first-refresh')
          : success({
              access_token: 'second-access',
              refresh_token: 'second-refresh',
              expires_in: 900,
              token_type: 'Bearer',
              user: secondUser,
            })
      }
      if (url.endsWith('/auth/logout')) {
        notifyLogoutStarted?.()
        return new Promise<Response>((resolveRemoteLogout) => {
          resolveLogout = resolveRemoteLogout
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'first@example.test', password: 'synthetic-password' })

    const staleLogout = client.logout()
    await logoutStarted
    await client.login({ email: 'second@example.test', password: 'synthetic-password' })
    resolveLogout?.(success(null))

    await staleLogout
    expect(client.getSessionState()).toMatchObject({ authenticated: true, user: secondUser })
  })

  it('discards a successful response from an older login session', async () => {
    const secondUser = { ...user, id: 2, username: 'second-user', email: 'second@example.test' }
    let resolveOldRequest: ((response: Response) => void) | undefined
    let notifyOldRequestStarted: (() => void) | undefined
    const oldRequestStarted = new Promise<void>((resolve) => {
      notifyOldRequestStarted = resolve
    })
    const fetchImplementation = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      await Promise.resolve()
      const url = input.toString()
      if (url.endsWith('/auth/login')) {
        const body = JSON.parse(String(init?.body)) as { email: string }
        return body.email === 'first@example.test'
          ? authSuccess('first-access', 'first-refresh')
          : success({
              access_token: 'second-access',
              refresh_token: 'second-refresh',
              expires_in: 900,
              token_type: 'Bearer',
              user: secondUser,
            })
      }
      if (url.endsWith('/auth/me')) {
        const authorization = new Headers(init?.headers).get('Authorization')
        if (authorization === 'Bearer first-access') {
          notifyOldRequestStarted?.()
          return new Promise<Response>((resolveRequest) => {
            resolveOldRequest = resolveRequest
          })
        }
        expect(authorization).toBe('Bearer second-access')
        return success(secondUser)
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'first@example.test', password: 'synthetic-password' })

    const staleRequest = client.getCurrentUser()
    await oldRequestStarted
    await client.login({ email: 'second@example.test', password: 'synthetic-password' })
    resolveOldRequest?.(success(user))

    await expect(staleRequest).resolves.toEqual(secondUser)
    expect(client.getSessionState()).toMatchObject({ authenticated: true, user: secondUser })
  })

  it('discards an older response when the session changes during JSON parsing', async () => {
    const secondUser = { ...user, id: 2, username: 'second-user', email: 'second@example.test' }
    let resolveOldPayload: ((payload: unknown) => void) | undefined
    let notifyOldParseStarted: (() => void) | undefined
    const oldParseStarted = new Promise<void>((resolve) => {
      notifyOldParseStarted = resolve
    })
    const oldPayload = new Promise<unknown>((resolve) => {
      resolveOldPayload = resolve
    })
    const delayedResponse = {
      ok: true,
      status: 200,
      json: async () => {
        notifyOldParseStarted?.()
        return await oldPayload
      },
    } as Response
    const fetchImplementation = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      await Promise.resolve()
      const url = input.toString()
      if (url.endsWith('/auth/login')) {
        const body = JSON.parse(String(init?.body)) as { email: string }
        return body.email === 'first@example.test'
          ? authSuccess('first-access', 'first-refresh')
          : success({
              access_token: 'second-access',
              refresh_token: 'second-refresh',
              expires_in: 900,
              token_type: 'Bearer',
              user: secondUser,
            })
      }
      if (url.endsWith('/auth/me')) {
        const authorization = new Headers(init?.headers).get('Authorization')
        return authorization === 'Bearer first-access' ? delayedResponse : success(secondUser)
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'first@example.test', password: 'synthetic-password' })

    const staleRequest = client.getCurrentUser()
    await oldParseStarted
    await client.login({ email: 'second@example.test', password: 'synthetic-password' })
    resolveOldPayload?.({ code: 0, message: 'success', data: user })

    await expect(staleRequest).resolves.toEqual(secondUser)
    expect(client.getSessionState()).toMatchObject({ authenticated: true, user: secondUser })
  })
})
