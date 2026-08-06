import { describe, expect, test } from 'vitest'
import { isAllowedExternalUrl } from './external-links'

describe('isAllowedExternalUrl', () => {
  test.each(['https://naonaoai.shop', 'http://127.0.0.1:3000/callback'])('allows HTTP(S): %s', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(true)
  })

  test.each(['javascript:alert(1)', 'file:///C:/Windows/System32', 'data:text/html,test', 'not a url'])(
    'rejects unsafe external URL: %s',
    (url) => {
      expect(isAllowedExternalUrl(url)).toBe(false)
    }
  )
})
