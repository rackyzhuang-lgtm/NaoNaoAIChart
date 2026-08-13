import type { Sub2ApiInfiniteCanvasImport } from '@shared/sub2api/contracts'
import { ModelProviderEnum } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { resolveInfiniteCanvasAgentConfig } from './infinite-canvas-agent-config'

const importedTextConfig: Sub2ApiInfiniteCanvasImport = {
  keyId: 1,
  keyName: 'canvas',
  baseUrl: 'https://naonaoai.shop',
  apiKey: 'sk-imported',
  models: [
    { id: 'gpt-image-2', capability: 'image' },
    { id: 'sub2api-text', capability: 'text' },
  ],
}

describe('resolveInfiniteCanvasAgentConfig', () => {
  it('prefers an imported text model', () => {
    expect(resolveInfiniteCanvasAgentConfig({ defaultChatModel: undefined }, importedTextConfig)).toEqual({
      baseUrl: 'https://naonaoai.shop',
      apiKey: 'sk-imported',
      model: 'sub2api-text',
    })
  })

  it('uses the configured OpenAI-compatible chat provider', () => {
    expect(
      resolveInfiniteCanvasAgentConfig(
        {
          defaultChatModel: { provider: ModelProviderEnum.OpenAI, model: 'sub2api-text' },
          providers: { [ModelProviderEnum.OpenAI]: { apiHost: 'https://naonaoai.shop/v1', apiKey: 'sk-settings' } },
        },
        null
      )
    ).toEqual({ baseUrl: 'https://naonaoai.shop/v1', apiKey: 'sk-settings', model: 'sub2api-text' })
  })

  it('falls back to a configured text model when no global default is selected', () => {
    expect(
      resolveInfiniteCanvasAgentConfig(
        {
          providers: {
            [ModelProviderEnum.OpenAI]: {
              apiHost: 'https://naonaoai.shop',
              apiKey: 'sk-settings',
              models: [
                { modelId: 'codex-auto-review' },
                { modelId: 'naonao-text' },
                { modelId: 'image-model', type: 'image' },
              ],
            },
          },
        },
        null
      )
    ).toEqual({ baseUrl: 'https://naonaoai.shop', apiKey: 'sk-settings', model: 'naonao-text' })
  })

  it('does not send incompatible or incomplete provider settings to the Agent', () => {
    expect(
      resolveInfiniteCanvasAgentConfig(
        {
          defaultChatModel: { provider: 'claude', model: 'claude-3' },
          providers: { claude: { apiHost: 'https://naonaoai.shop', apiKey: 'sk-secret' } },
        },
        null
      )
    ).toBeNull()
    expect(
      resolveInfiniteCanvasAgentConfig(
        { defaultChatModel: { provider: ModelProviderEnum.OpenAI, model: 'gpt-4o' }, providers: {} },
        null
      )
    ).toBeNull()
  })
})
