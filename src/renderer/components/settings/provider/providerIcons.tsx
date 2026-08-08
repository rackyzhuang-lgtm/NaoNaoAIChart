import { Image } from '@mantine/core'
import { filterVisibleProviders } from '@shared/providers/visibility'
import { ModelProviderEnum } from '@shared/types'
import ProviderIcon from '@/components/icons/ProviderIcon'
import { getProviderIconSrc } from '@/utils/providerIconSrc'

export const FEATURED_PROVIDER_IDS: string[] = filterVisibleProviders([
  { id: ModelProviderEnum.OpenAI },
  { id: ModelProviderEnum.Claude },
  { id: ModelProviderEnum.Gemini },
  { id: ModelProviderEnum.SiliconFlow },
  { id: ModelProviderEnum.DeepSeek },
  { id: ModelProviderEnum.OpenRouter },
  { id: ModelProviderEnum.Ollama },
]).map(({ id }) => id)

export function ProviderIconImage({ providerId, size = 32 }: { providerId: string; size?: number }) {
  const iconSrc = getProviderIconSrc(providerId)
  return iconSrc ? (
    <Image w={size} h={size} src={iconSrc} alt={providerId} />
  ) : (
    <ProviderIcon provider={providerId} size={size} />
  )
}
