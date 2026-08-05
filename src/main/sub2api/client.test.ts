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
