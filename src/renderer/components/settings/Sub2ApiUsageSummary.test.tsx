// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import Sub2ApiUsageSummary from './Sub2ApiUsageSummary'

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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

const dashboardStats = {
  total_api_keys: 2,
  active_api_keys: 1,
  total_requests: 1234,
  total_input_tokens: 8000,
  total_output_tokens: 2000,
  total_cache_creation_tokens: 0,
  total_cache_read_tokens: 500,
  total_tokens: 10500,
  total_cost: 1.5,
  total_actual_cost: 1.2345,
  today_requests: 4,
  today_input_tokens: 100,
  today_output_tokens: 50,
  today_cache_creation_tokens: 0,
  today_cache_read_tokens: 10,
  today_tokens: 160,
  today_cost: 0.2,
  today_actual_cost: 0.125,
  average_duration_ms: 450,
  rpm: 0.2,
  tpm: 5,
}

function createApi(overrides: Partial<Sub2ApiRendererApi> = {}): Sub2ApiRendererApi {
  return {
    getPublicSettings: vi.fn(),
    login: vi.fn(),
    completeTwoFactor: vi.fn(),
    logout: vi.fn(),
    getSessionState: vi.fn(),
    getCurrentUser: vi.fn(),
    getUsageDashboardStats: vi.fn().mockResolvedValue(dashboardStats),
    getSubscriptionSummary: vi.fn().mockResolvedValue({
      active_count: 1,
      total_used_usd: 2,
      subscriptions: [
        {
          id: 4,
          group_id: 2,
          group_name: 'Pro plan',
          status: 'active',
          daily_used_usd: 1,
          daily_limit_usd: 5,
          expires_at: '2026-09-01T00:00:00Z',
        },
      ],
    }),
    listApiKeys: vi.fn(),
    createApiKey: vi.fn(),
    updateApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
    prepareProviderBinding: vi.fn(),
    ...overrides,
  }
}

function renderSummary(api: Sub2ApiRendererApi) {
  render(
    <MantineProvider>
      <Sub2ApiUsageSummary api={api} />
    </MantineProvider>
  )
}

describe('Sub2ApiUsageSummary', () => {
  test('renders usage and active subscription data', async () => {
    renderSummary(createApi())

    expect(await screen.findByText('Pro plan')).toBeTruthy()
    expect(screen.getByText('All time')).toBeTruthy()
    expect(screen.getByText('$1.2345')).toBeTruthy()
    expect(screen.getByText('$1.00 / $5.00')).toBeTruthy()
  })

  test('keeps usage visible when the subscription request fails', async () => {
    renderSummary(createApi({ getSubscriptionSummary: vi.fn().mockRejectedValue(new Error('unavailable')) }))

    expect(await screen.findByText('Unable to load subscription summary.')).toBeTruthy()
    expect(screen.getByText('All time')).toBeTruthy()
    expect(screen.getByText('$1.2345')).toBeTruthy()
  })
})
