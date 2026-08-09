// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import Sub2ApiChannelMonitors from './Sub2ApiChannelMonitors'

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
    redeemCode: vi.fn(),
    getRedeemHistory: vi.fn(),
    getSubscriptionSummary: vi.fn(),
    getChannelMonitors: vi.fn().mockResolvedValue({
      items: [
        {
          id: 7,
          name: 'GPT stable',
          provider: 'openai',
          group_name: '',
          primary_model: 'gpt-5.6-terra',
          primary_status: 'operational',
          primary_latency_ms: 1200,
          availability_7d: 99.2,
        },
      ],
    }),
    getAnnouncements: vi.fn(),
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

describe('Sub2ApiChannelMonitors', () => {
  test('renders status and service-disabled selection notice', async () => {
    const api = createApi()
    render(
      <MantineProvider>
        <Sub2ApiChannelMonitors api={api} availableChannelsEnabled={false} />
      </MantineProvider>
    )

    expect(await screen.findByText('GPT stable')).toBeTruthy()
    expect(screen.getByText('Operational')).toBeTruthy()
    expect(screen.getByText('Channel selection is not enabled by the service.')).toBeTruthy()
    expect(screen.getByText('99.2%')).toBeTruthy()
  })

  test('keeps the failure state local to channels', async () => {
    const api = createApi({ getChannelMonitors: vi.fn().mockRejectedValue(new Error('offline')) })
    render(
      <MantineProvider>
        <Sub2ApiChannelMonitors api={api} />
      </MantineProvider>
    )

    await waitFor(() => expect(screen.getByText('Unable to load channel status.')).toBeTruthy())
  })
})
