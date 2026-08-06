import type { Sub2ApiProviderBinding } from '@shared/sub2api/contracts'
import { ModelProviderEnum, type Settings } from '@shared/types'
import { mergeProviderSettings } from '@/stores/providerSettings'

export function buildSub2ApiProviderSettings(
  currentSettings: Pick<Settings, 'providers'>,
  binding: Sub2ApiProviderBinding
): Pick<Settings, 'providers'> {
  return mergeProviderSettings(currentSettings, ModelProviderEnum.OpenAI, {
    apiKey: binding.apiKey,
    apiHost: binding.apiHost,
    activeAuthMode: 'apikey',
    models: binding.models.map((model) => ({ modelId: model.id })),
  })
}
