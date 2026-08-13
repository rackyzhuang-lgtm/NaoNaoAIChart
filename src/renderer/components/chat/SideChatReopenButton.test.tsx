// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SideChatReopenButton from './SideChatReopenButton'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn(() => ({
    matches: false,
    media: '',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('SideChatReopenButton', () => {
  it('reopens the linked Side Chat without dispatching any request itself', () => {
    const onOpen = vi.fn()
    render(
      <MantineProvider>
        <SideChatReopenButton sideChats={[{ sessionId: 'side-1', label: 'Side Chat 1' }]} onOpen={onOpen} />
      </MantineProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open Side Chat' }))

    expect(onOpen).toHaveBeenCalledWith('side-1')
  })

  it('keeps every linked Side Chat reachable', async () => {
    const onOpen = vi.fn()
    render(
      <MantineProvider>
        <SideChatReopenButton
          sideChats={[
            { sessionId: 'side-1', label: 'Side Chat 1' },
            { sessionId: 'side-2', label: 'Side Chat 2' },
          ]}
          onOpen={onOpen}
        />
      </MantineProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open Side Chat' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Side Chat 1' }))
    expect(onOpen).toHaveBeenCalledWith('side-1')
  })
})
