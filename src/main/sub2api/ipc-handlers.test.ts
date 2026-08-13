import { EventEmitter } from 'node:events'
import type { ipcMain } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { Sub2ApiDirectGatewayRequest, Sub2ApiDirectGatewayStreamEvent } from '../../shared/sub2api/contracts'
import { Sub2ApiError } from '../../shared/sub2api/errors'
import { SUB2API_IPC_CHANNELS, SUB2API_IPC_EVENTS } from '../../shared/sub2api/ipc'
import type { Sub2ApiClient } from './client'
import { registerSub2ApiHandlers } from './ipc-handlers'

const mocks = vi.hoisted(() => ({ writeText: vi.fn() }))

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, clipboard: { writeText: mocks.writeText } }))

function createSender(id = 1) {
  return Object.assign(new EventEmitter(), {
    id,
    send: vi.fn(),
    isDestroyed: vi.fn(() => false),
  })
}

describe('registerSub2ApiHandlers', () => {
  it('registers only fixed business actions and returns no tokens', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const registrar = {
      handle: vi.fn((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
        handlers.set(channel, listener as (...args: unknown[]) => unknown)
      ),
    }
    const user = {
      id: 1,
      username: 'test-user',
      email: 'user@example.test',
      role: 'user' as const,
      balance: 10,
      concurrency: 2,
      status: 'active' as const,
    }
    const client = {
      getPublicSettings: vi.fn(async () => ({})),
      login: vi.fn(async () => ({ status: 'authenticated' as const, user })),
      register: vi.fn(async () => ({ status: 'authenticated' as const, user })),
      sendRegistrationCode: vi.fn(async () => ({ countdown: 60 })),
      completeTwoFactor: vi.fn(async () => ({ status: 'authenticated' as const, user })),
      logout: vi.fn(async () => undefined),
      getSessionState: vi.fn(() => ({ authenticated: true, user, twoFactorRequired: false })),
      getCurrentUser: vi.fn(async () => user),
      getUsageDashboardStats: vi.fn(),
      getUsageDashboardTrend: vi.fn(),
      getUsageDashboardModels: vi.fn(),
      redeemCode: vi.fn(async () => ({ message: 'Redeemed', type: 'balance', value: 5 })),
      getRedeemHistory: vi.fn(async () => [
        {
          id: 1,
          code: 'secret-code',
          type: 'balance',
          value: 5,
          status: 'used',
          used_at: '2026-08-06T00:00:00Z',
          created_at: '2026-08-06T00:00:00Z',
        },
      ]),
      getSubscriptionSummary: vi.fn(),
      getChannelMonitors: vi.fn(),
      getAnnouncements: vi.fn(),
      markAnnouncementRead: vi.fn(),
      getAvailableGroups: vi.fn(async () => [{ id: 4, name: 'Standard', platform: 'openai' }]),
      listApiKeys: vi.fn(async () => ({
        items: [
          {
            id: 7,
            user_id: 1,
            key: 'synthetic-user-api-key',
            name: 'desktop-key',
            group_id: null,
            status: 'active' as const,
            quota: 0,
            quota_used: 0,
            expires_at: null,
            created_at: '2026-08-06T00:00:00Z',
            updated_at: '2026-08-06T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        page_size: 100,
        pages: 1,
      })),
      createApiKey: vi.fn(),
      updateApiKey: vi.fn(),
      deleteApiKey: vi.fn(),
      copyApiKeyToClipboard: vi.fn((_id: number, writeText: (key: string) => void) => {
        writeText('synthetic-user-api-key')
        return Promise.resolve()
      }),
      prepareProviderBinding: vi.fn(),
      prepareInfiniteCanvasImport: vi.fn(async () => ({
        keyId: 7,
        keyName: 'desktop-key',
        baseUrl: 'https://naonaoai.shop',
        apiKey: 'synthetic-user-api-key',
        capability: 'text' as const,
        models: [{ id: 'gpt-test' }],
      })),
    } as unknown as Sub2ApiClient

    registerSub2ApiHandlers(client, registrar, () => true)

    expect([...handlers.keys()].sort()).toEqual(Object.values(SUB2API_IPC_CHANNELS).sort())
    expect(handlers.has('sub2api:get-usage-records')).toBe(false)
    expect(handlers.has('sub2api:get-usage-errors')).toBe(false)
    expect(handlers.has('sub2api:get-platform-quotas')).toBe(false)
    expect(handlers.has('sub2api:get-model-plaza')).toBe(false)
    const loginResult = await handlers.get(SUB2API_IPC_CHANNELS.login)?.(
      {},
      {
        email: 'user@example.test',
        password: 'synthetic-password',
      }
    )
    expect(JSON.stringify(loginResult)).not.toMatch(/accessToken|refreshToken|access_token|refresh_token/)

    const registrationResult = await handlers.get(SUB2API_IPC_CHANNELS.register)?.(
      {},
      { email: 'new-user@qq.com', password: 'synthetic-password', verify_code: '123456' }
    )
    expect(JSON.stringify(registrationResult)).not.toMatch(/accessToken|refreshToken|access_token|refresh_token/)
    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.sendRegistrationCode)?.({}, { email: 'new-user@qq.com' })
    ).resolves.toEqual({ countdown: 60 })

    const keyPage = await handlers.get(SUB2API_IPC_CHANNELS.listApiKeys)?.({})
    expect(keyPage).toMatchObject({ items: [{ key_hint: 'synthe...-key' }] })
    expect(JSON.stringify(keyPage)).not.toContain('synthetic-user-api-key')
    await expect(handlers.get(SUB2API_IPC_CHANNELS.getAvailableGroups)?.({})).resolves.toEqual([
      { id: 4, name: 'Standard', platform: 'openai' },
    ])
    await expect(handlers.get(SUB2API_IPC_CHANNELS.copyApiKey)?.({}, 7)).resolves.toBeUndefined()
    expect(mocks.writeText).toHaveBeenCalledWith('synthetic-user-api-key')
    const history = await handlers.get(SUB2API_IPC_CHANNELS.getRedeemHistory)?.({})
    expect(history).toMatchObject([{ code_hint: 'secr...code' }])
    expect(JSON.stringify(history)).not.toContain('secret-code')
    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.prepareInfiniteCanvasImport)?.({}, 7)
    ).resolves.toMatchObject({
      models: [{ id: 'gpt-test' }],
    })
  })

  it('rejects a remote sender before invoking the client', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const registrar = {
      handle: vi.fn((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
        handlers.set(channel, listener as (...args: unknown[]) => unknown)
      ),
    }
    const client = {
      getPublicSettings: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      sendRegistrationCode: vi.fn(),
      completeTwoFactor: vi.fn(),
      logout: vi.fn(),
      getSessionState: vi.fn(),
      getCurrentUser: vi.fn(),
      getUsageDashboardStats: vi.fn(),
      getUsageDashboardTrend: vi.fn(),
      getUsageDashboardModels: vi.fn(),
      redeemCode: vi.fn(),
      getRedeemHistory: vi.fn(),
      getSubscriptionSummary: vi.fn(),
      getChannelMonitors: vi.fn(),
      getAnnouncements: vi.fn(),
      markAnnouncementRead: vi.fn(),
      getAvailableGroups: vi.fn(),
      listApiKeys: vi.fn(),
      createApiKey: vi.fn(),
      updateApiKey: vi.fn(),
      deleteApiKey: vi.fn(),
      copyApiKeyToClipboard: vi.fn(),
      prepareProviderBinding: vi.fn(),
      prepareInfiniteCanvasImport: vi.fn(),
      streamDirectGatewayRequest: vi.fn(),
      cancelDirectGatewayRequest: vi.fn(),
    } as unknown as Sub2ApiClient

    registerSub2ApiHandlers(client, registrar, (event) => event.senderFrame?.url.startsWith('file:') === true)

    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.login)?.(
        { senderFrame: { url: 'https://untrusted.example' } },
        { email: 'user@example.test', password: 'synthetic-password' }
      )
    ).rejects.toThrow('untrusted renderer')
    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.prepareInfiniteCanvasImport)?.(
        { senderFrame: { url: 'https://untrusted.example' } },
        7
      )
    ).rejects.toThrow('untrusted renderer')
    expect(client.login).not.toHaveBeenCalled()
    expect(client.prepareInfiniteCanvasImport).not.toHaveBeenCalled()
  })

  it('acknowledges a gateway stream immediately and forwards response chunks by request ID', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const registrar = {
      handle: vi.fn((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
        handlers.set(channel, listener as (...args: unknown[]) => unknown)
      ),
    }
    const requestId = '11111111-1111-4111-8111-111111111111'
    const request: Sub2ApiDirectGatewayRequest = {
      url: 'https://naonaoai.shop/v1/responses',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"model":"gpt-test","stream":true}',
    }
    let resolveStream!: () => void
    const pendingStream = new Promise<void>((resolve) => {
      resolveStream = resolve
    })
    let emitStreamEvent: ((event: Sub2ApiDirectGatewayStreamEvent) => void) | undefined
    const client = {
      streamDirectGatewayRequest: vi.fn(
        (
          _requestId: string,
          _request: Sub2ApiDirectGatewayRequest,
          emit: (event: Sub2ApiDirectGatewayStreamEvent) => void
        ) => {
          emitStreamEvent = emit
          return pendingStream
        }
      ),
    } as unknown as Sub2ApiClient
    const sender = createSender()

    registerSub2ApiHandlers(client, registrar, () => true)

    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.startDirectGatewayStream)?.({ sender }, { requestId, request })
    ).resolves.toEqual({ requestId })
    expect(client.streamDirectGatewayRequest).toHaveBeenCalledWith(requestId, request, expect.any(Function))

    const events: Sub2ApiDirectGatewayStreamEvent[] = [
      {
        requestId,
        type: 'response',
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
      { requestId, type: 'data', data: 'data: {"type":"response.output_text.delta"}\n\n' },
      { requestId, type: 'complete' },
    ]
    for (const event of events) {
      emitStreamEvent?.(event)
    }

    expect(sender.isDestroyed).toHaveBeenCalledTimes(events.length)
    expect(sender.send.mock.calls).toEqual(events.map((event) => [SUB2API_IPC_EVENTS.directGatewayStream, event]))
    resolveStream()
    await pendingStream
  })

  it('sends only a safe serialized gateway error to the renderer', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const registrar = {
      handle: vi.fn((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
        handlers.set(channel, listener as (...args: unknown[]) => unknown)
      ),
    }
    const requestId = '22222222-2222-4222-8222-222222222222'
    const client = {
      streamDirectGatewayRequest: vi.fn(() =>
        Promise.reject(new Sub2ApiError('secret upstream response', 'RATE_LIMIT', 429, 'internal', 5))
      ),
    } as unknown as Sub2ApiClient
    const sender = createSender()

    registerSub2ApiHandlers(client, registrar, () => true)

    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.startDirectGatewayStream)?.(
        { sender },
        {
          requestId,
          request: { url: 'https://naonaoai.shop/v1/responses', method: 'POST' },
        }
      )
    ).resolves.toEqual({ requestId })
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledOnce())

    const [, streamEvent] = sender.send.mock.calls[0]
    expect(streamEvent).toEqual({
      requestId,
      type: 'error',
      error: '__NAONAOAI_SUB2API_ERROR__{"kind":"rate_limited","status":429,"retryAfterSeconds":5}',
    })
    expect(JSON.stringify(streamEvent)).not.toContain('secret upstream response')
    expect(JSON.stringify(streamEvent)).not.toContain('internal')
  })

  it('cancels the matching main-process gateway request', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const registrar = {
      handle: vi.fn((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
        handlers.set(channel, listener as (...args: unknown[]) => unknown)
      ),
    }
    const requestId = '33333333-3333-4333-8333-333333333333'
    const client = {
      cancelDirectGatewayRequest: vi.fn(),
      streamDirectGatewayRequest: vi.fn(() => new Promise<void>(() => undefined)),
    } as unknown as Sub2ApiClient
    const sender = createSender()

    registerSub2ApiHandlers(client, registrar, () => true)

    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.startDirectGatewayStream)?.(
        { sender },
        { requestId, request: { url: 'https://naonaoai.shop/v1/responses', method: 'POST' } }
      )
    ).resolves.toEqual({ requestId })
    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.cancelDirectGatewayStream)?.({ sender }, requestId)
    ).resolves.toBeUndefined()
    expect(client.cancelDirectGatewayRequest).toHaveBeenCalledOnce()
    expect(client.cancelDirectGatewayRequest).toHaveBeenCalledWith(requestId)
  })

  it('keeps the stream across same-document routing and cancels a real main-frame navigation', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const registrar = {
      handle: vi.fn((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
        handlers.set(channel, listener as (...args: unknown[]) => unknown)
      ),
    }
    let resolveStream!: () => void
    const pendingStream = new Promise<void>((resolve) => {
      resolveStream = resolve
    })
    const client = {
      streamDirectGatewayRequest: vi.fn(() => pendingStream),
      cancelDirectGatewayRequest: vi.fn(),
    } as unknown as Sub2ApiClient
    const sender = createSender()
    const requestId = '99999999-9999-4999-8999-999999999999'

    registerSub2ApiHandlers(client, registrar, () => true)
    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.startDirectGatewayStream)?.(
        { sender },
        { requestId, request: { url: 'https://naonaoai.shop/v1/responses', method: 'POST' } }
      )
    ).resolves.toEqual({ requestId })

    sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true }, '', true, true)
    sender.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false }, '', false, false)
    expect(client.cancelDirectGatewayRequest).not.toHaveBeenCalled()

    sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false }, '', false, true)
    expect(client.cancelDirectGatewayRequest).toHaveBeenCalledOnce()
    expect(client.cancelDirectGatewayRequest).toHaveBeenCalledWith(requestId)

    resolveStream()
    await pendingStream
  })

  it('supports deprecated navigation arguments without cancelling in-place routing', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const registrar = {
      handle: vi.fn((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
        handlers.set(channel, listener as (...args: unknown[]) => unknown)
      ),
    }
    let resolveStream!: () => void
    const pendingStream = new Promise<void>((resolve) => {
      resolveStream = resolve
    })
    const client = {
      streamDirectGatewayRequest: vi.fn(() => pendingStream),
      cancelDirectGatewayRequest: vi.fn(),
    } as unknown as Sub2ApiClient
    const sender = createSender()
    const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

    registerSub2ApiHandlers(client, registrar, () => true)
    await handlers.get(SUB2API_IPC_CHANNELS.startDirectGatewayStream)?.(
      { sender },
      { requestId, request: { url: 'https://naonaoai.shop/v1/responses', method: 'POST' } }
    )

    sender.emit('did-start-navigation', {}, '', true, true)
    expect(client.cancelDirectGatewayRequest).not.toHaveBeenCalled()
    sender.emit('did-start-navigation', {}, '', false, true)
    expect(client.cancelDirectGatewayRequest).toHaveBeenCalledWith(requestId)

    resolveStream()
    await pendingStream
  })

  it('rejects cancellation from a different trusted renderer', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const registrar = {
      handle: vi.fn((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
        handlers.set(channel, listener as (...args: unknown[]) => unknown)
      ),
    }
    const requestId = '77777777-7777-4777-8777-777777777777'
    const client = {
      streamDirectGatewayRequest: vi.fn(() => new Promise<void>(() => undefined)),
      cancelDirectGatewayRequest: vi.fn(),
    } as unknown as Sub2ApiClient
    const owner = createSender(1)

    registerSub2ApiHandlers(client, registrar, () => true)
    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.startDirectGatewayStream)?.(
        { sender: owner },
        { requestId, request: { url: 'https://naonaoai.shop/v1/responses', method: 'POST' } }
      )
    ).resolves.toEqual({ requestId })

    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.cancelDirectGatewayStream)?.({ sender: createSender(2) }, requestId)
    ).rejects.toThrow('__NAONAOAI_SUB2API_ERROR__')
    expect(client.cancelDirectGatewayRequest).not.toHaveBeenCalled()
  })

  it('cancels the real request when its renderer process exits', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const registrar = {
      handle: vi.fn((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
        handlers.set(channel, listener as (...args: unknown[]) => unknown)
      ),
    }
    let resolveStream!: () => void
    const pendingStream = new Promise<void>((resolve) => {
      resolveStream = resolve
    })
    const client = {
      streamDirectGatewayRequest: vi.fn(() => pendingStream),
      cancelDirectGatewayRequest: vi.fn(),
    } as unknown as Sub2ApiClient
    const sender = createSender()
    const requestId = '55555555-5555-4555-8555-555555555555'

    registerSub2ApiHandlers(client, registrar, () => true)
    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.startDirectGatewayStream)?.(
        { sender },
        { requestId, request: { url: 'https://naonaoai.shop/v1/responses', method: 'POST' } }
      )
    ).resolves.toEqual({ requestId })

    sender.emit('render-process-gone')
    expect(client.cancelDirectGatewayRequest).toHaveBeenCalledWith(requestId)

    resolveStream()
    await pendingStream
    await vi.waitFor(() => expect(sender.listenerCount('render-process-gone')).toBe(0))
    expect(sender.listenerCount('destroyed')).toBe(0)
    expect(sender.listenerCount('did-start-navigation')).toBe(0)
  })

  it('rejects the same active request ID from a different renderer', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const registrar = {
      handle: vi.fn((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
        handlers.set(channel, listener as (...args: unknown[]) => unknown)
      ),
    }
    let resolveStream!: () => void
    const pendingStream = new Promise<void>((resolve) => {
      resolveStream = resolve
    })
    const client = {
      streamDirectGatewayRequest: vi.fn(() => pendingStream),
      cancelDirectGatewayRequest: vi.fn(),
    } as unknown as Sub2ApiClient
    const requestId = '66666666-6666-4666-8666-666666666666'
    const input = { requestId, request: { url: 'https://naonaoai.shop/v1/responses', method: 'POST' } }
    const firstSender = createSender(1)

    registerSub2ApiHandlers(client, registrar, () => true)
    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.startDirectGatewayStream)?.({ sender: firstSender }, input)
    ).resolves.toEqual({ requestId })
    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.startDirectGatewayStream)?.({ sender: createSender(2) }, input)
    ).rejects.toThrow('__NAONAOAI_SUB2API_ERROR__')
    expect(client.streamDirectGatewayRequest).toHaveBeenCalledOnce()
    resolveStream()
    await pendingStream
    await vi.waitFor(() => expect(firstSender.listenerCount('destroyed')).toBe(0))
  })

  it('rejects untrusted gateway start and cancel calls before invoking the client', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const registrar = {
      handle: vi.fn((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
        handlers.set(channel, listener as (...args: unknown[]) => unknown)
      ),
    }
    const client = {
      streamDirectGatewayRequest: vi.fn(),
      cancelDirectGatewayRequest: vi.fn(),
    } as unknown as Sub2ApiClient
    const requestId = '44444444-4444-4444-8444-444444444444'
    const untrustedEvent = {
      senderFrame: { url: 'https://untrusted.example' },
      sender: { send: vi.fn(), isDestroyed: vi.fn(() => false) },
    }

    registerSub2ApiHandlers(client, registrar, (event) => event.senderFrame?.url.startsWith('file:') === true)

    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.startDirectGatewayStream)?.(untrustedEvent, {
        requestId,
        request: { url: 'https://naonaoai.shop/v1/responses', method: 'POST' },
      })
    ).rejects.toThrow('untrusted renderer')
    await expect(
      handlers.get(SUB2API_IPC_CHANNELS.cancelDirectGatewayStream)?.(untrustedEvent, requestId)
    ).rejects.toThrow('untrusted renderer')
    expect(client.streamDirectGatewayRequest).not.toHaveBeenCalled()
    expect(client.cancelDirectGatewayRequest).not.toHaveBeenCalled()
    expect(untrustedEvent.sender.send).not.toHaveBeenCalled()
  })

  it('serializes only the safe error descriptor for renderer callers', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const registrar = {
      handle: vi.fn((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
        handlers.set(channel, listener as (...args: unknown[]) => unknown)
      ),
    }
    const client = {
      getPublicSettings: vi.fn(() => {
        throw new Sub2ApiError('secret upstream response', 'RATE_LIMIT', 429, 'internal', 5)
      }),
    } as unknown as Sub2ApiClient
    registerSub2ApiHandlers(client, registrar, () => true)

    await expect(handlers.get(SUB2API_IPC_CHANNELS.getPublicSettings)?.({})).rejects.toThrow(
      '__NAONAOAI_SUB2API_ERROR__{"kind":"rate_limited","status":429,"retryAfterSeconds":5}'
    )
    await expect(handlers.get(SUB2API_IPC_CHANNELS.getPublicSettings)?.({})).rejects.not.toThrow(
      'secret upstream response'
    )
  })
})
