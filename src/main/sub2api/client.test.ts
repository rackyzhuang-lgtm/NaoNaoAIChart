import { describe, expect, it, vi } from 'vitest'
import { Sub2ApiError } from '../../shared/sub2api/errors'
import { Sub2ApiClient } from './client'
import { Sub2ApiSession } from './session'

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
    const requests: { url: string; method: string; authorization: string | null; body?: unknown }[] = []
    const fetchImplementation = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString()
      const method = init?.method || 'GET'
      const authorization = new Headers(init?.headers).get('Authorization')
      requests.push({
        url,
        method,
        authorization,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })

      if (url.endsWith('/auth/login')) {
        return Promise.resolve(authSuccess('panel-access', 'panel-refresh'))
      }
      if (url.includes('/api/v1/keys?page=')) {
        return Promise.resolve(success({ items: [apiKeyRecord], total: 1, page: 1, page_size: 100, pages: 1 }))
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
        return Promise.resolve(jsonResponse({ object: 'list', data: [{ id: 'gpt-test' }, { id: 'codex-test' }] }))
      }
      if (url.endsWith('/api/v1/keys/7') && method === 'DELETE') {
        return Promise.resolve(success({ message: 'deleted' }))
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })
    const client = new Sub2ApiClient(new Sub2ApiSession(), fetchImplementation)
    await client.login({ email: 'user@example.test', password: 'synthetic-password' })

    await expect(client.listApiKeys()).resolves.toMatchObject({ total: 1, items: [apiKeyRecord] })
    await expect(client.createApiKey({ name: 'desktop-key' })).resolves.toMatchObject(apiKeyRecord)
    await expect(client.updateApiKey(7, { name: 'renamed-key' })).resolves.toMatchObject({ name: 'renamed-key' })
    await expect(client.prepareProviderBinding(7)).resolves.toEqual({
      apiKey: 'synthetic-user-api-key',
      apiHost: 'https://naonaoai.shop/v1',
      models: [{ id: 'gpt-test' }, { id: 'codex-test' }],
    })
    await expect(client.deleteApiKey(7)).resolves.toBeUndefined()

    const panelRequests = requests.filter((request) => request.url.includes('/api/v1/keys'))
    expect(panelRequests.every((request) => request.authorization === 'Bearer panel-access')).toBe(true)
    expect(requests.find((request) => request.url.endsWith('/v1/models'))?.authorization).toBe(
      'Bearer synthetic-user-api-key'
    )
    expect(requests.find((request) => request.method === 'POST' && request.url.endsWith('/api/v1/keys'))?.body).toEqual(
      { name: 'desktop-key' }
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

  it('uses panel JWT for read-only platform quotas', async () => {
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

    await expect(client.getPlatformQuotas()).resolves.toEqual(platformQuotas)
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

  it('uses panel JWT for the read-only model plaza', async () => {
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

    await expect(client.getModelPlaza()).resolves.toEqual(modelPlaza)
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

  it('uses panel JWT and a bounded page size for usage records', async () => {
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

    await expect(client.getUsageRecords(2)).resolves.toEqual(records)
    await expect(client.getUsageRecords(0)).rejects.toThrow()
  })

  it('uses panel JWT for error requests and redacted error details', async () => {
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

    await expect(client.getUsageErrors(1)).resolves.toEqual(errors)
    await expect(client.getUsageErrorDetail(41)).resolves.toEqual(detail)
    await expect(client.getUsageErrorDetail(0)).rejects.toThrow()
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
