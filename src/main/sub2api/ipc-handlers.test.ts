import type { ipcMain } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { Sub2ApiError } from '../../shared/sub2api/errors'
import { SUB2API_IPC_CHANNELS } from '../../shared/sub2api/ipc'
import type { Sub2ApiClient } from './client'
import { registerSub2ApiHandlers } from './ipc-handlers'

const mocks = vi.hoisted(() => ({ writeText: vi.fn() }))

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, clipboard: { writeText: mocks.writeText } }))

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
    await expect(handlers.get(SUB2API_IPC_CHANNELS.prepareInfiniteCanvasImport)?.({}, 7, 'text')).resolves.toMatchObject({
      capability: 'text',
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
        7,
        'text'
      )
    ).rejects.toThrow('untrusted renderer')
    expect(client.login).not.toHaveBeenCalled()
    expect(client.prepareInfiniteCanvasImport).not.toHaveBeenCalled()
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
      '__NAONAO_SUB2API_ERROR__{"kind":"rate_limited","status":429,"retryAfterSeconds":5}'
    )
    await expect(handlers.get(SUB2API_IPC_CHANNELS.getPublicSettings)?.({})).rejects.not.toThrow(
      'secret upstream response'
    )
  })
})
