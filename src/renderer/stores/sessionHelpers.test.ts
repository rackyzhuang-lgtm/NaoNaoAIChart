import type { Message } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  blobStore,
  licenseState,
  licenseActivationState,
  authTokensState,
  sessionRagCapabilityState,
  parserState,
  defaultEmbeddingModelState,
  followUpBehaviorState,
  mockParseFileLocally,
  mockGetSessionRagConfig,
  mockUploadAndCreateUserFile,
  mockSetBlob,
  mockGetBlob,
  mockSetItem,
  mockGetItem,
  mockGetMetaStorage,
} = vi.hoisted(() => {
  const blobs = new Map<string, string>()
  const license = { key: 'licensed-key' as string | undefined }
  const licenseActivation = { method: 'manual' as 'login' | 'manual' | undefined }
  const authTokens = { hasTokens: true }
  const sessionRagCapability = { enabled: true }
  const parser = { type: 'local' as 'local' | 'chatbox-ai' | 'none' | 'mineru' }
  const defaultEmbeddingModel = {
    value: undefined as { provider: string; model: string } | undefined,
  }
  const followUpBehavior = { value: undefined as 'queue' | 'steer' | undefined }

  return {
    blobStore: blobs,
    licenseState: license,
    licenseActivationState: licenseActivation,
    authTokensState: authTokens,
    sessionRagCapabilityState: sessionRagCapability,
    parserState: parser,
    defaultEmbeddingModelState: defaultEmbeddingModel,
    followUpBehaviorState: followUpBehavior,
    mockParseFileLocally: vi.fn(),
    mockGetSessionRagConfig: vi.fn(async () => ({
      models: { embedding: 'chatbox-ai:text-embedding-3-small', rerank: 'chatbox-ai:rerank' },
      capabilities: {
        session_attachment_embedding: sessionRagCapability.enabled,
        session_attachment_rerank: false,
      },
    })),
    mockUploadAndCreateUserFile: vi.fn(),
    mockSetBlob: vi.fn(async (key: string, value: string) => {
      blobs.set(key, value)
    }),
    mockGetBlob: vi.fn(async (key: string) => blobs.get(key) ?? null),
    mockSetItem: vi.fn(async () => undefined),
    mockGetItem: vi.fn(async <T>(_key: string, initialValue: T) => initialValue),
    mockGetMetaStorage: vi.fn(),
  }
})

vi.mock('@/platform', () => ({
  default: {
    type: 'desktop',
    parseFileLocally: mockParseFileLocally,
  },
}))

vi.mock('@/storage', () => ({
  default: {
    getBlob: mockGetBlob,
    setBlob: mockSetBlob,
    getItem: mockGetItem,
    setItem: mockSetItem,
  },
}))

vi.mock('@/packages/remote', () => ({
  getSessionRagConfig: mockGetSessionRagConfig,
  uploadAndCreateUserFile: mockUploadAndCreateUserFile,
}))

vi.mock('./settingActions', () => ({
  getLicenseKey: () => licenseState.key,
  isPro: () => Boolean(licenseState.key),
}))

vi.mock('@/stores/authInfoStore', () => ({
  authInfoStore: {
    getState: () => ({
      getTokens: () =>
        authTokensState.hasTokens ? { accessToken: 'access-token', refreshToken: 'refresh-token' } : null,
    }),
  },
}))

vi.mock('./settingsStore', () => ({
  settingsStore: {
    getState: () => ({
      licenseKey: licenseState.key,
      licenseActivationMethod: licenseActivationState.method,
      defaultEmbeddingModel: defaultEmbeddingModelState.value,
      extension: {
        documentParser: { type: parserState.type },
      },
      getSettings: () => ({
        defaultChatModel: undefined,
        maxContextMessageCount: undefined,
        temperature: undefined,
        topP: undefined,
        followUpBehavior: followUpBehaviorState.value,
      }),
    }),
  },
  getPlatformDefaultDocumentParser: () => ({ type: 'local' }),
}))

vi.mock('./lastUsedModelStore', () => ({
  lastUsedModelStore: {
    getState: () => ({
      chat: undefined,
    }),
  },
}))

vi.mock('@/packages/token', () => ({
  estimateTokens: (text: string) => text.length,
  getTokenizerType: () => 'default',
}))

vi.mock('@/lib/utils', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@/lib/format-chat', () => ({
  formatChatAsHtml: vi.fn(),
  formatChatAsMarkdown: vi.fn(),
  formatChatAsTxt: vi.fn(),
}))

vi.mock('@shared/services/native-session-search', () => ({
  searchSessionMessages: (session: { messages?: unknown[] }) => session.messages ?? [],
}))

vi.mock('@/i18n', () => ({
  default: {},
}))

vi.mock('@/stores/chatStore', () => ({
  getMetaStorage: mockGetMetaStorage,
}))

import {
  getCurrentThreadHistoryHash,
  initEmptyChatSession,
  isSessionAttachmentRagAuthError,
  isSessionAttachmentRagIndexingError,
  prepareFileAttachment,
  SESSION_ATTACHMENT_RAG_LARGE_ATTACHMENT_WARNING,
  SESSION_ATTACHMENT_RAG_MAX_PARSED_BYTE_LENGTH,
  SESSION_ATTACHMENT_RAG_REQUIRES_CHATBOX_AI_ERROR,
  searchSessions,
} from './sessionHelpers'

describe('new chat follow-up defaults', () => {
  it('persists the selected global follow-up behavior into the new session snapshot', () => {
    followUpBehaviorState.value = 'steer'
    expect(initEmptyChatSession().settings?.followUpBehavior).toBe('steer')

    followUpBehaviorState.value = undefined
    expect(initEmptyChatSession().settings?.followUpBehavior).toBe('queue')
  })
})

describe('thread follow-up identity', () => {
  it('uses the stable active thread id in the thread history UI', () => {
    const firstMessage = { id: 'message-1', role: 'user', contentParts: [] } as Message
    const history = getCurrentThreadHistoryHash({
      id: 'session-1',
      name: 'Test',
      activeThreadId: 'active-thread-1',
      messages: [firstMessage],
      threads: [],
    })

    expect(history[firstMessage.id]?.id).toBe('active-thread-1')
  })
})

function createFile(name: string, content = 'binary-content'): File {
  const file = new File([content], name, { type: 'application/pdf', lastModified: 1700000000000 })
  Object.defineProperty(file, 'path', {
    value: `/tmp/${name}`,
    configurable: true,
  })
  return file
}

describe('preprocessFile local parser fallback', () => {
  beforeEach(() => {
    blobStore.clear()
    licenseState.key = 'licensed-key'
    licenseActivationState.method = 'manual'
    authTokensState.hasTokens = true
    sessionRagCapabilityState.enabled = true
    parserState.type = 'local'
    defaultEmbeddingModelState.value = undefined
    mockParseFileLocally.mockReset()
    mockGetSessionRagConfig.mockClear()
    mockUploadAndCreateUserFile.mockReset()
    mockSetBlob.mockClear()
    mockGetBlob.mockClear()
    mockSetItem.mockClear()
    mockGetItem.mockClear()
  })

  it('returns a local parser error when parsing throws', async () => {
    const file = createFile('report.pdf')
    mockParseFileLocally.mockRejectedValueOnce(new Error('local failed'))

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockParseFileLocally).toHaveBeenCalledWith(file)
    expect(mockUploadAndCreateUserFile).not.toHaveBeenCalled()
    expect(result.error).toBe('local_parser_failed')
  })

  it('returns a local parser error when local parsing returns empty content', async () => {
    const file = createFile('empty.pdf')
    blobStore.set('local-key', '   \n\t')
    mockParseFileLocally.mockResolvedValueOnce({ isSupported: true, key: 'local-key' })

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockParseFileLocally).toHaveBeenCalledWith(file)
    expect(mockUploadAndCreateUserFile).not.toHaveBeenCalled()
    expect(result.error).toBe('local_parser_failed')
  })

  it('does not use a cloud parser for text files when local parsing fails', async () => {
    const file = createFile('readme.txt', 'text content')
    mockParseFileLocally.mockRejectedValueOnce(new Error('local failed'))

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockUploadAndCreateUserFile).not.toHaveBeenCalled()
    expect(result.error).toBe('local_parser_failed')
  })

  it('keeps local_parser_failed when local parsing throws without a license', async () => {
    const file = createFile('no-license.pdf')
    licenseState.key = undefined
    mockParseFileLocally.mockRejectedValueOnce(new Error('local failed'))

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockUploadAndCreateUserFile).not.toHaveBeenCalled()
    expect(result.content).toBe('')
    expect(result.storageKey).toBe('')
    expect(result.error).toBe('local_parser_failed')
  })

  it('rejects the removed Chatbox AI parser configuration', async () => {
    parserState.type = 'chatbox-ai'
    const file = createFile('local-first.pdf')

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockParseFileLocally).not.toHaveBeenCalled()
    expect(mockUploadAndCreateUserFile).not.toHaveBeenCalled()
    expect(result.error).toBe('document_parser_not_configured')
  })

  it('does not fall back to Chatbox AI when the removed parser is selected', async () => {
    parserState.type = 'chatbox-ai'
    const file = createFile('cloud-fallback.docx')

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockParseFileLocally).not.toHaveBeenCalled()
    expect(mockUploadAndCreateUserFile).not.toHaveBeenCalled()
    expect(result.error).toBe('document_parser_not_configured')
  })

  it('keeps high-token attachments inline when parsed content stays below byte threshold', async () => {
    const file = createFile('token-heavy.pdf')
    const parsedContent = 'a'.repeat(8000)
    blobStore.set('local-key', parsedContent)
    mockParseFileLocally.mockResolvedValueOnce({ isSupported: true, key: 'local-key' })

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockGetSessionRagConfig).not.toHaveBeenCalled()
    expect(result.error).toBeUndefined()
    expect(result.ragMode).toBe('inline')
    expect(result.sessionAttachmentAvailability).toBe('allowed')
    expect(result.tokenCountMap?.default).toBe(parsedContent.length)
  })

  it('uses session retrieval for over-threshold attachments when a default embedding is configured', async () => {
    const file = createFile('licensed-large.pdf')
    const parsedContent = 'a'.repeat(256 * 1024 + 1)
    blobStore.set('local-key', parsedContent)
    mockParseFileLocally.mockResolvedValueOnce({ isSupported: true, key: 'local-key' })
    defaultEmbeddingModelState.value = { provider: 'openai', model: 'text-embedding-3-small' }

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockGetSessionRagConfig).not.toHaveBeenCalled()
    expect(result.error).toBeUndefined()
    expect(result.ragMode).toBe('session-retrieval')
    expect(result.sessionAttachmentAvailability).toBe('allowed')
    expect(result.tokenCountMap?.default).toBeUndefined()
    expect(result.tokenCountMap?.default_preview).toBeDefined()
  })

  it('keeps over-threshold CSV attachments inline instead of session retrieval', async () => {
    const file = createFile('large-data.csv')
    const parsedContent = 'a,b,c\n'.repeat(64 * 1024)
    blobStore.set('local-key', parsedContent)
    mockParseFileLocally.mockResolvedValueOnce({ isSupported: true, key: 'local-key' })

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockGetSessionRagConfig).not.toHaveBeenCalled()
    expect(result.error).toBeUndefined()
    expect(result.ragMode).toBe('inline')
    expect(result.sessionAttachmentAvailability).toBe('allowed')
    expect(result.tokenCountMap?.default).toBe(parsedContent.length)
  })

  it('keeps over-threshold Excel attachments inline instead of session retrieval', async () => {
    const file = createFile('large-budget.xlsx')
    const parsedContent = 'cell text\n'.repeat(64 * 1024)
    blobStore.set('local-key', parsedContent)
    mockParseFileLocally.mockResolvedValueOnce({ isSupported: true, key: 'local-key' })

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockGetSessionRagConfig).not.toHaveBeenCalled()
    expect(result.error).toBeUndefined()
    expect(result.ragMode).toBe('inline')
    expect(result.sessionAttachmentAvailability).toBe('allowed')
    expect(result.tokenCountMap?.default).toBe(parsedContent.length)
  })

  it('keeps over-threshold code attachments inline instead of session retrieval', async () => {
    const file = createFile('large-app.tsx')
    const parsedContent = 'export const value = 1\n'.repeat(16 * 1024)
    blobStore.set('local-key', parsedContent)
    mockParseFileLocally.mockResolvedValueOnce({ isSupported: true, key: 'local-key' })

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockGetSessionRagConfig).not.toHaveBeenCalled()
    expect(result.error).toBeUndefined()
    expect(result.ragMode).toBe('inline')
    expect(result.sessionAttachmentAvailability).toBe('allowed')
    expect(result.tokenCountMap?.default).toBe(parsedContent.length)
  })

  it('keeps over-threshold attachments inline without a Chatbox license', async () => {
    const file = createFile('byok-large.pdf')
    const parsedContent = 'a'.repeat(256 * 1024 + 1)
    licenseState.key = undefined
    sessionRagCapabilityState.enabled = false
    blobStore.set('local-key', parsedContent)
    mockParseFileLocally.mockResolvedValueOnce({ isSupported: true, key: 'local-key' })

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockGetSessionRagConfig).not.toHaveBeenCalled()
    expect(result.error).toBeUndefined()
    expect(result.ragMode).toBe('inline')
    expect(result.sessionAttachmentAvailability).toBe('allowed')
    expect(result.sessionAttachmentBlockedReason).toBeUndefined()
    expect(result.tokenCountMap?.default).toBe(parsedContent.length)
  })

  it('uses session retrieval for over-threshold attachments without a Chatbox license when a default embedding model is configured', async () => {
    const file = createFile('byok-large.pdf')
    const parsedContent = 'a'.repeat(256 * 1024 + 1)
    licenseState.key = undefined
    sessionRagCapabilityState.enabled = false
    defaultEmbeddingModelState.value = {
      provider: 'openai',
      model: 'text-embedding-3-small',
    }
    blobStore.set('local-key', parsedContent)
    mockParseFileLocally.mockResolvedValueOnce({ isSupported: true, key: 'local-key' })

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockGetSessionRagConfig).not.toHaveBeenCalled()
    expect(result.error).toBeUndefined()
    expect(result.ragMode).toBe('session-retrieval')
    expect(result.sessionAttachmentAvailability).toBe('allowed')
    expect(result.tokenCountMap?.default).toBeUndefined()
    expect(result.tokenCountMap?.default_preview).toBeDefined()
  })

  it('keeps very large BYOK attachments inline with a warning', async () => {
    const file = createFile('byok-very-large.pdf')
    const parsedContent = 'a'.repeat(SESSION_ATTACHMENT_RAG_MAX_PARSED_BYTE_LENGTH + 1)
    licenseState.key = undefined
    sessionRagCapabilityState.enabled = false
    blobStore.set('local-key', parsedContent)
    mockParseFileLocally.mockResolvedValueOnce({ isSupported: true, key: 'local-key' })

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockGetSessionRagConfig).not.toHaveBeenCalled()
    expect(result.error).toBeUndefined()
    expect(result.ragMode).toBe('inline')
    expect(result.sessionAttachmentAvailability).toBe('allowed')
    expect(result.sessionAttachmentWarningReason).toBe(SESSION_ATTACHMENT_RAG_LARGE_ATTACHMENT_WARNING)
    expect(result.tokenCountMap?.default).toBe(parsedContent.length)
  })

  it('keeps over-threshold attachments inline for stale login licenses without auth tokens', async () => {
    const file = createFile('stale-login-large.pdf')
    const parsedContent = 'a'.repeat(256 * 1024 + 1)
    licenseState.key = 'stale-login-license'
    licenseActivationState.method = 'login'
    authTokensState.hasTokens = false
    blobStore.set('local-key', parsedContent)
    mockParseFileLocally.mockResolvedValueOnce({ isSupported: true, key: 'local-key' })

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockGetSessionRagConfig).not.toHaveBeenCalled()
    expect(result.error).toBeUndefined()
    expect(result.ragMode).toBe('inline')
    expect(result.sessionAttachmentAvailability).toBe('allowed')
    expect(result.tokenCountMap?.default).toBe(parsedContent.length)
  })

  it('recognizes raw session RAG auth failures from existing failed attachments', () => {
    expect(isSessionAttachmentRagAuthError(SESSION_ATTACHMENT_RAG_REQUIRES_CHATBOX_AI_ERROR)).toBe(true)
    expect(isSessionAttachmentRagAuthError('provider chatbox-ai not set')).toBe(true)
    expect(isSessionAttachmentRagAuthError('Missing token for rerank provider: chatbox-ai')).toBe(true)
    expect(isSessionAttachmentRagAuthError('local_parser_failed')).toBe(false)
  })

  it('recognizes raw session RAG indexing failures from existing failed attachments', () => {
    expect(
      isSessionAttachmentRagIndexingError(
        'ConnectionFailed("Unable to open connection to local database /Users/me/databases/chatbox_session_rag_vectors.db: 14")'
      )
    ).toBe(true)
    expect(isSessionAttachmentRagIndexingError('local_parser_failed')).toBe(false)
  })

  it('keeps documents inline with a warning when parsed text exceeds the session attachment limit', async () => {
    const file = createFile('dense.pdf')
    const parsedContent = 'a'.repeat(SESSION_ATTACHMENT_RAG_MAX_PARSED_BYTE_LENGTH + 1)
    blobStore.set('local-key', parsedContent)
    mockParseFileLocally.mockResolvedValueOnce({ isSupported: true, key: 'local-key' })

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(result.error).toBeUndefined()
    expect(result.sessionAttachmentAvailability).toBe('allowed')
    expect(result.sessionAttachmentBlockedReason).toBeUndefined()
    expect(result.sessionAttachmentWarningReason).toBe(SESSION_ATTACHMENT_RAG_LARGE_ATTACHMENT_WARNING)
    expect(result.ragMode).toBe('inline')
    expect(result.byteLength).toBe(SESSION_ATTACHMENT_RAG_MAX_PARSED_BYTE_LENGTH + 1)
    expect(result.tokenCountMap?.default).toBe(parsedContent.length)
  })

  it('backfills raw binary storage for cached non-text files', async () => {
    const file = createFile('cached.pdf', 'raw-pdf-content')
    const storageKey = `file:/tmp/${file.name}-${file.size}-${file.lastModified}`
    const rawStorageKey = `${storageKey}_raw`
    blobStore.set(storageKey, 'cached parsed content')

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' }, { agentMode: true })

    expect(result.error).toBeUndefined()
    expect(result.storageKey).toBe(storageKey)
    expect(result.rawStorageKey).toBe(rawStorageKey)
    expect(blobStore.get(rawStorageKey)).toMatch(/^data:application\/pdf;base64,/)
  })

  it('uses raw-only sandbox descriptors for supported documents when agent mode has no parser', async () => {
    parserState.type = 'none'
    const file = createFile('no-parser.pdf', 'raw-pdf-content')
    const storageKey = `file:/tmp/${file.name}-${file.size}-${file.lastModified}`
    const rawStorageKey = `${storageKey}_raw`

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' }, { agentMode: true })

    expect(mockParseFileLocally).not.toHaveBeenCalled()
    expect(mockUploadAndCreateUserFile).not.toHaveBeenCalled()
    expect(result.error).toBeUndefined()
    expect(result.content).toContain('[File: no-parser.pdf')
    expect(result.storageKey).toBe(storageKey)
    expect(result.rawStorageKey).toBe(rawStorageKey)
    expect(result.parserType).toBe('sandbox-raw')
    expect(blobStore.get(rawStorageKey)).toMatch(/^data:application\/pdf;base64,/)
  })
})

describe('searchSessions archived chat filtering', () => {
  const sessions = {
    active: {
      id: 'active',
      name: 'Active chat',
      type: 'chat',
      createdAt: 1,
      messages: [{ id: 'active-message', role: 'user', content: 'needle' }],
      settings: {},
    },
    archived: {
      id: 'archived',
      name: 'Archived chat',
      type: 'chat',
      createdAt: 2,
      hidden: true,
      archivedAt: 3,
      messages: [{ id: 'archived-message', role: 'user', content: 'needle' }],
      settings: {},
    },
  }

  const getPage = vi.fn(async () => ({ items: [{ id: 'active' }], nextCursor: null, total: 1 }))
  const getArchivedPage = vi.fn(async () => ({
    items: [{ id: 'active' }, { id: 'archived' }],
    nextCursor: null,
    total: 2,
  }))

  beforeEach(() => {
    getPage.mockClear()
    getArchivedPage.mockClear()
    mockGetMetaStorage.mockResolvedValue({ getPage, getArchivedPage })
    mockGetItem.mockImplementation(<T>(key: string, initialValue: T) => {
      if (key.endsWith('active')) return Promise.resolve(sessions.active as T)
      if (key.endsWith('archived')) return Promise.resolve(sessions.archived as T)
      return Promise.resolve(initialValue)
    })
  })

  it('keeps global search active-only by default', async () => {
    const results: string[] = []

    await searchSessions('needle', undefined, (batch) => results.push(...batch.map((session) => session.id)))

    expect(results).toEqual(['active'])
    expect(getArchivedPage).not.toHaveBeenCalled()
  })

  it('includes archived chats without emitting duplicate sessions', async () => {
    const results: string[] = []

    await searchSessions('needle', undefined, (batch) => results.push(...batch.map((session) => session.id)), {
      includeArchived: true,
    })

    expect(results).toEqual(['active', 'archived'])
    expect(getArchivedPage).toHaveBeenCalledTimes(1)
  })
})
