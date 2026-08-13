import type { FollowUpState, Session, SessionMetaRecord } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const sessions = new Map<string, Session>()
  const metas = new Map<string, SessionMetaRecord>()
  const removeFailures = new Set<string>()
  const ragDelete = vi.fn(async () => {})
  const sandboxReset = vi.fn(async () => {})
  const sandboxRemoveArtifacts = vi.fn(async () => {})
  const metaStorage = {
    initialize: vi.fn(async () => {}),
    getById: vi.fn(async (id: string) => metas.get(id) ?? null),
    update: vi.fn((id: string, updates: Partial<SessionMetaRecord>) => {
      const current = metas.get(id)
      if (!current) return null
      const next = { ...current, ...updates }
      metas.set(id, next)
      return next
    }),
    delete: vi.fn((id: string) => {
      metas.delete(id)
    }),
    deleteMany: vi.fn((ids: string[]) => {
      for (const id of ids) metas.delete(id)
    }),
    create: vi.fn((record: SessionMetaRecord) => {
      metas.set(record.id, record)
    }),
    getPage: vi.fn(async () => ({ items: [], nextCursor: null, total: 0 })),
    getArchivedPage: vi.fn(async () => ({ items: [], nextCursor: null, total: 0 })),
    getAllIncludingHidden: vi.fn(async () => [...metas.values()]),
  }
  const storage = {
    getItem: vi.fn(async (key: string, fallback: unknown) => sessions.get(key.replace(/^session:/, '')) ?? fallback),
    setItemNow: vi.fn((key: string, value: Session) => {
      sessions.set(key.replace(/^session:/, ''), structuredClone(value))
    }),
    removeItem: vi.fn((key: string) => {
      const id = key.replace(/^session:/, '')
      if (removeFailures.delete(id)) throw new Error(`remove failed: ${id}`)
      sessions.delete(id)
    }),
  }
  return {
    sessions,
    metas,
    removeFailures,
    ragDelete,
    sandboxReset,
    sandboxRemoveArtifacts,
    metaStorage,
    storage,
  }
})

vi.mock('@/platform', () => ({
  default: {
    type: 'desktop',
    getSessionMetaStorage: () => mocks.metaStorage,
    getSessionAttachmentRagController: () => ({ deleteSessionAttachments: mocks.ragDelete }),
    sandboxReset: mocks.sandboxReset,
    sandboxRemoveArtifacts: mocks.sandboxRemoveArtifacts,
  },
}))

vi.mock('@/storage', () => ({
  default: mocks.storage,
  StorageKey: { ChatSessions: 'chat-sessions' },
}))

vi.mock('./uiStore', () => ({
  uiStore: {
    getState: () => ({
      clearSessionWebBrowsing: vi.fn(),
      removeSessionKnowledgeBase: vi.fn(),
      clearSessionAgentMode: vi.fn(),
    }),
  },
}))

vi.mock('@/components/chat/MessageList', () => ({ clearScrollPositionCache: vi.fn() }))
vi.mock('./atoms/throttleWriteSessionAtom', () => ({ cleanupSessionAtomCache: vi.fn() }))
vi.mock('@/router', () => ({ router: { navigate: vi.fn() } }))

import { deleteOwnedSideChatSessions, deleteSession, getSession } from './chatStore'

beforeEach(() => {
  mocks.sessions.clear()
  mocks.metas.clear()
  mocks.removeFailures.clear()
  mocks.ragDelete.mockClear()
  mocks.sandboxReset.mockClear()
  mocks.sandboxRemoveArtifacts.mockClear()
  mocks.storage.getItem.mockClear()
  mocks.storage.setItemNow.mockClear()
  mocks.storage.removeItem.mockClear()
  mocks.metaStorage.getById.mockClear()
  mocks.metaStorage.update.mockClear()
  mocks.metaStorage.delete.mockClear()
  mocks.metaStorage.deleteMany.mockClear()
  mocks.metaStorage.create.mockClear()
})

describe('owned Side Chat deletion', () => {
  it('deletes the source before cascading each valid hidden chat once', async () => {
    seed(sourceSession())
    seed(session('side-chat', { hidden: true, type: 'chat' }))

    await deleteSession('source')

    expect(await getSession('source')).toBeNull()
    expect(await getSession('side-chat')).toBeNull()
    expect(mocks.storage.removeItem.mock.calls.map(([key]) => key)).toEqual(['session:source', 'session:side-chat'])
    expect(mocks.ragDelete).toHaveBeenNthCalledWith(1, 'source')
    expect(mocks.ragDelete).toHaveBeenNthCalledWith(2, 'side-chat')
  })

  it('does not delete owned Side Chats when source storage deletion fails', async () => {
    seed(
      session('source-delete-failure', {
        type: 'chat',
        followUpState: { version: 1, scopes: {}, sideChats: { item: link('side-chat-delete-failure') } },
      })
    )
    seed(session('side-chat-delete-failure', { hidden: true, type: 'chat' }))
    mocks.removeFailures.add('source-delete-failure')

    await expect(deleteSession('source-delete-failure')).rejects.toThrow('remove failed: source-delete-failure')

    expect(await getSession('source-delete-failure')).not.toBeNull()
    expect(await getSession('side-chat-delete-failure')).not.toBeNull()
    expect(mocks.storage.removeItem.mock.calls.map(([key]) => key)).toEqual(['session:source-delete-failure'])
  })

  it('does not cascade a visible session referenced by a malformed source link', async () => {
    seed(sourceSession({ item: link('visible') }))
    seed(session('visible', { hidden: false, type: 'chat' }))

    await deleteSession('source')

    expect(await getSession('source')).toBeNull()
    expect(await getSession('visible')).not.toBeNull()
  })

  it('never deletes a visible or non-chat session referenced by a malformed link', async () => {
    seed(sourceSession({ visible: link('visible'), picture: link('picture') }))
    seed(session('visible', { hidden: false, type: 'chat' }))
    seed(session('picture', { hidden: true, type: 'picture' }))

    await deleteOwnedSideChatSessions('source')

    expect(await getSession('visible')).not.toBeNull()
    expect(await getSession('picture')).not.toBeNull()
    expect(mocks.storage.removeItem).not.toHaveBeenCalled()
  })

  it('does not delete a target still owned by a different thread', async () => {
    seed(
      sourceSession({
        first: link('shared-side-chat', 'thread-a'),
        second: link('shared-side-chat', 'thread-b'),
      })
    )
    seed(session('shared-side-chat', { hidden: true, type: 'chat' }))

    await deleteOwnedSideChatSessions('source', 'thread-a')

    expect(await getSession('shared-side-chat')).not.toBeNull()
    expect(mocks.storage.removeItem).not.toHaveBeenCalled()
  })

  it('restores the source link when Side Chat storage deletion fails', async () => {
    seed(
      session('source-failure', {
        type: 'chat',
        followUpState: { version: 1, scopes: {}, sideChats: { item: link('side-chat-failure') } },
      })
    )
    seed(session('side-chat-failure', { hidden: true, type: 'chat' }))
    mocks.removeFailures.add('side-chat-failure')

    await expect(deleteOwnedSideChatSessions('source-failure')).rejects.toThrow('remove failed: side-chat-failure')

    expect((await getSession('source-failure'))?.followUpState?.sideChats?.item?.sessionId).toBe('side-chat-failure')
    expect(await getSession('side-chat-failure')).not.toBeNull()
  })
})

function seed(value: Session) {
  mocks.sessions.set(value.id, structuredClone(value))
  mocks.metas.set(value.id, {
    id: value.id,
    name: value.name,
    hidden: value.hidden,
    type: value.type,
    sortOrder: 1,
    createdAt: 1,
  })
}

function session(id: string, overrides: Partial<Session> = {}): Session {
  return { id, name: id, messages: [], ...overrides }
}

function sourceSession(sideChats: NonNullable<FollowUpState['sideChats']> = { item: link('side-chat') }): Session {
  return session('source', {
    type: 'chat',
    followUpState: { version: 1, scopes: {}, sideChats },
  })
}

function link(sessionId: string, threadId = 'thread-a') {
  return { queueItemId: `${sessionId}-item`, sessionId, threadId, createdAt: 1, updatedAt: 1 }
}
