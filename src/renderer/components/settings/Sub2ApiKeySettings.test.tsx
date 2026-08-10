// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import type { Sub2ApiApiKeySummary } from '@shared/sub2api/contracts'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import Sub2ApiKeySettings from './Sub2ApiKeySettings'

const navigationMocks = vi.hoisted(() => ({
  createSession: vi.fn().mockResolvedValue({ id: 'new-chat-session' }),
  switchCurrentSession: vi.fn(),
  navigate: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/router', () => ({ router: { navigate: navigationMocks.navigate } }))
vi.mock('@/stores/chatStore', () => ({ createSession: navigationMocks.createSession }))
vi.mock('@/stores/sessionActions', () => ({ switchCurrentSession: navigationMocks.switchCurrentSession }))
vi.mock('@/stores/sessionHelpers', () => ({
  initEmptyChatSession: vi.fn(() => ({ name: 'Untitled', type: 'chat', messages: [], settings: {} })),
}))

const mocks = vi.hoisted(() => ({
  t: (key: string, options?: { count?: number }) =>
    options?.count === undefined ? key : key.replace('{{count}}', String(options.count)),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.t }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })),
})

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const keySummary: Sub2ApiApiKeySummary = {
  id: 7,
  user_id: 1,
  name: 'desktop-key',
  key_hint: 'sk-5...-key',
  group_id: null,
  status: 'active',
  quota: 0,
  quota_used: 0,
  expires_at: null,
  created_at: '2026-08-06T00:00:00Z',
  updated_at: '2026-08-06T00:00:00Z',
}

function createApi(overrides: Partial<Sub2ApiRendererApi> = {}): Sub2ApiRendererApi {
  return {
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
    getRedeemHistory: vi.fn().mockResolvedValue([]),
    getSubscriptionSummary: vi.fn(),
    getChannelMonitors: vi.fn(),
    getAnnouncements: vi.fn(),
    markAnnouncementRead: vi.fn(),
    getAvailableGroups: vi.fn().mockResolvedValue([{ id: 4, name: 'Standard', platform: 'openai' }]),
    listApiKeys: vi.fn().mockResolvedValue({ items: [keySummary], total: 1, page: 1, page_size: 100, pages: 1 }),
    createApiKey: vi.fn().mockResolvedValue({ ...keySummary, id: 8, name: 'new-key' }),
    updateApiKey: vi.fn().mockResolvedValue({ ...keySummary, name: 'renamed-key' }),
    deleteApiKey: vi.fn().mockResolvedValue(undefined),
    copyApiKey: vi.fn().mockResolvedValue(undefined),
    prepareProviderBinding: vi.fn().mockResolvedValue({
      apiKey: 'full-key-must-not-be-in-list',
      apiHost: 'https://naonaoai.shop/v1',
      models: [{ id: 'gpt-test' }, { id: 'codex-test' }],
    }),
    prepareInfiniteCanvasImport: vi.fn().mockResolvedValue({
      keyId: 7,
      keyName: 'desktop-key',
      baseUrl: 'https://naonaoai.shop',
      apiKey: 'full-key-must-not-be-in-list',
      capability: 'image',
      models: [{ id: 'gpt-image-test' }],
    }),
    ...overrides,
  }
}

function renderKeys(api: Sub2ApiRendererApi, onBindProvider = vi.fn()) {
  render(
    <MantineProvider>
      <Sub2ApiKeySettings api={api} onBindProvider={onBindProvider} />
    </MantineProvider>
  )
  return onBindProvider
}

describe('Sub2ApiKeySettings', () => {
  test('renders only the masked key returned by the main process', async () => {
    const api = createApi()
    renderKeys(api)

    expect(await screen.findByText('desktop-key')).toBeTruthy()
    expect(screen.getByText('sk-5...-key')).toBeTruthy()
    expect(screen.queryByText('full-key-must-not-be-in-list')).toBeNull()
  })

  test('creates a grouped key and explicitly binds the selected key to the provider', async () => {
    const api = createApi()
    const onBindProvider = renderKeys(api)

    fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }))
    fireEvent.change(screen.getAllByLabelText(/Key name/)[0], { target: { value: 'new-key' } })
    fireEvent.click(await screen.findByLabelText('Group'))
    fireEvent.click(screen.getByText('Standard (openai)'))
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(api.createApiKey).toHaveBeenCalledWith({ name: 'new-key', group_id: 4 }))

    expect(screen.queryByText(/Chatbox/i)).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Use for chat' })[0])
    await waitFor(() =>
      expect(onBindProvider).toHaveBeenCalledWith({
        apiKey: 'full-key-must-not-be-in-list',
        apiHost: 'https://naonaoai.shop/v1',
        models: [{ id: 'gpt-test' }, { id: 'codex-test' }],
      })
    )
    await waitFor(() =>
      expect(navigationMocks.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'chat',
          settings: expect.objectContaining({ provider: 'openai', modelId: 'gpt-test' }),
        })
      )
    )
    expect(navigationMocks.switchCurrentSession).toHaveBeenCalledWith('new-chat-session')
  })

  test('asks the user to restart when an older preload does not expose group loading', async () => {
    const api = createApi()
    Reflect.deleteProperty(api as object, 'getAvailableGroups')
    renderKeys(api)

    fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }))

    expect(await screen.findByText('Group selection needs an app restart. Please restart and try again.')).toBeTruthy()
  })

  test('updates the key group and copies without exposing the full key', async () => {
    const api = createApi()
    renderKeys(api)

    await screen.findByText('desktop-key')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(await screen.findByLabelText('Group'))
    fireEvent.click(screen.getByText('Standard (openai)'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.updateApiKey).toHaveBeenCalledWith(7, { name: 'desktop-key', group_id: 4 }))

    fireEvent.click(screen.getByRole('button', { name: 'Copy API key' }))
    await waitFor(() => expect(api.copyApiKey).toHaveBeenCalledWith(7))
    expect(screen.queryByText('full-key-must-not-be-in-list')).toBeNull()
  })

  test('selects a canvas capability before importing the key', async () => {
    const api = createApi()
    renderKeys(api)
    await screen.findByText('desktop-key')

    fireEvent.click(screen.getByRole('button', { name: 'Import to Infinite Canvas' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('radio', { name: 'Image model' }))
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    await waitFor(() => expect(api.prepareInfiniteCanvasImport).toHaveBeenCalledWith(7, 'image'))
    await waitFor(() => expect(navigationMocks.navigate).toHaveBeenCalledWith({ to: '/infinite-canvas' }))
  })
})
