import type { Sub2ApiInfiniteCanvasImport } from '@shared/sub2api/contracts'
import { ModelProviderEnum, ModelProviderType, type Settings } from '@shared/types'

export type InfiniteCanvasAgentConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

/** Resolve the built-in Canvas Agent from an imported key or the app's active chat model. */
export function resolveInfiniteCanvasAgentConfig(
  settings: Pick<Settings, 'providers' | 'customProviders' | 'defaultChatModel'>,
  pendingImport: Sub2ApiInfiniteCanvasImport | null
): InfiniteCanvasAgentConfig | null {
  if (pendingImport?.capability === 'text') {
    const model = pendingImport.models[0]?.id
    if (model) {
      return { baseUrl: pendingImport.baseUrl, apiKey: pendingImport.apiKey, model }
    }
  }

  const selection = settings.defaultChatModel
  if (selection) return resolveProviderConfig(settings, selection.provider, selection.model)

  // Most existing installations choose a model per conversation and leave the global default unset.
  for (const [provider, providerSettings] of Object.entries(settings.providers || {})) {
    const model = providerSettings.models?.find(
      (candidate) => candidate.modelId !== 'codex-auto-review' && (!candidate.type || candidate.type === 'chat')
    )?.modelId
    if (!model) continue
    const config = resolveProviderConfig(settings, provider, model)
    if (config) return config
  }
  return null
}

function resolveProviderConfig(
  settings: Pick<Settings, 'providers' | 'customProviders'>,
  provider: string,
  model: string
): InfiniteCanvasAgentConfig | null {
  const providerInfo = settings.customProviders?.find((item) => item.id === provider)
  const compatible =
    provider === ModelProviderEnum.OpenAI ||
    provider === ModelProviderEnum.OpenAIResponses ||
    providerInfo?.type === ModelProviderType.OpenAI ||
    providerInfo?.type === ModelProviderType.OpenAIResponses
  if (!compatible) return null

  const providerSettings = settings.providers?.[provider]
  const baseUrl = providerSettings?.apiHost?.trim()
  const apiKey = providerSettings?.apiKey?.trim()
  if (!baseUrl || !apiKey || !model.trim()) return null
  return { baseUrl, apiKey, model: model.trim() }
}
