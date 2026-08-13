// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { setSettingsMock, settingsState } = vi.hoisted(() => ({
  setSettingsMock: vi.fn(),
  settingsState: { followUpBehavior: undefined as 'queue' | 'steer' | undefined },
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn(() => ({
    matches: false,
    media: '',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
})

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ ...settingsState, setSettings: setSettingsMock }),
}))

import { FollowUpBehaviorSetting } from './chat'

describe('FollowUpBehaviorSetting', () => {
  beforeEach(() => {
    settingsState.followUpBehavior = undefined
    setSettingsMock.mockReset()
  })

  it('defaults to queue and persists steer when selected', () => {
    render(
      <MantineProvider>
        <FollowUpBehaviorSetting />
      </MantineProvider>
    )

    expect((screen.getByRole('radio', { name: 'Queue follow-up' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Adjust direction' }))
    expect(setSettingsMock).toHaveBeenCalledTimes(1)
    expect(setSettingsMock).toHaveBeenCalledWith({ followUpBehavior: 'steer' })
  })
})
