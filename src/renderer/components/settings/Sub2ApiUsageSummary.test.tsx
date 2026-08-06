// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { fireEvent, render, screen } from '@testing-library/react'
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
    getUsageDashboardTrend: vi.fn().mockResolvedValue({
      trend: [
        {
          date: '2026-08-05',
          requests: 4,
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_tokens: 0,
          cache_read_tokens: 10,
          total_tokens: 160,
          cost: 0.2,
          actual_cost: 0.125,
        },
      ],
      start_date: '2026-07-30',
      end_date: '2026-08-05',
      granularity: 'day',
    }),
    getUsageDashboardModels: vi.fn().mockResolvedValue({
      models: [
        {
          model: 'gpt-5',
          requests: 4,
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_tokens: 0,
          cache_read_tokens: 10,
          total_tokens: 160,
          cost: 0.2,
          actual_cost: 0.125,
        },
      ],
      start_date: '2026-07-30',
      end_date: '2026-08-05',
    }),
    getUsageRecords: vi.fn().mockResolvedValue({
      items: [
        {
          id: 11,
          api_key_id: 7,
          model: 'gpt-5',
          request_type: 'chat_completion',
          billing_mode: 'token',
          stream: true,
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_tokens: 0,
          cache_read_tokens: 10,
          total_cost: 0.2,
          actual_cost: 0.125,
          duration_ms: 420,
          created_at: '2026-08-05T12:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      pages: 1,
    }),
    getUsageErrors: vi.fn().mockResolvedValue({
      items: [
        {
          id: 41,
          created_at: '2026-08-05T13:00:00Z',
          model: 'gpt-5',
          inbound_endpoint: '/v1/chat/completions',
          status_code: 429,
          category: 'rate_limit',
          platform: 'openai',
          message: 'Rate limit exceeded',
          key_name: 'desktop-key',
          key_deleted: false,
          stream: true,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      pages: 1,
    }),
    getUsageErrorDetail: vi.fn().mockResolvedValue({
      id: 41,
      created_at: '2026-08-05T13:00:00Z',
      model: 'gpt-5',
      inbound_endpoint: '/v1/chat/completions',
      status_code: 429,
      category: 'rate_limit',
      platform: 'openai',
      message: 'Rate limit exceeded',
      key_name: 'desktop-key',
      key_deleted: false,
      stream: true,
      error_body: '{"error":"rate limited"}',
      upstream_status_code: 429,
    }),
    redeemCode: vi.fn(),
    getRedeemHistory: vi.fn().mockResolvedValue([]),
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
    getPlatformQuotas: vi.fn().mockResolvedValue({
      platform_quotas: [
        {
          platform: 'openai',
          daily_limit_usd: 10,
          weekly_limit_usd: null,
          monthly_limit_usd: null,
          daily_usage_usd: 2,
          weekly_usage_usd: 3,
          monthly_usage_usd: 4,
          daily_window_resets_at: '2026-08-07T00:00:00Z',
        },
      ],
    }),
    getChannelMonitors: vi.fn().mockResolvedValue({ items: [] }),
    getModelPlaza: vi.fn().mockResolvedValue({ groups: [] }),
    getAnnouncements: vi.fn().mockResolvedValue([]),
    markAnnouncementRead: vi.fn(),
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
    expect(screen.getByText('OpenAI')).toBeTruthy()
    expect(screen.getByText('$2.00 / $10.00')).toBeTruthy()
    expect(screen.getByText('Recent usage trend')).toBeTruthy()
    expect(screen.getByText('Usage by model')).toBeTruthy()
    expect(screen.getAllByText('gpt-5').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Usage details')).toBeTruthy()
    expect(screen.getByText(/chat_completion/)).toBeTruthy()
    expect(screen.getByText('Error requests')).toBeTruthy()
    expect(screen.getByText('Rate limit exceeded')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('View error details'))
    expect(await screen.findByText('{"error":"rate limited"}')).toBeTruthy()
  })

  test('keeps usage visible when the subscription request fails', async () => {
    renderSummary(createApi({ getSubscriptionSummary: vi.fn().mockRejectedValue(new Error('unavailable')) }))

    expect(await screen.findByText('Unable to load subscription summary.')).toBeTruthy()
    expect(screen.getByText('All time')).toBeTruthy()
    expect(screen.getByText('$1.2345')).toBeTruthy()
  })

  test('keeps the rest of the summary visible when trend and model requests fail', async () => {
    renderSummary(
      createApi({
        getUsageDashboardTrend: vi.fn().mockRejectedValue(new Error('unavailable')),
        getUsageDashboardModels: vi.fn().mockRejectedValue(new Error('unavailable')),
        getUsageRecords: vi.fn().mockRejectedValue(new Error('unavailable')),
        getUsageErrors: vi.fn().mockRejectedValue(new Error('disabled')),
        getUsageErrorDetail: vi.fn(),
      })
    )

    expect(await screen.findByText('Unable to load usage trend.')).toBeTruthy()
    expect(screen.getByText('Unable to load model usage.')).toBeTruthy()
    expect(screen.getByText('All time')).toBeTruthy()
    expect(screen.getByText('Unable to load usage details.')).toBeTruthy()
    expect(screen.getByText('Unable to load error requests.')).toBeTruthy()
  })
})
