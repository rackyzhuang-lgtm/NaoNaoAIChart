// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  confirmSessionDeletionMock,
  deleteSessionMock,
  niceModalShowMock,
  restoreSessionMock,
  runSessionRetentionScanMock,
  setSettingsMock,
} = vi.hoisted(() => ({
  confirmSessionDeletionMock: vi.fn(),
  deleteSessionMock: vi.fn(),
  niceModalShowMock: vi.fn(),
  restoreSessionMock: vi.fn(),
  runSessionRetentionScanMock: vi.fn(),
  setSettingsMock: vi.fn(),
}))

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
})

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

vi.mock('@ebay/nice-modal-react', () => ({
  default: { show: niceModalShowMock },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, number>) =>
      values ? key.replace('{{deleted}}', String(values.deleted)).replace('{{skipped}}', String(values.skipped)) : key,
  }),
}))

vi.mock('@/components/common/Avatar', () => ({
  AssistantAvatar: () => <span />,
}))

vi.mock('@/components/common/ScalableIcon', () => ({
  ScalableIcon: () => <span />,
}))

vi.mock('@/stores/chatStore', () => ({
  confirmSessionDeletion: confirmSessionDeletionMock,
  deleteSession: deleteSessionMock,
  restoreSession: restoreSessionMock,
  useArchivedSessionList: () => ({
    archivedSessionMetaList: [
      {
        id: 'archived-1',
        name: 'Archived chat',
        type: 'chat',
        createdAt: 1,
        hidden: true,
        archivedAt: 2,
      },
    ],
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
  }),
}))

vi.mock('@/services/session-retention', () => ({
  runSessionRetentionScan: runSessionRetentionScanMock,
}))

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      sessionRetention: {
        enabled: true,
        autoArchiveEnabled: true,
        archiveAfterDays: 30,
        autoDeleteEnabled: true,
        deleteAfterDays: 30,
        deleteBasis: 'archivedAt',
      },
      setSettings: setSettingsMock,
    }),
}))

import { RouteComponent } from './archive'

function renderRoute() {
  return render(
    <MantineProvider>
      <RouteComponent />
    </MantineProvider>
  )
}

describe('archived chats settings', () => {
  beforeEach(() => {
    confirmSessionDeletionMock.mockReset().mockResolvedValue(true)
    deleteSessionMock.mockReset().mockResolvedValue(undefined)
    niceModalShowMock.mockReset().mockResolvedValue(true)
    restoreSessionMock.mockReset().mockResolvedValue(undefined)
    runSessionRetentionScanMock.mockReset().mockResolvedValue({ deletedCount: 2, skippedCount: 1 })
    setSettingsMock.mockReset()
  })

  it('runs a confirmed cleanup and shows local diagnostic counts', async () => {
    renderRoute()

    fireEvent.click(screen.getByRole('button', { name: 'Clean up expired archived chats now' }))

    await waitFor(() =>
      expect(runSessionRetentionScanMock).toHaveBeenCalledWith({ reason: 'manual', cleanupOnly: true })
    )
    expect(screen.getByText('2 chat(s) deleted; 1 chat(s) skipped.')).toBeTruthy()
  })

  it('requires the permanent deletion confirmation before the artifact check', async () => {
    renderRoute()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteSessionMock).toHaveBeenCalledWith('archived-1'))
    expect(niceModalShowMock).toHaveBeenCalledWith(
      'confirm',
      expect.objectContaining({ title: 'Permanently delete this archived chat?', danger: true })
    )
    expect(niceModalShowMock.mock.invocationCallOrder[0]).toBeLessThan(
      confirmSessionDeletionMock.mock.invocationCallOrder[0]
    )
    expect(confirmSessionDeletionMock.mock.invocationCallOrder[0]).toBeLessThan(
      deleteSessionMock.mock.invocationCallOrder[0]
    )
  })
})
