import type { Session, SessionSettings } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createModel: vi.fn(),
  generate: vi.fn(),
  getSession: vi.fn(),
  getSessionSettings: vi.fn(),
  insertMessage: vi.fn(),
  runCompaction: vi.fn(),
}))

vi.mock('@/adapters', () => ({
  createModel: mocks.createModel,
}))

vi.mock('@/lib/utils', () => ({
  getLogger: () => ({ debug: vi.fn() }),
}))

vi.mock('@/packages/context-management', () => ({
  runCompactionWithUIState: mocks.runCompaction,
}))

vi.mock('@/packages/model-setting-utils', () => ({
  getModelDisplayName: vi.fn().mockResolvedValue('Test model'),
}))

vi.mock('@/packages/token', () => ({
  estimateTokensFromMessages: () => 0,
}))

vi.mock('@/platform', () => ({
  default: { type: 'web' },
}))

vi.mock('@/utils/sentry', () => ({
  reportError: vi.fn(),
}))

vi.mock('../chatStore', () => ({
  getSession: mocks.getSession,
  getSessionSettings: mocks.getSessionSettings,
  insertMessage: mocks.insertMessage,
  removeMessage: vi.fn(),
  updateMessage: vi.fn(),
  updateMessageCache: vi.fn(),
}))

vi.mock('../sessionAttachmentRagIndexing', () => ({
  ensureMessageFileSessionAttachment: vi.fn(),
}))

vi.mock('../settingActions', () => ({
  isPro: () => false,
  getRemoteConfig: async () => ({}),
}))

vi.mock('../settingsStore', () => ({
  settingsStore: {
    getState: () => ({ getSettings: () => ({}) }),
  },
}))

vi.mock('./generation.js', () => ({
  _generateWithoutSessionLock: mocks.generate,
}))

vi.mock('./utils', () => ({
  getSessionWebBrowsing: () => false,
}))

import { resetSessionGenerationLocksForTests } from './generation-lock'
import { submitNewUserMessage } from './messages'

describe('submitNewUserMessage insertion lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSessionGenerationLocksForTests()
    mocks.getSession.mockResolvedValue({
      id: 'session-1',
      name: 'New chat',
      type: 'chat',
      messages: [],
    } satisfies Session)
    mocks.getSessionSettings.mockResolvedValue({
      provider: 'openai',
      modelId: 'test-model',
    } satisfies SessionSettings)
    mocks.runCompaction.mockResolvedValue({ success: true })
    mocks.createModel.mockResolvedValue({ isSupportToolUse: () => true })
  })

  it('notifies navigation callers only after the user and generating placeholder are persisted', async () => {
    const events: string[] = []
    mocks.insertMessage.mockImplementation((_sessionId: string, message: { role: string }) => {
      events.push(message.role)
      return Promise.resolve()
    })

    await submitNewUserMessage('session-1', {
      newUserMsg: { id: 'message-1', role: 'user', contentParts: [] },
      needGenerating: true,
      onUserMessageReady: () => events.push('ready'),
      onUserMessageInserted: () => events.push('navigate'),
    })

    expect(events).toEqual(['ready', 'user', 'assistant', 'navigate'])
    expect(mocks.insertMessage).toHaveBeenCalledTimes(2)
    expect(mocks.generate).toHaveBeenCalledOnce()
    expect(mocks.generate).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ role: 'assistant', generating: true }),
      { operationType: 'send_message' }
    )
  })
})
