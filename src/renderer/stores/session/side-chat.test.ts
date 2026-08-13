import type { FollowUpQueueItem, Message, Session, SessionMetaRecord } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exportBackupArchive } from '@/packages/backup/export-backup'
import { backupSessionStorageKey } from '@/packages/backup/storage-keys'
import type { BackupMetaStorage, BackupStorage } from '@/packages/backup/types'

const mocks = vi.hoisted(() => ({
  createGoal: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  ensureAttachment: vi.fn(),
  getSession: vi.fn(),
  generateSideChatReply: vi.fn(),
  consumeFollowUpIntoSideChat: vi.fn(),
  setSessionWebBrowsing: vi.fn(),
  updateMessage: vi.fn(),
  updateSession: vi.fn(),
}))

vi.mock('@/platform', () => ({
  default: { type: 'desktop' },
}))

vi.mock('../chatStore', () => ({
  createSession: mocks.createSession,
  deleteSession: mocks.deleteSession,
  getSession: mocks.getSession,
  updateMessage: mocks.updateMessage,
  updateSession: mocks.updateSession,
}))

vi.mock('../sessionAttachmentRagIndexing', () => ({
  ensureMessageFileSessionAttachment: mocks.ensureAttachment,
}))

vi.mock('./follow-up-queue', () => ({
  consumeFollowUpIntoSideChat: mocks.consumeFollowUpIntoSideChat,
}))

vi.mock('./generation', () => ({
  generateSideChatReply: mocks.generateSideChatReply,
}))

vi.mock('../uiStore', () => ({
  uiStore: { getState: () => ({ setSessionWebBrowsing: mocks.setSessionWebBrowsing }) },
}))

vi.mock('./goal', () => ({
  createGoal: mocks.createGoal,
}))

import { findLinkedSideChatSessionId, openFollowUpInSideChat, startFollowUpSideChatGeneration } from './side-chat'

function message(id: string, text: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    role: 'user',
    contentParts: [{ type: 'text', text }],
    timestamp: 100,
    ...overrides,
  }
}

function sourceSession(): Session {
  return {
    id: 'source-session',
    name: 'Source chat',
    type: 'chat',
    messages: [
      { id: 'system-source', role: 'system', contentParts: [{ type: 'text', text: 'Keep source safe.' }] },
      message('existing-user', 'Earlier source message'),
    ],
    settings: { provider: 'openai-responses', modelId: 'gpt-5.6-sol' },
    followUpState: { version: 1, scopes: {} },
  }
}

function queueItem(overrides: Partial<FollowUpQueueItem> = {}): FollowUpQueueItem {
  return {
    id: 'queue-item',
    threadId: 'source-session',
    userMessage: message('queued-user', 'Investigate the follow-up', {
      generating: true,
      cancel: vi.fn(),
      error: 'stale error',
      errorCode: 500,
      status: [{ type: 'retrying', attempt: 1, maxAttempts: 5, error: 'stale status' }],
      files: [
        {
          id: 'source-file-1',
          name: 'one.pdf',
          fileType: 'application/pdf',
          storageKey: 'file:one',
          ragMode: 'session-retrieval',
          chatboxAIFileUUID: 'remote-source-id',
          sessionAttachmentId: 11,
          sessionAttachmentAvailability: 'blocked',
          sessionAttachmentIndexStatus: 'failed',
          sessionAttachmentBlockedReason: 'source-only',
        },
        {
          id: 'source-file-2',
          name: 'two.txt',
          fileType: 'text/plain',
          storageKey: 'file:two',
          ragMode: 'session-retrieval',
          sessionAttachmentId: 12,
          sessionAttachmentIndexStatus: 'ready',
        },
      ],
    }),
    reservedAssistantMessageId: 'reserved-assistant',
    intent: 'queue',
    status: 'ready',
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  }
}

function installStore(source = sourceSession()) {
  const sessions = new Map<string, Session>([[source.id, source]])
  let nextSideChatId = 1

  mocks.getSession.mockImplementation((id: string) => Promise.resolve(sessions.get(id) ?? null))
  mocks.createSession.mockImplementation((newSession: Omit<Session, 'id'>) => {
    const created = { ...newSession, id: `side-chat-${nextSideChatId++}` } as Session
    sessions.set(created.id, created)
    return Promise.resolve(created)
  })
  mocks.updateSession.mockImplementation(
    (id: string, update: Partial<Session> | ((session: Session) => Partial<Session>)) => {
      const current = sessions.get(id)
      if (!current) throw new Error(`Session ${id} not found`)
      const changes = typeof update === 'function' ? update(current) : update
      const updated = { ...current, ...changes }
      sessions.set(id, updated)
      return Promise.resolve(updated)
    }
  )
  mocks.updateMessage.mockImplementation((sessionId: string, messageId: string, next: Message) => {
    const current = sessions.get(sessionId)
    if (!current) throw new Error(`Session ${sessionId} not found`)
    sessions.set(sessionId, {
      ...current,
      messages: current.messages.map((entry) => (entry.id === messageId ? next : entry)),
    })
    return Promise.resolve()
  })
  mocks.deleteSession.mockImplementation((id: string) => {
    sessions.delete(id)
    return Promise.resolve()
  })
  mocks.consumeFollowUpIntoSideChat.mockImplementation((sourceId: string, itemId: string, sideId: string) => {
    const current = sessions.get(sourceId)
    if (!current) throw new Error(`Session ${sourceId} not found`)
    sessions.set(sourceId, {
      ...current,
      followUpState: {
        ...(current.followUpState ?? { version: 1, scopes: {} }),
        sideChats: {
          ...current.followUpState?.sideChats,
          [itemId]: { queueItemId: itemId, sessionId: sideId, createdAt: 100, updatedAt: 100 },
        },
      },
    })
    return Promise.resolve()
  })
  mocks.ensureAttachment.mockImplementation(({ file }: { file: NonNullable<Message['files']>[number] }) =>
    Promise.resolve({
      ...file,
      sessionAttachmentId: file.name === 'one.pdf' ? 101 : 102,
      sessionAttachmentAvailability: 'allowed',
      sessionAttachmentIndexStatus: 'ready',
    })
  )

  return sessions
}

describe('openFollowUpInSideChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createGoal.mockResolvedValue(undefined)
  })

  it('starts the selected message once in the isolated Side Chat with its browsing snapshot', async () => {
    installStore()
    const item = queueItem({ webBrowsing: true })
    const sideChat = await openFollowUpInSideChat('source-session', item)

    await Promise.all([
      startFollowUpSideChatGeneration(sideChat.id, item.webBrowsing),
      startFollowUpSideChatGeneration(sideChat.id, item.webBrowsing),
    ])
    await startFollowUpSideChatGeneration(sideChat.id, item.webBrowsing)

    const userMessage = sideChat.messages.find((entry) => entry.role === 'user')
    expect(mocks.setSessionWebBrowsing).toHaveBeenCalledWith(sideChat.id, true)
    expect(mocks.generateSideChatReply).toHaveBeenCalledOnce()
    expect(mocks.generateSideChatReply).toHaveBeenCalledWith(sideChat.id, userMessage?.id)
  })

  it('finds a linked Side Chat after the source route is reopened', () => {
    const source = sourceSession()
    source.followUpState = {
      version: 1,
      scopes: {},
      sideChats: {
        'queue-item': { queueItemId: 'queue-item', sessionId: 'side-chat-1', createdAt: 1, updatedAt: 1 },
      },
    }

    expect(findLinkedSideChatSessionId(source, 'side-chat-1')).toBe('side-chat-1')
    expect(findLinkedSideChatSessionId(source, 'missing')).toBeUndefined()
  })

  it('creates an isolated hidden session and rebuilds attachment identity without persisting credentials', async () => {
    const source = sourceSession()
    const originalSource = structuredClone(source)
    const item = queueItem({
      sessionSettings: {
        provider: 'openai-responses',
        modelId: 'gpt-5.6-sol',
        workingDirectories: ['D:\\workspace'],
        apiKey: 'must-not-be-persisted',
        accessToken: 'must-not-be-persisted',
      } as FollowUpQueueItem['sessionSettings'],
    })
    const originalItemFiles = structuredClone(item.userMessage.files)
    const sessions = installStore(source)

    const sideChat = await openFollowUpInSideChat(source.id, item)

    expect(sideChat).toMatchObject({
      id: 'side-chat-1',
      hidden: true,
      type: 'chat',
      activeThreadId: 'side-chat-1',
      settings: {
        provider: 'openai-responses',
        modelId: 'gpt-5.6-sol',
        workingDirectories: ['D:\\workspace'],
      },
    })
    expect(sideChat.settings).not.toHaveProperty('apiKey')
    expect(sideChat.settings).not.toHaveProperty('accessToken')
    expect(sideChat.messages[0]).toMatchObject({
      role: 'system',
      contentParts: [{ type: 'text', text: 'Keep source safe.' }],
    })

    const copied = sideChat.messages[1]
    expect(copied.id).not.toBe(item.userMessage.id)
    expect(copied).not.toHaveProperty('generating')
    expect(copied).not.toHaveProperty('cancel')
    expect(copied).not.toHaveProperty('error')
    expect(copied.status).toEqual([])
    expect(copied.files).toHaveLength(2)
    expect(copied.files?.[0].id).not.toBe('source-file-1')
    expect(copied.files?.[1].id).not.toBe('source-file-2')
    expect(copied.files?.[0].id).not.toBe(copied.files?.[1].id)
    expect(copied.files?.[0]).toMatchObject({ storageKey: 'file:one', sessionAttachmentId: 101 })
    expect(copied.files?.[0]).not.toHaveProperty('chatboxAIFileUUID')
    expect(copied.files?.[0]).not.toHaveProperty('sessionAttachmentBlockedReason')

    expect(mocks.ensureAttachment).toHaveBeenNthCalledWith(1, {
      sessionId: sideChat.id,
      messageId: copied.id,
      file: expect.objectContaining({ id: copied.files?.[0].id }),
    })
    expect(mocks.ensureAttachment).toHaveBeenNthCalledWith(2, {
      sessionId: sideChat.id,
      messageId: copied.id,
      file: expect.objectContaining({ id: copied.files?.[1].id }),
    })
    expect(mocks.consumeFollowUpIntoSideChat).toHaveBeenCalledOnce()
    expect(sessions.get(source.id)?.messages).toEqual(originalSource.messages)
    expect(item.userMessage.files).toEqual(originalItemFiles)
  })

  it('reopens the linked hidden session without creating or rebuilding it', async () => {
    const sessions = installStore()
    const item = queueItem()
    const first = await openFollowUpInSideChat('source-session', item)

    vi.clearAllMocks()
    mocks.getSession.mockImplementation(async (id: string) => sessions.get(id) ?? null)
    const reopened = await openFollowUpInSideChat('source-session', item)

    expect(reopened.id).toBe(first.id)
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(mocks.ensureAttachment).not.toHaveBeenCalled()
    expect(mocks.consumeFollowUpIntoSideChat).not.toHaveBeenCalled()
  })

  it('single-flights concurrent opens for one source queue item', async () => {
    installStore()
    let releaseAttachment!: () => void
    const attachmentReady = new Promise<void>((resolve) => {
      releaseAttachment = resolve
    })
    mocks.ensureAttachment.mockImplementationOnce(async ({ file }: { file: NonNullable<Message['files']>[number] }) => {
      await attachmentReady
      return {
        ...file,
        sessionAttachmentId: 201,
        sessionAttachmentAvailability: 'allowed',
        sessionAttachmentIndexStatus: 'ready',
      }
    })

    const first = openFollowUpInSideChat('source-session', queueItem())
    const second = openFollowUpInSideChat('source-session', queueItem())
    await Promise.resolve()
    expect(mocks.createSession).toHaveBeenCalledOnce()
    releaseAttachment()

    const [left, right] = await Promise.all([first, second])
    expect(left.id).toBe(right.id)
    expect(mocks.consumeFollowUpIntoSideChat).toHaveBeenCalledOnce()
  })

  it('does not trust a stale link to the source or to a visible session', async () => {
    const source = sourceSession()
    source.followUpState = {
      version: 1,
      scopes: {},
      sideChats: {
        'queue-item': { queueItemId: 'queue-item', sessionId: source.id, createdAt: 1, updatedAt: 1 },
      },
    }
    installStore(source).set('visible-session', {
      id: 'visible-session',
      name: 'Visible',
      type: 'chat',
      messages: [],
      hidden: false,
    })

    const result = await openFollowUpInSideChat(source.id, queueItem({ sideChatSessionId: 'visible-session' }))

    expect(result.id).toBe('side-chat-1')
    expect(result.hidden).toBe(true)
    expect(mocks.createSession).toHaveBeenCalledOnce()
  })

  it('does not reopen a linked hidden non-chat session', async () => {
    const source = sourceSession()
    source.followUpState = {
      version: 1,
      scopes: {},
      sideChats: {
        'queue-item': { queueItemId: 'queue-item', sessionId: 'hidden-picture', createdAt: 1, updatedAt: 1 },
      },
    }
    installStore(source).set('hidden-picture', {
      id: 'hidden-picture',
      name: 'Hidden picture',
      type: 'picture',
      messages: [],
      hidden: true,
    })

    const result = await openFollowUpInSideChat(source.id, queueItem())

    expect(result.id).toBe('side-chat-1')
    expect(result.type).toBe('chat')
  })

  it('rolls back when active-thread initialization fails', async () => {
    const sessions = installStore()
    mocks.updateSession.mockRejectedValueOnce(new Error('thread initialization failed'))

    await expect(openFollowUpInSideChat('source-session', queueItem())).rejects.toThrow('thread initialization failed')

    expect(mocks.ensureAttachment).not.toHaveBeenCalled()
    expect(mocks.consumeFollowUpIntoSideChat).not.toHaveBeenCalled()
    expect(mocks.deleteSession).toHaveBeenCalledWith('side-chat-1')
    expect(sessions.has('side-chat-1')).toBe(false)
  })

  it('rebuilds RAG attachments serially and rolls back the hidden session on failure', async () => {
    const sessions = installStore()
    mocks.ensureAttachment
      .mockResolvedValueOnce({ id: 'copied-one', name: 'one.pdf' })
      .mockRejectedValueOnce(new Error('RAG indexing failed'))

    await expect(openFollowUpInSideChat('source-session', queueItem())).rejects.toThrow('RAG indexing failed')

    expect(mocks.ensureAttachment).toHaveBeenCalledTimes(2)
    expect(mocks.updateMessage).not.toHaveBeenCalled()
    expect(mocks.consumeFollowUpIntoSideChat).not.toHaveBeenCalled()
    expect(mocks.deleteSession).toHaveBeenCalledWith('side-chat-1')
    expect(sessions.has('side-chat-1')).toBe(false)
  })

  it('rolls back when linking the completed Side Chat to its source fails', async () => {
    const sessions = installStore()
    mocks.consumeFollowUpIntoSideChat.mockRejectedValueOnce(new Error('source link failed'))

    await expect(openFollowUpInSideChat('source-session', queueItem())).rejects.toThrow('source link failed')

    expect(mocks.updateMessage).toHaveBeenCalledOnce()
    expect(mocks.deleteSession).toHaveBeenCalledWith('side-chat-1')
    expect(sessions.has('side-chat-1')).toBe(false)
  })

  it('copies an explicit queue goal only to the Side Chat', async () => {
    const source = sourceSession()
    const sessions = installStore(source)

    const sideChat = await openFollowUpInSideChat(
      source.id,
      queueItem({ goalObjective: 'Keep the Side Chat scoped to this investigation.' })
    )

    expect(mocks.createGoal).toHaveBeenCalledWith(sideChat.id, 'Keep the Side Chat scoped to this investigation.')
    expect(sessions.get(source.id)?.goal).toBeUndefined()
  })

  it('reports a rollback failure together with the original failure', async () => {
    installStore()
    mocks.ensureAttachment.mockRejectedValueOnce(new Error('RAG indexing failed'))
    mocks.deleteSession.mockRejectedValueOnce(new Error('delete failed'))

    const error = await openFollowUpInSideChat('source-session', queueItem()).catch((reason) => reason)

    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors).toEqual([
      expect.objectContaining({ message: 'RAG indexing failed' }),
      expect.objectContaining({ message: 'delete failed' }),
    ])
  })
})

class MemoryBackupStorage implements BackupStorage {
  readonly values = new Map<string, unknown>()

  getAllKeys() {
    return Promise.resolve([...this.values.keys()])
  }
  getItem<T>(key: string, initialValue: T) {
    return Promise.resolve((this.values.get(key) ?? initialValue) as T)
  }
  setItemNow<T>(key: string, value: T) {
    this.values.set(key, value)
    return Promise.resolve()
  }
  removeItem(key: string) {
    this.values.delete(key)
    return Promise.resolve()
  }
  getBlob() {
    return Promise.resolve(null)
  }
  setBlob() {
    return Promise.resolve()
  }
  delBlob() {
    return Promise.resolve()
  }
}

class MemoryBackupMetaStorage implements BackupMetaStorage {
  constructor(private readonly records: SessionMetaRecord[]) {}

  getAllIncludingHidden() {
    return Promise.resolve(this.records)
  }
  getById(id: string) {
    return Promise.resolve(this.records.find((record) => record.id === id) ?? null)
  }
  create(record: SessionMetaRecord) {
    this.records.push(record)
    return Promise.resolve()
  }
  update(id: string, updates: Partial<SessionMetaRecord>) {
    const index = this.records.findIndex((record) => record.id === id)
    if (index < 0) return Promise.resolve(null)
    this.records[index] = { ...this.records[index], ...updates }
    return Promise.resolve(this.records[index])
  }
  delete(id: string) {
    const index = this.records.findIndex((record) => record.id === id)
    if (index >= 0) this.records.splice(index, 1)
    return Promise.resolve()
  }
}

describe('Side Chat backup inclusion', () => {
  it('exports a hidden Side Chat discovered through getAllIncludingHidden', async () => {
    const sideChat: Session = {
      id: 'hidden-side-chat',
      name: 'Hidden Side Chat',
      type: 'chat',
      hidden: true,
      messages: [message('side-message', 'Preserve me')],
    }
    const storage = new MemoryBackupStorage()
    storage.values.set(backupSessionStorageKey(sideChat.id), sideChat)
    const metaStorage = new MemoryBackupMetaStorage([
      {
        id: sideChat.id,
        name: sideChat.name,
        type: 'chat',
        hidden: true,
        sortOrder: 1,
        createdAt: 1,
      },
    ])

    const exported = await exportBackupArchive({
      exportItems: ['conversations'],
      includeKeys: false,
      storage,
      metaStorage,
      application: { version: 'test', platform: 'test' },
      writeArchive: async (dataCallback) => {
        for await (const _chunk of dataCallback()) {
          // Consume the stream to exercise the complete export path.
        }
        return { boundedMemory: true }
      },
    })

    expect(exported.manifest.sessions).toEqual([
      expect.objectContaining({
        id: sideChat.id,
        meta: expect.objectContaining({ id: sideChat.id, hidden: true }),
      }),
    ])
  })
})
