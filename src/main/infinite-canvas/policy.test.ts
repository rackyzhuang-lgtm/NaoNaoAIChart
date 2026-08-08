import { describe, expect, it } from 'vitest'
import {
  isAllowedInfiniteCanvasTargetOrigin,
  isInfiniteCanvasTargetAlias,
  validateInfiniteCanvasProxyTarget,
} from './policy'

describe('infinite canvas target policy', () => {
  it('allows only the two exact HTTPS target origins', () => {
    expect(isAllowedInfiniteCanvasTargetOrigin('https://naonaoai.shop')).toBe(true)
    expect(isAllowedInfiniteCanvasTargetOrigin('https://eazyai.shop')).toBe(true)
    expect(isAllowedInfiniteCanvasTargetOrigin('https://www.naonaoai.shop')).toBe(false)
    expect(isAllowedInfiniteCanvasTargetOrigin('http://naonaoai.shop')).toBe(false)
    expect(isInfiniteCanvasTargetAlias('naonaoai.shop')).toBe(true)
    expect(isInfiniteCanvasTargetAlias('other.example')).toBe(false)
  })

  it('builds allowed targets without permitting an arbitrary URL', () => {
    expect(validateInfiniteCanvasProxyTarget('naonaoai.shop', '/v1/models', '?limit=2')).toMatchObject({
      ok: true,
      url: new URL('https://naonaoai.shop/v1/models?limit=2'),
    })
    expect(validateInfiniteCanvasProxyTarget('www.naonaoai.shop', '/v1/models')).toMatchObject({ ok: false })
    expect(validateInfiniteCanvasProxyTarget('eazyai.shop', '/admin/users')).toMatchObject({ ok: false })
  })
})
