/// <reference types="vite/client" />

import { PROVIDER_ICON_ALIASES } from '@shared/constants/provider-icons'

// @ts-ignore - import.meta.glob is a Vite feature
const iconsModules = import.meta.glob<{ default: string }>('../static/icons/providers/*.png', { eager: true })

const providerIconMap = new Map<string, string>(
  Object.entries(iconsModules).map(([path, module]) => {
    const filename = path.split('/').pop() || ''
    return [filename.replace('.png', ''), module.default]
  })
)

export function getProviderIconSrc(providerId: string): string | undefined {
  // Keep the legacy provider ID for migrations, but never surface its
  // upstream-branded image in the NaoNaoAI interface.
  if (providerId === 'chatbox-ai') return undefined
  return providerIconMap.get(providerId) || providerIconMap.get(PROVIDER_ICON_ALIASES[providerId] || '')
}
