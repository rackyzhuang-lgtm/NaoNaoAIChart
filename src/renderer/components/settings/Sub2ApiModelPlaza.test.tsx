// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import Sub2ApiModelPlaza from './Sub2ApiModelPlaza'

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

const api = {
  getModelPlaza: vi.fn().mockResolvedValue({
    description: 'Pick a model',
    groups: [
      {
        id: 2,
        name: 'GPT group',
        platform: 'openai',
        rate_multiplier: 0.8,
        models: [{ name: 'gpt-5.6-terra', pricing: { input_price: 1.25 } }],
      },
      {
        id: 3,
        name: 'Claude group',
        platform: 'anthropic',
        rate_multiplier: 1,
        models: [{ name: 'claude-test', pricing: { per_request_price: 0.02 } }],
      },
    ],
  }),
} as unknown as Sub2ApiRendererApi

describe('Sub2ApiModelPlaza', () => {
  test('does not request a disabled plaza', () => {
    const disabledApi = { getModelPlaza: vi.fn() } as unknown as Sub2ApiRendererApi
    render(
      <MantineProvider>
        <Sub2ApiModelPlaza api={disabledApi} enabled={false} />
      </MantineProvider>
    )

    expect(screen.getByText('The model plaza is not enabled by the service.')).toBeTruthy()
    expect(disabledApi.getModelPlaza).not.toHaveBeenCalled()
  })

  test('renders pricing and filters models by search', async () => {
    render(
      <MantineProvider>
        <Sub2ApiModelPlaza api={api} />
      </MantineProvider>
    )

    expect(await screen.findByText('gpt-5.6-terra')).toBeTruthy()
    expect(screen.getByText('$1.25 / 1M input tokens')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'claude' } })
    await waitFor(() => expect(screen.queryByText('gpt-5.6-terra')).toBeNull())
    expect(screen.getByText('claude-test')).toBeTruthy()
  })
})
