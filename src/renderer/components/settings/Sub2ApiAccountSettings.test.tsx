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
    register: vi.fn().mockResolvedValue({ status: 'authenticated', user }),
    sendRegistrationCode: vi.fn().mockResolvedValue({ countdown: 60 }),
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
    getUsageDashboardTrend: vi
      .fn()
      .mockResolvedValue({ trend: [], start_date: '2026-07-30', end_date: '2026-08-05', granularity: 'day' }),
    getUsageDashboardModels: vi
      .fn()
      .mockResolvedValue({ models: [], start_date: '2026-07-30', end_date: '2026-08-05' }),
    redeemCode: vi.fn(),
    getRedeemHistory: vi.fn().mockResolvedValue([]),
    getSubscriptionSummary: vi.fn().mockResolvedValue({ active_count: 0, total_used_usd: 0, subscriptions: [] }),
    getChannelMonitors: vi.fn().mockResolvedValue({ items: [] }),
    getAnnouncements: vi.fn().mockResolvedValue([]),
    markAnnouncementRead: vi.fn(),
    getAvailableGroups: vi.fn().mockResolvedValue([]),
    listApiKeys: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100, pages: 1 }),
    createApiKey: vi.fn(),
    updateApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
    copyApiKey: vi.fn(),
    prepareProviderBinding: vi.fn(),
    prepareInfiniteCanvasImport: vi.fn(),
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
  test('loads through a frozen context bridge API', async () => {
    const api = Object.freeze(createApi())
    renderAccount(api)

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByText('Account unavailable')).toBeNull()
    expect(api.getPublicSettings).toHaveBeenCalledOnce()
    expect(api.getSessionState).toHaveBeenCalledOnce()
  })

  test('signs in without exposing credentials in the rendered account state', async () => {
    const api = createApi()
    renderAccount(api)

    fireEvent.change(await screen.findByLabelText(/Email/), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'secret-password' } })
    fireEvent.click(screen.getByLabelText('Keep me signed in'))
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('desktop-user')).toBeTruthy()
    expect(api.login).toHaveBeenCalledWith({ email: 'user@example.com', password: 'secret-password', auto_login: true })
    expect(screen.queryByText('secret-password')).toBeNull()
  })

  test('registers with an email verification code and the server suffix policy', async () => {
    const api = createApi({
      getPublicSettings: vi.fn().mockResolvedValue({
        registration_enabled: true,
        email_verify_enabled: true,
        registration_email_suffix_whitelist: ['@qq.com'],
      }),
    })
    renderAccount(api)

    fireEvent.click(await screen.findByRole('button', { name: 'Register' }))
    fireEvent.change(screen.getAllByLabelText(/Email/)[0], {
      target: { value: 'new-user@qq.com' },
    })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'new-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

    expect(await screen.findByText('Verification code sent. Check your email.')).toBeTruthy()
    expect(api.sendRegistrationCode).toHaveBeenCalledWith({ email: 'new-user@qq.com' })

    fireEvent.change(screen.getAllByLabelText(/Email/)[1], {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('desktop-user')).toBeTruthy()
    expect(api.register).toHaveBeenCalledWith({
      email: 'new-user@qq.com',
      password: 'new-password',
      verify_code: '123456',
    })
    expect(screen.queryByText('new-password')).toBeNull()
  })

  test('rejects a registration email outside the server suffix policy', async () => {
    const api = createApi({
      getPublicSettings: vi.fn().mockResolvedValue({
        registration_enabled: true,
        email_verify_enabled: true,
        registration_email_suffix_whitelist: ['@qq.com'],
      }),
    })
    renderAccount(api)

    fireEvent.click(await screen.findByRole('button', { name: 'Register' }))
    fireEvent.change(screen.getAllByLabelText(/Email/)[0], {
      target: { value: 'new-user@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

    expect(await screen.findByText('This email domain is not allowed for registration.')).toBeTruthy()
    expect(api.sendRegistrationCode).not.toHaveBeenCalled()
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

  test('keeps the login form visible when the account service is unavailable', async () => {
    const api = createApi({
      getPublicSettings: vi.fn().mockRejectedValue(new Error('network unavailable')),
    })
    renderAccount(api)

    expect(await screen.findByText('Account unavailable')).toBeTruthy()
    expect(screen.getByLabelText(/Email/)).toBeTruthy()
    expect(screen.getByLabelText(/Password/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  test('keeps the signed-in user visible when an account request is rate limited', async () => {
    const rateLimitError = new Error(
      '__NAONAO_SUB2API_ERROR__{"kind":"rate_limited","status":429,"retryAfterSeconds":4}'
    )
    const api = createApi({
      getSessionState: vi.fn().mockResolvedValue({ authenticated: true, user, twoFactorRequired: false }),
      getUsageDashboardStats: vi.fn().mockRejectedValue(rateLimitError),
    })
    renderAccount(api)

    expect(await screen.findByText('desktop-user')).toBeTruthy()
    expect(await screen.findByText('Too many requests. Wait a moment and try again.')).toBeTruthy()
    expect(screen.getAllByText('user@example.com').length).toBeGreaterThan(0)
  })
})
