export const INFINITE_CANVAS_ALLOWED_TARGETS = {
  'naonaoai.shop': 'https://naonaoai.shop',
  'eazyai.shop': 'https://eazyai.shop',
} as const

export type InfiniteCanvasTargetAlias = keyof typeof INFINITE_CANVAS_ALLOWED_TARGETS

const blockedPathSegments = new Set(['admin', 'administrator'])

export type ProxyTargetValidation = { ok: true; url: URL } | { ok: false; reason: string }

export function isInfiniteCanvasTargetAlias(value: string): value is InfiniteCanvasTargetAlias {
  return Object.hasOwn(INFINITE_CANVAS_ALLOWED_TARGETS, value)
}

export function isAllowedInfiniteCanvasTargetOrigin(origin: string): boolean {
  return Object.values(INFINITE_CANVAS_ALLOWED_TARGETS).includes(
    origin as (typeof INFINITE_CANVAS_ALLOWED_TARGETS)[InfiniteCanvasTargetAlias]
  )
}

export function validateInfiniteCanvasProxyTarget(alias: string, pathname: string, search = ''): ProxyTargetValidation {
  if (!isInfiniteCanvasTargetAlias(alias)) {
    return { ok: false, reason: 'Target origin is not allowed' }
  }
  if (!pathname.startsWith('/') || pathname.includes('\0')) {
    return { ok: false, reason: 'Invalid target path' }
  }
  const segments = pathname.split('/').filter(Boolean)
  if (segments.some((segment) => blockedPathSegments.has(segment.toLowerCase()))) {
    return { ok: false, reason: 'Administrative paths are not allowed' }
  }

  const url = new URL(pathname, `${INFINITE_CANVAS_ALLOWED_TARGETS[alias]}/`)
  url.search = search
  if (!isAllowedInfiniteCanvasTargetOrigin(url.origin)) {
    return { ok: false, reason: 'Target origin is not allowed' }
  }
  return { ok: true, url }
}
