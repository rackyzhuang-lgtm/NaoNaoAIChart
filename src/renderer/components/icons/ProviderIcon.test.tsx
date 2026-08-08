// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import ProviderIcon from './ProviderIcon'

describe('ProviderIcon', () => {
  test('uses the neutral robot icon for the legacy Chatbox provider', () => {
    const { container } = render(<ProviderIcon provider="chatbox-ai" />)
    const svg = container.querySelector('svg')

    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('viewBox')).toBe('0 0 16 16')
    expect(container.innerHTML).not.toContain('M4.4185')
  })
})
