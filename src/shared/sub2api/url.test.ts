import { describe, expect, it } from 'vitest'
import { buildSub2ApiGatewayUrl, buildSub2ApiPanelUrl } from './url'

describe('sub2api URL builders', () => {
  it('derives panel and gateway URLs from the fixed service root', () => {
    expect(buildSub2ApiPanelUrl('auth/login')).toBe('https://naonaoai.shop/api/v1/auth/login')
    expect(buildSub2ApiGatewayUrl('models')).toBe('https://naonaoai.shop/v1/models')
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
