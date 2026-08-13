import type { Sub2ApiProviderBinding } from '@shared/sub2api/contracts'
import { SUB2API_GATEWAY_BASE_URL } from '@shared/sub2api/url'
import { ModelProviderEnum, type ProviderModelInfo, type Settings } from '@shared/types'
import { getDefaultStore } from 'jotai'
import { currentSessionIdAtom } from '@/stores/atoms'
import { listSessionsMeta, updateSessionWithMessages } from '@/stores/chatStore'
import { mergeProviderSettings } from '@/stores/providerSettings'
import { settingsStore } from '@/stores/settingsStore'

const PREFERRED_SUB2API_MODEL_ID = 'gpt-5.6-sol'

function normalizeApiHost(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, '') ?? ''
}

export function getPreferredSub2ApiModelId(binding: Pick<Sub2ApiProviderBinding, 'models'>): string | undefined {
  return binding.models.find((model) => model.id === PREFERRED_SUB2API_MODEL_ID)?.id ?? binding.models[0]?.id
}

export function hasUsableSub2ApiChatProvider(settings: Pick<Settings, 'providers' | 'defaultChatModel'>): boolean {
  const provider = settings.providers?.[ModelProviderEnum.OpenAIResponses]
  const defaultModel = settings.defaultChatModel
  if (
    !provider?.apiKey?.trim() ||
    normalizeApiHost(provider.apiHost) !== normalizeApiHost(SUB2API_GATEWAY_BASE_URL) ||
    !provider.models?.length ||
    defaultModel?.provider !== ModelProviderEnum.OpenAIResponses ||
    !defaultModel.model
  ) {
    return false
  }
  return provider.models.some((model) => model.modelId === defaultModel.model)
}

export function buildSub2ApiProviderSettings(
  currentSettings: Pick<Settings, 'providers'>,
  binding: Sub2ApiProviderBinding
): Pick<Settings, 'providers' | 'defaultChatModel'> {
  const models: ProviderModelInfo[] = binding.models.map((model) =>
    model.id === 'gpt-5.6-sol'
      ? {
          modelId: model.id,
          nickname: 'GPT-5.6 Sol',
          capabilities: ['vision', 'tool_use', 'reasoning'],
          contextWindow: 1_050_000,
          maxOutput: 128_000,
        }
      : { modelId: model.id }
  )
  const defaultModelId = getPreferredSub2ApiModelId(binding)
  return {
    ...mergeProviderSettings(currentSettings, ModelProviderEnum.OpenAIResponses, {
      apiKey: binding.apiKey,
      apiHost: binding.apiHost,
      activeAuthMode: 'apikey',
      models,
      useProxy: false,
    }),
    defaultChatModel: defaultModelId
      ? {
          provider: ModelProviderEnum.OpenAIResponses,
          model: defaultModelId,
        }
      : undefined,
  }
}

export interface AppliedSub2ApiProvider {
  modelId: string
  sessionId?: string
}

/**
 * Applies an explicitly prepared one-time binding to global settings and the
 * existing chat session. It never creates a second session.
 */
export async function applySub2ApiProviderBinding(
  binding: Sub2ApiProviderBinding,
  preferredSessionId?: string | null
): Promise<AppliedSub2ApiProvider> {
  const modelId = getPreferredSub2ApiModelId(binding)
  if (!modelId) {
    throw new Error('No chat models are available for this API key.')
  }

  let sessionId: string | null = preferredSessionId ?? getDefaultStore().get(currentSessionIdAtom)
  if (!sessionId || sessionId === 'new') {
    const sessions = await listSessionsMeta()
    sessionId = sessions.find((session) => session.type === 'chat' && session.status !== 'archived')?.id ?? null
  }

  if (sessionId && sessionId !== 'new') {
    await updateSessionWithMessages(sessionId, (session) => {
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }
      return {
        ...session,
        settings: {
          ...session.settings,
          provider: ModelProviderEnum.OpenAIResponses,
          modelId,
          stream: true,
          providerOptions:
            modelId === PREFERRED_SUB2API_MODEL_ID
              ? {
                  ...session.settings?.providerOptions,
                  openai: {
                    ...session.settings?.providerOptions?.openai,
                    reasoningEffort: 'high',
                  },
                }
              : session.settings?.providerOptions,
        },
      }
    })
  }

  settingsStore.setState((currentSettings) => buildSub2ApiProviderSettings(currentSettings, binding))

  return { modelId, ...(sessionId && sessionId !== 'new' ? { sessionId } : {}) }
}
