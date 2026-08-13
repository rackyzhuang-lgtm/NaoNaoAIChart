// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, test, vi } from 'vitest'
import ConversationModeButton from './ConversationModeButton'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn(() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })),
})

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const noop = () => Promise.resolve()

function renderButton(overrides: Partial<ComponentProps<typeof ConversationModeButton>> = {}) {
  const props: ComponentProps<typeof ConversationModeButton> = {
    mode: 'default',
    iconSize: 18,
    onModeChange: vi.fn(),
    onCreateGoal: vi.fn(noop),
    onPauseGoal: vi.fn(noop),
    onResumeGoal: vi.fn(noop),
    onCompleteGoal: vi.fn(noop),
    onClearGoal: vi.fn(noop),
    ...overrides,
  }
  render(
    <MantineProvider>
      <ConversationModeButton {...props} />
    </MantineProvider>
  )
  return props
}

describe('ConversationModeButton', () => {
  test('shows default mode and switches to plan exactly once', async () => {
    const props = renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Default Mode' }))
    fireEvent.click(await screen.findByText('Plan'))
    expect(props.onModeChange).toHaveBeenCalledTimes(1)
    expect(props.onModeChange).toHaveBeenCalledWith('plan')
  })

  test('requires a goal before changing to goal mode', async () => {
    const props = renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Default Mode' }))
    fireEvent.click(await screen.findByText('Goal'))
    expect(props.onModeChange).not.toHaveBeenCalled()

    fireEvent.change(await screen.findByRole('textbox'), { target: { value: '  Finish the migration  ' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Start Goal' }))
    await waitFor(() => expect(props.onCreateGoal).toHaveBeenCalledWith('  Finish the migration  '))
  })

  test('does not clear a goal when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    const props = renderButton({
      mode: 'goal',
      goal: {
        id: 'goal-1',
        objective: 'Finish the migration',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Goal Mode' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Clear Goal' }))
    expect(props.onClearGoal).not.toHaveBeenCalled()
  })
})
