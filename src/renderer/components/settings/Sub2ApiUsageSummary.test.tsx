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
    register: vi.fn(),
    sendRegistrationCode: vi.fn(),
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
    redeemCode: vi.fn(),
    getRedeemHistory: vi.fn().mockResolvedValue([]),
    getChannelMonitors: vi.fn().mockResolvedValue({ items: [] }),
    getAnnouncements: vi.fn().mockResolvedValue([]),
    markAnnouncementRead: vi.fn(),
    getAvailableGroups: vi.fn().mockResolvedValue([]),
    listApiKeys: vi.fn(),
    createApiKey: vi.fn(),
    updateApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
    copyApiKey: vi.fn(),
    prepareProviderBinding: vi.fn(),
    prepareInfiniteCanvasImport: vi.fn(),
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
  test('renders usage without the removed subscription section', async () => {
    renderSummary(createApi())

    expect(await screen.findByText('All time')).toBeTruthy()
    expect(screen.getByText('All time')).toBeTruthy()
    expect(screen.getByText('$1.2345')).toBeTruthy()
    expect(screen.getByText('Recent usage trend')).toBeTruthy()
    expect(screen.getByText('Usage by model')).toBeTruthy()
    expect(screen.getByText('gpt-5')).toBeTruthy()
    expect(screen.queryByText('Pro plan')).toBeNull()
    expect(screen.queryByText('Active subscriptions')).toBeNull()
    expect(screen.queryByText('Usage details')).toBeNull()
    expect(screen.queryByText('Error requests')).toBeNull()
    expect(screen.queryByText('Platform quotas')).toBeNull()
  })

  test('keeps the rest of the summary visible when trend and model requests fail', async () => {
    renderSummary(
      createApi({
        getUsageDashboardTrend: vi.fn().mockRejectedValue(new Error('unavailable')),
        getUsageDashboardModels: vi.fn().mockRejectedValue(new Error('unavailable')),
      })
    )

    expect(await screen.findByText('Unable to load usage trend.')).toBeTruthy()
    expect(screen.getByText('Unable to load model usage.')).toBeTruthy()
    expect(screen.getByText('All time')).toBeTruthy()
  })
})
