import { getProviderSettings } from '@shared/models'
import { isSub2ApiGatewayUrl } from '@shared/sub2api/url'
import type { SessionSettings, Settings } from '@shared/types'

/**
 * Detect the fixed NaoNaoAI gateway from either its normalized /v1 URL or the
 * provider's unnormalized origin-only setting.
 */
export function usesFixedSub2ApiGateway(settings: SessionSettings, globalSettings: Settings): boolean {
  try {
    const { formattedApiHost } = getProviderSettings(settings, globalSettings)
    if (isSub2ApiGatewayUrl(formattedApiHost)) {
      return true
    }
    return isSub2ApiGatewayUrl(`${formattedApiHost.replace(/\/+$/, '')}/v1`)
  } catch {
    return false
  }
}
