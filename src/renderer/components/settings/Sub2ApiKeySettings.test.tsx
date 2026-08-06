// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import type { Sub2ApiApiKeySummary } from '@shared/sub2api/contracts'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import Sub2ApiKeySettings from './Sub2ApiKeySettings'

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
    completeTwoFactor: vi.fn(),
    logout: vi.fn(),
    getSessionState: vi.fn(),
    getCurrentUser: vi.fn(),
    getUsageDashboardStats: vi.fn(),
    getUsageDashboardTrend: vi.fn(),
    getUsageDashboardModels: vi.fn(),
    getSubscriptionSummary: vi.fn(),
    getPlatformQuotas: vi.fn(),
    listApiKeys: vi.fn().mockResolvedValue({ items: [keySummary], total: 1, page: 1, page_size: 100, pages: 1 }),
    createApiKey: vi.fn().mockResolvedValue({ ...keySummary, id: 8, name: 'new-key' }),
    updateApiKey: vi.fn().mockResolvedValue({ ...keySummary, name: 'renamed-key' }),
    deleteApiKey: vi.fn().mockResolvedValue(undefined),
    prepareProviderBinding: vi.fn().mockResolvedValue({
      apiKey: 'full-key-must-not-be-in-list',
      apiHost: 'https://naonaoai.shop/v1',
      models: [{ id: 'gpt-test' }, { id: 'codex-test' }],
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

  test('creates a key and explicitly binds the selected key to the provider', async () => {
    const api = createApi()
    const onBindProvider = renderKeys(api)

    fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }))
    fireEvent.change(screen.getAllByLabelText(/Key name/)[0], { target: { value: 'new-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(api.createApiKey).toHaveBeenCalledWith({ name: 'new-key' }))

    expect(screen.queryByText(/Chatbox/i)).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Use for chat' })[0])
    await waitFor(() =>
      expect(onBindProvider).toHaveBeenCalledWith({
        apiKey: 'full-key-must-not-be-in-list',
        apiHost: 'https://naonaoai.shop/v1',
        models: [{ id: 'gpt-test' }, { id: 'codex-test' }],
      })
    )
  })
})
