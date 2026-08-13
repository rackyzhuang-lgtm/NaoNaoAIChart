import type { SessionSettings, Settings } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderSettings = vi.hoisted(() => vi.fn())

vi.mock('@shared/models', () => ({ getProviderSettings }))

import { usesFixedSub2ApiGateway } from './request-policy'

describe('usesFixedSub2ApiGateway', () => {
  const sessionSettings = { provider: 'openai-responses', modelId: 'gpt-5.6-sol' } as SessionSettings
  const globalSettings = {} as Settings

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['https://naonaoai.shop', 'https://naonaoai.shop/v1'])('recognizes fixed provider host %s', (apiHost) => {
    getProviderSettings.mockReturnValue({ formattedApiHost: apiHost })
    expect(usesFixedSub2ApiGateway(sessionSettings, globalSettings)).toBe(true)
  })

  it('leaves other providers on their existing auxiliary-call behavior', () => {
    getProviderSettings.mockReturnValue({ formattedApiHost: 'https://api.openai.com/v1' })
    expect(usesFixedSub2ApiGateway(sessionSettings, globalSettings)).toBe(false)
  })
})
