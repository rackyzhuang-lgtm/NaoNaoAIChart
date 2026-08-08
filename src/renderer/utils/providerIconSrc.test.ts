import { describe, expect, test } from 'vitest'
import { getProviderIconSrc } from './providerIconSrc'

describe('getProviderIconSrc', () => {
  test('does not return the legacy Chatbox logo', () => {
    expect(getProviderIconSrc('chatbox-ai')).toBeUndefined()
  })

  test('keeps bundled icons available for supported providers', () => {
    expect(getProviderIconSrc('openai')).toBeDefined()
  })
})
