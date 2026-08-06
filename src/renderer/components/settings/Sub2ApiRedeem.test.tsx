// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import Sub2ApiRedeem from './Sub2ApiRedeem'

const mocks = vi.hoisted(() => ({
  t: (key: string) => key,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.t }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

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

const user = {
  id: 7,
  username: 'desktop-user',
  email: 'user@example.com',
  role: 'user' as const,
  balance: 12.5,
  concurrency: 3,
  status: 'active' as const,
}

function createApi(overrides: Partial<Sub2ApiRendererApi> = {}): Sub2ApiRendererApi {
  return {
    getRedeemHistory: vi.fn().mockResolvedValue([
      {
        id: 1,
        code_hint: 'ABCD...WXYZ',
        type: 'balance',
        value: 5,
        status: 'used',
        used_at: '2026-08-06T00:00:00Z',
        created_at: '2026-08-05T00:00:00Z',
      },
    ]),
    redeemCode: vi.fn().mockResolvedValue({
      message: 'Redeemed successfully',
      type: 'balance',
      value: 5,
      new_balance: 17.5,
    }),
    getCurrentUser: vi.fn().mockResolvedValue({ ...user, balance: 17.5 }),
    ...overrides,
  } as Sub2ApiRendererApi
}

function renderRedeem(api: Sub2ApiRendererApi) {
  render(
    <MantineProvider>
      <Sub2ApiRedeem api={api} user={user} onUserChange={vi.fn()} />
    </MantineProvider>
  )
}

describe('Sub2ApiRedeem', () => {
  test('submits a code and only renders a redacted history hint', async () => {
    const api = createApi()
    renderRedeem(api)

    expect(await screen.findByText('ABCD...WXYZ')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Redemption code'), { target: { value: 'secret-code' } })
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }))

    expect(await screen.findByText('Redeemed successfully')).toBeTruthy()
    expect(api.redeemCode).toHaveBeenCalledWith({ code: 'secret-code' })
    expect(screen.queryByText('secret-code')).toBeNull()
    await waitFor(() => expect(api.getRedeemHistory).toHaveBeenCalledTimes(2))
  })

  test('shows a safe error and empty history state', async () => {
    const api = createApi({
      getRedeemHistory: vi.fn().mockResolvedValue([]),
      redeemCode: vi.fn().mockRejectedValue(new Error('internal server details')),
    })
    renderRedeem(api)

    expect(await screen.findByText('No redemption history')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Redemption code'), { target: { value: 'invalid-code' } })
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }))

    expect(await screen.findByText('Unable to redeem code. Check the code and try again.')).toBeTruthy()
    expect(screen.queryByText('internal server details')).toBeNull()
  })
})
