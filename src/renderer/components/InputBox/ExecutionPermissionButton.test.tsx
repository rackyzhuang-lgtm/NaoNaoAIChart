/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

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

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
  uiState: {
    newSessionState: {} as {
      agentApprovalPolicy?: 'ask' | 'risk' | 'full'
      agentFullAccess?: boolean
    },
    setNewSessionState: vi.fn(),
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/stores/chatStore', () => ({
  updateSession: mocks.updateSession,
  useSessionSettings: () => ({ sessionSettings: {} }),
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (state: typeof mocks.uiState) => unknown) => selector(mocks.uiState),
}))

import ExecutionPermissionButton from './ExecutionPermissionButton'

function renderButton() {
  return render(
    <MantineProvider>
      <ExecutionPermissionButton sessionId="new" />
    </MantineProvider>
  )
}

async function findPolicyButton(label: RegExp): Promise<HTMLButtonElement> {
  const button = (await screen.findAllByRole('button', { name: label })).find(
    (element): element is HTMLButtonElement =>
      element instanceof HTMLButtonElement && element.hasAttribute('aria-pressed')
  )
  if (!button) throw new Error(`Approval policy button not found: ${label}`)
  return button
}

describe('ExecutionPermissionButton', () => {
  beforeEach(() => {
    mocks.uiState.newSessionState = {}
    mocks.uiState.setNewSessionState.mockClear()
  })

  test('exposes execution permission as a top-level composer control', () => {
    renderButton()
    expect(screen.getByRole('button', { name: 'Execution Permission' })).toBeTruthy()
  })

  test.each([
    ['risk', 'Approve for me'],
    ['full', 'Full Access'],
  ] as const)('persists the %s policy for a new session', async (policy, label) => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Execution Permission' }))

    expect((await findPolicyButton(/Ask for approval/)).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(await findPolicyButton(new RegExp(label)))

    const updater = mocks.uiState.setNewSessionState.mock.calls.at(-1)?.[0]
    expect(updater).toBeTypeOf('function')
    expect(updater({ agentFullAccess: true })).toEqual({
      agentApprovalPolicy: policy,
      agentFullAccess: undefined,
    })
  })
})
