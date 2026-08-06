import type { ipcMain } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { SUB2API_IPC_CHANNELS } from '../../shared/sub2api/ipc'
import type { Sub2ApiClient } from './client'
import { registerSub2ApiHandlers } from './ipc-handlers'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

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
      getUsageRecords: vi.fn(),
      getSubscriptionSummary: vi.fn(),
      getPlatformQuotas: vi.fn(),
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
      prepareProviderBinding: vi.fn(),
    } as unknown as Sub2ApiClient

    registerSub2ApiHandlers(client, registrar, () => true)

    expect([...handlers.keys()].sort()).toEqual(Object.values(SUB2API_IPC_CHANNELS).sort())
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
  })

  it('rejects a remote sender before invoking the client', () => {
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
      getUsageRecords: vi.fn(),
      getSubscriptionSummary: vi.fn(),
      getPlatformQuotas: vi.fn(),
      listApiKeys: vi.fn(),
      createApiKey: vi.fn(),
      updateApiKey: vi.fn(),
      deleteApiKey: vi.fn(),
      prepareProviderBinding: vi.fn(),
    } as unknown as Sub2ApiClient

    registerSub2ApiHandlers(client, registrar, (event) => event.senderFrame?.url.startsWith('file:') === true)

    expect(() =>
      handlers.get(SUB2API_IPC_CHANNELS.login)?.(
        { senderFrame: { url: 'https://untrusted.example' } },
        { email: 'user@example.test', password: 'synthetic-password' }
      )
    ).toThrow('untrusted renderer')
    expect(client.login).not.toHaveBeenCalled()
  })
})
