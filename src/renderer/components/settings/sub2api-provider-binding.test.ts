import { ModelProviderEnum } from '@shared/types'
import { describe, expect, test } from 'vitest'
import { buildSub2ApiProviderSettings } from './sub2api-provider-binding'

describe('buildSub2ApiProviderSettings', () => {
  test('binds the selected key and gateway models to the OpenAI provider', () => {
    const result = buildSub2ApiProviderSettings(
      {
        providers: {
          claude: { apiKey: 'existing-claude-key' },
          openai: { useProxy: true },
        },
      },
      {
        apiKey: 'synthetic-sub2api-key',
        apiHost: 'https://naonaoai.shop/v1',
        models: [{ id: 'gpt-test' }, { id: 'codex-test' }],
      }
    )

    expect(result.providers?.['openai-responses']).toEqual({
      apiKey: 'synthetic-sub2api-key',
      apiHost: 'https://naonaoai.shop/v1',
      activeAuthMode: 'apikey',
      models: [{ modelId: 'gpt-test' }, { modelId: 'codex-test' }],
      useProxy: false,
    })
    expect(result.providers?.claude?.apiKey).toBe('existing-claude-key')
    expect(result.defaultChatModel).toEqual({ provider: ModelProviderEnum.OpenAIResponses, model: 'gpt-test' })
  })
})
