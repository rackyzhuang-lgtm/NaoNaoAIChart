// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import Sub2ApiAccountSettings from './Sub2ApiAccountSettings'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn(
    (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })
  ),
})

const mocks = vi.hoisted(() => ({
  t: (key: string) => key,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.t }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

const user = {
  id: 7,
  username: 'desktop-user',
  email: 'user@example.com',
  role: 'user' as const,
  balance: 12.5,
  concurrency: 3,
  status: 'active' as const,
  run_mode: 'standard' as const,
}

function createApi(overrides: Partial<Sub2ApiRendererApi> = {}): Sub2ApiRendererApi {
  return {
    getPublicSettings: vi.fn().mockResolvedValue({ registration_enabled: true }),
    login: vi.fn().mockResolvedValue({ status: 'authenticated', user }),
    completeTwoFactor: vi.fn().mockResolvedValue({ status: 'authenticated', user }),
    logout: vi.fn().mockResolvedValue(undefined),
    getSessionState: vi.fn().mockResolvedValue({ authenticated: false, user: null, twoFactorRequired: false }),
    getCurrentUser: vi.fn().mockResolvedValue(user),
    getUsageDashboardStats: vi.fn().mockResolvedValue({
      total_api_keys: 0,
      active_api_keys: 0,
      total_requests: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cache_creation_tokens: 0,
      total_cache_read_tokens: 0,
      total_tokens: 0,
      total_cost: 0,
      total_actual_cost: 0,
      today_requests: 0,
      today_input_tokens: 0,
      today_output_tokens: 0,
      today_cache_creation_tokens: 0,
      today_cache_read_tokens: 0,
      today_tokens: 0,
      today_cost: 0,
      today_actual_cost: 0,
      average_duration_ms: 0,
      rpm: 0,
      tpm: 0,
    }),
    getSubscriptionSummary: vi.fn().mockResolvedValue({ active_count: 0, total_used_usd: 0, subscriptions: [] }),
    getPlatformQuotas: vi.fn().mockResolvedValue({ platform_quotas: [] }),
    listApiKeys: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100, pages: 1 }),
    createApiKey: vi.fn(),
    updateApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
    prepareProviderBinding: vi.fn(),
    ...overrides,
  }
}

function renderAccount(api: Sub2ApiRendererApi) {
  render(
    <MantineProvider>
      <Sub2ApiAccountSettings api={api} />
    </MantineProvider>
  )
}

describe('Sub2ApiAccountSettings', () => {
  test('signs in without exposing credentials in the rendered account state', async () => {
    const api = createApi()
    renderAccount(api)

    fireEvent.change(await screen.findByLabelText(/Email/), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'secret-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('desktop-user')).toBeTruthy()
    expect(api.login).toHaveBeenCalledWith({ email: 'user@example.com', password: 'secret-password' })
    expect(screen.queryByText('secret-password')).toBeNull()
  })

  test('completes a two-factor challenge', async () => {
    const api = createApi({
      login: vi.fn().mockResolvedValue({ status: 'two_factor_required', userEmailMasked: 'u***@example.com' }),
    })
    renderAccount(api)

    fireEvent.change(await screen.findByLabelText(/Email/), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    fireEvent.change(await screen.findByLabelText(/Verification Code/), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify and Log in' }))

    expect(await screen.findByText('desktop-user')).toBeTruthy()
    expect(api.completeTwoFactor).toHaveBeenCalledWith('123456')
  })

  test('returns an expired server session to the login form', async () => {
    const getSessionState = vi
      .fn()
      .mockResolvedValueOnce({ authenticated: true, user, twoFactorRequired: false })
      .mockResolvedValueOnce({ authenticated: false, user: null, twoFactorRequired: false })
    const api = createApi({
      getSessionState,
      getCurrentUser: vi.fn().mockRejectedValue(new Error('Session expired')),
    })
    renderAccount(api)

    expect(await screen.findByText('Your session expired. Please sign in again.')).toBeTruthy()
    await waitFor(() => expect(getSessionState).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })
})
