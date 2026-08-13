// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import type { Sub2ApiApiKeySummary } from '@shared/sub2api/contracts'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import Sub2ApiKeyOnboardingModal from './Sub2ApiKeyOnboardingModal'

const mocks = vi.hoisted(() => ({
  applyBinding: vi.fn().mockResolvedValue({ modelId: 'gpt-5.6-sol', sessionId: 'default-chat' }),
  switchCurrentSession: vi.fn(),
  t: (key: string) => key,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.t }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))
vi.mock('./sub2api-provider-binding', () => ({ applySub2ApiProviderBinding: mocks.applyBinding }))
vi.mock('@/stores/sessionActions', () => ({ switchCurrentSession: mocks.switchCurrentSession }))

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

const existingKey: Sub2ApiApiKeySummary = {
  id: 7,
  user_id: 1,
  name: 'existing-key',
  key_hint: 'sk-abc...xyz',
  group_id: 4,
  status: 'active',
  quota: 0,
  quota_used: 0,
  expires_at: null,
  created_at: '2026-08-12T00:00:00Z',
  updated_at: '2026-08-12T00:00:00Z',
}

function createApi(overrides: Partial<Sub2ApiRendererApi> = {}): Sub2ApiRendererApi {
  return {
    listApiKeys: vi.fn().mockResolvedValue({ items: [existingKey], total: 1, page: 1, page_size: 100, pages: 1 }),
    getAvailableGroups: vi.fn().mockResolvedValue([{ id: 4, name: 'Standard', platform: 'openai' }]),
    createApiKey: vi.fn().mockResolvedValue({ ...existingKey, id: 8, name: 'created-key' }),
    prepareProviderBinding: vi.fn().mockResolvedValue({
      apiKey: 'full-key-never-rendered',
      apiHost: 'https://naonaoai.shop/v1',
      models: [{ id: 'gpt-5.6-sol' }],
    }),
    ...overrides,
  } as Sub2ApiRendererApi
}

function renderModal(api: Sub2ApiRendererApi, onClose = vi.fn()) {
  render(
    <MantineProvider>
      <Sub2ApiKeyOnboardingModal api={api} opened={true} onClose={onClose} />
    </MantineProvider>
  )
  return onClose
}

describe('Sub2ApiKeyOnboardingModal', () => {
  beforeEach(() => {
    mocks.applyBinding.mockClear()
    mocks.switchCurrentSession.mockClear()
  })

  test('shows only the masked key and binds exactly once after explicit apply', async () => {
    let resolveBinding: ((value: { apiKey: string; apiHost: string; models: { id: string }[] }) => void) | undefined
    const prepareProviderBinding = vi.fn(
      () =>
        new Promise<{ apiKey: string; apiHost: string; models: { id: string }[] }>((resolve) => {
          resolveBinding = resolve
        })
    )
    const api = createApi({ prepareProviderBinding })
    const onClose = renderModal(api)

    expect(await screen.findByText('existing-key')).toBeTruthy()
    expect(screen.getByText('sk-abc...xyz')).toBeTruthy()
    expect(screen.queryByText('full-key-never-rendered')).toBeNull()

    const applyButton = screen.getByRole('button', { name: 'Apply to chat' })
    fireEvent.click(applyButton)
    fireEvent.click(applyButton)
    expect(prepareProviderBinding).toHaveBeenCalledTimes(1)

    resolveBinding?.({
      apiKey: 'full-key-never-rendered',
      apiHost: 'https://naonaoai.shop/v1',
      models: [{ id: 'gpt-5.6-sol' }],
    })
    await waitFor(() => expect(mocks.applyBinding).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mocks.switchCurrentSession).toHaveBeenCalledWith('default-chat')
    expect(screen.queryByText('full-key-never-rendered')).toBeNull()
  })

  test('creates and selects a key without binding until the user applies it', async () => {
    const createdKey = { ...existingKey, id: 8, name: 'created-key' }
    const api = createApi({
      listApiKeys: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100, pages: 1 }),
      createApiKey: vi.fn().mockResolvedValue(createdKey),
    })
    renderModal(api)

    fireEvent.change((await screen.findAllByRole('textbox'))[0], { target: { value: 'created-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }))

    await waitFor(() => expect(api.createApiKey).toHaveBeenCalledWith({ name: 'created-key', group_id: 4 }))
    expect(await screen.findByText('API key created. Apply it to enable chat.')).toBeTruthy()
    expect(api.prepareProviderBinding).not.toHaveBeenCalled()
    expect(mocks.applyBinding).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Apply to chat' }))
    await waitFor(() => expect(api.prepareProviderBinding).toHaveBeenCalledWith(8))
    expect(mocks.applyBinding).toHaveBeenCalledOnce()
  })
})
