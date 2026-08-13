import { describe, expect, it } from 'vitest'
import { buildSub2ApiGatewayUrl, buildSub2ApiPanelUrl, isSub2ApiGatewayUrl } from './url'

describe('sub2api URL builders', () => {
  it('derives panel and gateway URLs from the fixed service root', () => {
    expect(buildSub2ApiPanelUrl('auth/login')).toBe('https://naonaoai.shop/api/v1/auth/login')
    expect(buildSub2ApiGatewayUrl('models')).toBe('https://naonaoai.shop/v1/models')
  })

  it.each([
    'https://naonaoai.shop/v1/models',
    'https://naonaoai.shop/v1/responses?stream=true',
    'https://naonaoai.shop/v1',
  ])('recognizes gateway URL %s', (url) => {
    expect(isSub2ApiGatewayUrl(url)).toBe(true)
  })

  it.each([
    'https://naonaoai.shop/api/v1/models',
    'https://www.eazyai.shop/v1/models',
    'https://api.openai.com/v1/models',
  ])('rejects non-gateway URL %s', (url) => {
    expect(isSub2ApiGatewayUrl(url)).toBe(false)
  })

  it.each([
    ['/auth/login', 'relative path'],
    ['../admin', 'configured base path'],
    ['%2e%2e/%2e%2e/admin', 'configured base path'],
    ['https://example.test/', 'configured base path'],
    ['\\\\example.test/path', 'relative path'],
  ])('rejects unsafe routes: %s', (route, message) => {
    expect(() => buildSub2ApiPanelUrl(route)).toThrow(message)
  })
})
