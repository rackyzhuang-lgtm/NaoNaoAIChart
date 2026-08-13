// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { searchSessionsMock, uiState } = vi.hoisted(() => ({
  searchSessionsMock: vi.fn(),
  uiState: {
    openSearchDialog: false,
    searchDialogGlobalOnly: false,
    setOpenSearchDialog: vi.fn(),
  },
}))

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('jotai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('jotai')>()),
  useAtomValue: () => undefined,
}))

vi.mock('@/hooks/useScreenChange', () => ({
  useIsSmallScreen: () => false,
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (state: Record<string, unknown>) => unknown) => selector(uiState),
}))

vi.mock('@/stores/sessionHelpers', () => ({
  searchSessions: searchSessionsMock,
}))

vi.mock('../stores/scrollActions', () => ({
  scrollToMessage: vi.fn(),
}))

vi.mock('../stores/sessionActions', () => ({
  switchCurrentSession: vi.fn(),
}))

vi.mock('@/components/chat/Message', () => ({
  default: () => null,
}))

vi.mock('@/components/Markdown', () => ({
  BlockCodeCollapsedStateProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('@/components/common/Mark', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))

import SearchDialog from './SearchDialog'

describe('SearchDialog', () => {
  beforeEach(() => {
    uiState.openSearchDialog = false
    uiState.searchDialogGlobalOnly = false
    uiState.setOpenSearchDialog.mockReset()
    searchSessionsMock.mockReset()
  })

  test('does not hide the application from assistive technology while closed', () => {
    const appRoot = document.createElement('div')
    document.body.appendChild(appRoot)

    const { unmount } = render(<SearchDialog />, { container: appRoot })

    expect(appRoot.getAttribute('aria-hidden')).toBeNull()

    unmount()
    appRoot.remove()
  })

  test('keeps archived chats excluded from global search by default', () => {
    uiState.openSearchDialog = true
    uiState.searchDialogGlobalOnly = true
    render(<SearchDialog />)

    const input = screen.getByPlaceholderText('Search conversations...')
    expect((screen.getByLabelText('Include archived chats in global search') as HTMLInputElement).checked).toBe(false)

    fireEvent.input(input, { target: { value: 'budget' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(searchSessionsMock).toHaveBeenCalledWith('budget', undefined, expect.any(Function), {
      includeArchived: false,
    })
  })

  test('passes the include-archived option only to global search', () => {
    uiState.openSearchDialog = true
    uiState.searchDialogGlobalOnly = true
    render(<SearchDialog />)

    const input = screen.getByPlaceholderText('Search conversations...')
    fireEvent.click(screen.getByLabelText('Include archived chats in global search'))
    fireEvent.input(input, { target: { value: 'project' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(searchSessionsMock).toHaveBeenCalledWith('project', undefined, expect.any(Function), {
      includeArchived: true,
    })
  })
})
