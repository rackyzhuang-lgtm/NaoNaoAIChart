import { getLicenseKey } from '@/stores/settingActions'
import type { MCPServerConfig } from './types'

export interface BuildinMCPServerConfig {
  id: string
  name: string
  description: string
  url: string
}

// Built-in servers from the upstream service are intentionally not shipped.
// Users can still add an MCP server explicitly from the custom server form.
export const BUILTIN_MCP_SERVERS: BuildinMCPServerConfig[] = []

export function getBuiltinServerConfig(id: string, licenseKey?: string): MCPServerConfig | null {
  const config = BUILTIN_MCP_SERVERS.find((s) => s.id === id)
  if (!config) {
    return null
  }
  // The upstream-hosted catalog is intentionally disabled until a first-party
  // endpoint is selected; do not create requests to the legacy service.
  if (new URL(config.url).hostname.endsWith('chatboxai.app')) {
    return null
  }
  const license = licenseKey || getLicenseKey()
  return {
    id,
    name: config.name,
    enabled: true,
    transport: {
      type: 'http',
      url: config.url,
      headers: license ? { 'x-chatbox-license': license } : undefined,
    },
  }
}
