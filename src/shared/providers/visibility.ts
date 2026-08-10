import { ModelProviderEnum } from '../types'

/** Providers retained for compatibility but removed from new user-facing choices. */
export const HIDDEN_PROVIDER_IDS = [
  ModelProviderEnum.OpenAI,
  ModelProviderEnum.SiliconFlow,
  ModelProviderEnum.OpenRouter,
  ModelProviderEnum.Ollama,
] as const

const hiddenProviderIds = new Set<string>(HIDDEN_PROVIDER_IDS)

export function isProviderVisible(providerId: string): boolean {
  return !hiddenProviderIds.has(providerId)
}

export function filterVisibleProviders<T extends { id: string }>(providers: T[]): T[] {
  return providers.filter((provider) => isProviderVisible(provider.id))
}
