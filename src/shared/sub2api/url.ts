import { SUB2API_BASE_URL } from '../constants'

export const SUB2API_PANEL_BASE_URL = new URL('/api/v1/', SUB2API_BASE_URL).toString()
export const SUB2API_GATEWAY_BASE_URL = new URL('/v1/', SUB2API_BASE_URL).toString()

/** Returns whether a URL targets the fixed sub2api model gateway. */
export function isSub2ApiGatewayUrl(input: string | URL): boolean {
  try {
    const target = typeof input === 'string' ? new URL(input) : input
    const gateway = new URL(SUB2API_GATEWAY_BASE_URL)
    return (
      target.origin === gateway.origin &&
      (target.pathname === gateway.pathname.slice(0, -1) || target.pathname.startsWith(gateway.pathname))
    )
  } catch {
    return false
  }
}

function assertRelativeRoute(route: string): void {
  if (!route || route.startsWith('/') || route.includes('\\')) {
    throw new Error('sub2api route must be a non-empty relative path')
  }
}

function buildSub2ApiUrl(route: string, baseUrl: string): string {
  assertRelativeRoute(route)

  const base = new URL(baseUrl)
  const url = new URL(route, base)
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    throw new Error('sub2api route must stay within its configured base path')
  }
  return url.toString()
}

export function buildSub2ApiPanelUrl(route: string): string {
  return buildSub2ApiUrl(route, SUB2API_PANEL_BASE_URL)
}

export function buildSub2ApiGatewayUrl(route: string): string {
  return buildSub2ApiUrl(route, SUB2API_GATEWAY_BASE_URL)
}
