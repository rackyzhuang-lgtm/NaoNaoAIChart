import { ModelProviderEnum } from '@shared/types'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sessionId: 'current-chat',
  setState: vi.fn(),
  updateSessionWithMessages: vi.fn().mockResolvedValue(undefined),
  listSessionsMeta: vi.fn().mockResolvedValue([]),
}))

vi.mock('jotai', () => ({ getDefaultStore: () => ({ get: () => mocks.sessionId }) }))
vi.mock('@/stores/atoms', () => ({ currentSessionIdAtom: Symbol('current-session') }))
vi.mock('@/stores/chatStore', () => ({
  updateSessionWithMessages: mocks.updateSessionWithMessages,
  listSessionsMeta: mocks.listSessionsMeta,
}))
vi.mock('@/stores/settingsStore', () => ({ settingsStore: { setState: mocks.setState } }))

import {
  applySub2ApiProviderBinding,
  buildSub2ApiProviderSettings,
  hasUsableSub2ApiChatProvider,
} from './sub2api-provider-binding'

describe('buildSub2ApiProviderSettings', () => {
  beforeEach(() => {
    mocks.setState.mockClear()
    mocks.updateSessionWithMessages.mockClear()
    mocks.listSessionsMeta.mockClear()
  })

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

  test('prefers GPT-5.6 Sol when the gateway advertises its exact model ID', () => {
    const result = buildSub2ApiProviderSettings(
      { providers: {} },
      {
        apiKey: 'synthetic-sub2api-key',
        apiHost: 'https://naonaoai.shop/v1',
        models: [{ id: 'fallback-model' }, { id: 'gpt-5.6-sol' }],
      }
    )

    expect(result.defaultChatModel).toEqual({
      provider: ModelProviderEnum.OpenAIResponses,
      model: 'gpt-5.6-sol',
    })
    expect(result.providers?.['openai-responses']?.models?.[1]).toMatchObject({
      modelId: 'gpt-5.6-sol',
      nickname: 'GPT-5.6 Sol',
    })
  })

  test('recognizes only a complete NaoNaoAI provider and default model binding', () => {
    const base = {
      providers: {
        [ModelProviderEnum.OpenAIResponses]: {
          apiKey: 'secret',
          apiHost: 'https://naonaoai.shop/v1',
          models: [{ modelId: 'gpt-5.6-sol' }],
        },
      },
      defaultChatModel: { provider: ModelProviderEnum.OpenAIResponses, model: 'gpt-5.6-sol' },
    }
    expect(hasUsableSub2ApiChatProvider(base)).toBe(true)
    expect(
      hasUsableSub2ApiChatProvider({
        ...base,
        defaultChatModel: { provider: ModelProviderEnum.OpenAIResponses, model: 'stale-model' },
      })
    ).toBe(false)
    expect(
      hasUsableSub2ApiChatProvider({
        ...base,
        providers: {
          ...base.providers,
          [ModelProviderEnum.OpenAIResponses]: {
            ...base.providers[ModelProviderEnum.OpenAIResponses],
            apiHost: 'https://example.invalid/v1',
          },
        },
      })
    ).toBe(false)
  })

  test('applies the binding to the existing chat session without creating a session', async () => {
    const result = await applySub2ApiProviderBinding({
      apiKey: 'synthetic-sub2api-key',
      apiHost: 'https://naonaoai.shop/v1',
      models: [{ id: 'gpt-5.6-sol' }],
    })

    expect(result).toEqual({ modelId: 'gpt-5.6-sol', sessionId: 'current-chat' })
    expect(mocks.setState).toHaveBeenCalledOnce()
    expect(mocks.updateSessionWithMessages).toHaveBeenCalledWith('current-chat', expect.any(Function))
    expect(mocks.listSessionsMeta).not.toHaveBeenCalled()
  })

  test('rejects an API key when model discovery returns no chat model', async () => {
    await expect(
      applySub2ApiProviderBinding({ apiKey: 'key', apiHost: 'https://naonaoai.shop/v1', models: [] })
    ).rejects.toThrow('No chat models')
    expect(mocks.setState).not.toHaveBeenCalled()
    expect(mocks.updateSessionWithMessages).not.toHaveBeenCalled()
  })
})
