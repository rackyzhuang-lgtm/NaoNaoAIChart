import type { Session, Settings } from '@shared/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createModel: vi.fn(),
  generateText: vi.fn(),
  getProviderSettings: vi.fn(),
  getSession: vi.fn(),
  updateSession: vi.fn(),
}))

vi.mock('@shared/models', () => ({ getProviderSettings: mocks.getProviderSettings }))
vi.mock('@/adapters', () => ({ createModel: mocks.createModel }))
vi.mock('@/i18n/locales', () => ({ languageNameMap: { en: 'English' } }))
vi.mock('@/packages/model-calls', () => ({ generateText: mocks.generateText }))
vi.mock('@/packages/prompts', () => ({ nameConversation: vi.fn(() => []) }))
vi.mock('@/utils/sentry', () => ({ reportError: vi.fn() }))
vi.mock('../chatStore', () => ({
  getSession: mocks.getSession,
  updateSession: mocks.updateSession,
}))
vi.mock('../settingsStore', () => ({
  settingsStore: {
    getState: () => ({
      getSettings: () => ({ language: 'en', providers: {} }) as Settings,
    }),
  },
}))

import { deriveLocalConversationName, scheduleGenerateNameAndThreadName } from './naming'
import { activeNameGenerations, pendingNameGenerations } from './state'

describe('fixed-gateway conversation naming', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    pendingNameGenerations.clear()
    activeNameGenerations.clear()
    mocks.getSession.mockResolvedValue({
      id: 'session-1',
      name: 'Untitled',
      messages: [
        { id: 'system', role: 'system', contentParts: [] },
        { id: 'user', role: 'user', contentParts: [{ type: 'text', text: '  hello   world  ' }] },
      ],
      settings: { provider: 'openai-responses', modelId: 'gpt-5.6-sol' },
    } satisfies Session)
    mocks.getProviderSettings.mockReturnValue({ formattedApiHost: 'https://naonaoai.shop/v1' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the first user message locally without calling a model', async () => {
    scheduleGenerateNameAndThreadName('session-1')
    await vi.runAllTimersAsync()

    expect(mocks.createModel).not.toHaveBeenCalled()
    expect(mocks.generateText).not.toHaveBeenCalled()
    expect(mocks.updateSession).toHaveBeenCalledWith('session-1', {
      name: 'hello world',
      threadName: 'hello world',
    })
  })

  it('keeps local names compact', () => {
    const name = deriveLocalConversationName([
      {
        id: 'user',
        role: 'user',
        contentParts: [{ type: 'text', text: '1234567890'.repeat(6) }],
      },
    ])

    expect(Array.from(name ?? '')).toHaveLength(48)
    expect(name).toMatch(/\.\.\.$/)
  })
})
