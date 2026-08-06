// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import Sub2ApiAnnouncements from './Sub2ApiAnnouncements'

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

function renderAnnouncements(overrides: Partial<Sub2ApiRendererApi> = {}) {
  const api = {
    getAnnouncements: vi.fn().mockResolvedValue([
      {
        id: 9,
        title: 'Maintenance',
        content: 'Service window details',
        notify_mode: 'popup',
        read_at: null,
        created_at: '2026-08-06T00:00:00Z',
        updated_at: '2026-08-06T01:00:00Z',
      },
    ]),
    markAnnouncementRead: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Sub2ApiRendererApi
  render(
    <MantineProvider>
      <Sub2ApiAnnouncements api={api} />
    </MantineProvider>
  )
  return api
}

describe('Sub2ApiAnnouncements', () => {
  test('renders an unread announcement and marks it read', async () => {
    const api = renderAnnouncements()
    expect(await screen.findByText('Maintenance')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }))
    await waitFor(() => expect(api.markAnnouncementRead).toHaveBeenCalledWith(9))
    expect(screen.queryByRole('button', { name: 'Mark as read' })).toBeNull()
  })

  test('keeps a local recovery action when marking read fails', async () => {
    renderAnnouncements({ markAnnouncementRead: vi.fn().mockRejectedValue(new Error('offline')) })
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as read' }))
    expect(await screen.findByText('Unable to mark this announcement as read.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeTruthy()
  })
})
