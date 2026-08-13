/**
 * This module contains all fundamental operations for chat sessions and messages.
 * It uses react-query for caching.
 * */

import NiceModal from '@ebay/nice-modal-react'
import {
  type Message,
  type Session,
  type SessionArchiveSource,
  type SessionMeta,
  type SessionMetaPage,
  type SessionMetaRecord,
  type SessionSettings,
  SessionSettingsSchema,
  type Updater,
  type UpdaterFn,
} from '@shared/types'
import { type InfiniteData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { getDefaultStore } from 'jotai'
import compact from 'lodash/compact'
import isEmpty from 'lodash/isEmpty'
import { useMemo } from 'react'
import { v4 as uuidv4 } from 'uuid'
import i18n from '@/i18n'
import platform from '@/platform'
import storage, { StorageKey } from '@/storage'
import type { SessionMetaStorage } from '@/storage/SessionMetaStorage'
import { sortSessionRecords } from '@/storage/SessionMetaStorage'
import { StorageKeyGenerator } from '@/storage/StoreStorage'
import * as defaults from '../../shared/defaults'
import { getLogger } from '../lib/utils'
import { deleteSessionStorageRecords } from '../services/session-deletion'
import { migrateSession } from '../utils/session-utils'
import { uiStore } from './uiStore'

const log = getLogger('chat-store')

import { clearScrollPositionCache } from '@/components/chat/MessageList'
import { currentSessionIdAtom } from './atoms'
import { cleanupSessionAtomCache } from './atoms/throttleWriteSessionAtom'
import {
  assertNoMessageDataUpdate,
  getSessionMetadataSnapshot,
  mergeCachedGeneratingMessages,
  type SessionMetadataUpdate,
} from './chatStore-cache'
import { lastUsedModelStore } from './lastUsedModelStore'
import queryClient from './queryClient'
import { isSessionGenerationActive } from './session/generation-lock'
import { getSessionMeta } from './sessionHelpers'
import { settingsStore, useSettingsStore } from './settingsStore'
import { UpdateQueue } from './updateQueue'

export const QueryKeys = {
  ChatSessionsList: ['chat-sessions-list'],
  ArchivedChatSessionsList: ['archived-chat-sessions-list'],
  ChatSession: (id: string) => ['chat-session', id],
  ChatSessionSettings: (id: string) => ['chat-session-settings', id],
}

// MARK: session meta storage

let _metaStorage: SessionMetaStorage | null = null

export async function getMetaStorage(): Promise<SessionMetaStorage> {
  if (!_metaStorage) {
    _metaStorage = platform.getSessionMetaStorage()
    await _metaStorage.initialize()
  }
  return _metaStorage
}

// MARK: session list operations

type InfiniteSessionData = InfiniteData<SessionMetaPage, number>

async function _listSessionsMetaPage(cursor: number): Promise<SessionMetaPage> {
  console.debug('chatStore', 'listSessionsMetaPage', cursor)
  try {
    const metaStorage = await getMetaStorage()
    return await metaStorage.getPage(cursor)
  } catch (error) {
    log.error('Failed to read session list page from DB:', error)
    throw error
  }
}

export async function listSessionsMetaPage(cursor: number, limit?: number): Promise<SessionMetaPage> {
  const metaStorage = await getMetaStorage()
  return await metaStorage.getPage(cursor, limit)
}

const listSessionsMetaQueryOptions = {
  queryKey: QueryKeys.ChatSessionsList,
  queryFn: ({ pageParam }: { pageParam: number }) => _listSessionsMetaPage(pageParam),
  getNextPageParam: (lastPage: SessionMetaPage) => lastPage.nextCursor,
  initialPageParam: 0,
  staleTime: Infinity,
}

/** Get all currently cached session metas (flattened from loaded pages). */
export function getCachedSessionsMeta(): SessionMetaRecord[] {
  const data = queryClient.getQueryData<InfiniteSessionData>(QueryKeys.ChatSessionsList)
  if (!data) return []
  return data.pages.flatMap((p) => p.items)
}

/** Get all session metas. Returns cached data if available, otherwise fetches first page. */
export async function listSessionsMeta(): Promise<SessionMetaRecord[]> {
  const cached = getCachedSessionsMeta()
  if (cached.length > 0) return cached
  const data = await queryClient.fetchInfiniteQuery(listSessionsMetaQueryOptions)
  return data.pages.flatMap((p) => p.items)
}

/** Get all session metas from storage, bypassing the paginated cache. */
export async function listAllSessionsMeta(): Promise<SessionMetaRecord[]> {
  const items: SessionMetaRecord[] = []
  let cursor: number | null = 0
  while (cursor !== null) {
    const page = await listSessionsMetaPage(cursor)
    items.push(...page.items)
    cursor = page.nextCursor
  }
  return items
}

async function _listArchivedSessionsMetaPage(cursor: number): Promise<SessionMetaPage> {
  const metaStorage = await getMetaStorage()
  return await metaStorage.getArchivedPage(cursor)
}

export async function listArchivedSessionsMetaPage(cursor: number, limit?: number): Promise<SessionMetaPage> {
  const metaStorage = await getMetaStorage()
  return await metaStorage.getArchivedPage(cursor, limit)
}

export async function countSessionsMeta(): Promise<number> {
  const metaStorage = await getMetaStorage()
  return await metaStorage.getTotal()
}

export async function countArchivedSessionsMeta(): Promise<number> {
  const metaStorage = await getMetaStorage()
  return await metaStorage.getArchivedTotal()
}

const listArchivedSessionsMetaQueryOptions = {
  queryKey: QueryKeys.ArchivedChatSessionsList,
  queryFn: ({ pageParam }: { pageParam: number }) => _listArchivedSessionsMetaPage(pageParam),
  getNextPageParam: (lastPage: SessionMetaPage) => lastPage.nextCursor,
  initialPageParam: 0,
  staleTime: Infinity,
}

export async function listArchivedSessionsMeta(): Promise<SessionMetaRecord[]> {
  const items: SessionMetaRecord[] = []
  let cursor: number | null = 0
  while (cursor !== null) {
    const page = await listArchivedSessionsMetaPage(cursor)
    items.push(...page.items)
    cursor = page.nextCursor
  }
  return items
}

export function useSessionList() {
  const result = useInfiniteQuery(listSessionsMetaQueryOptions)
  const sessionMetaList = useMemo(() => result.data?.pages.flatMap((p) => p.items), [result.data])
  return {
    sessionMetaList,
    refetch: result.refetch,
    fetchNextPage: result.fetchNextPage,
    hasNextPage: result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
  }
}

export function useArchivedSessionList() {
  const result = useInfiniteQuery(listArchivedSessionsMetaQueryOptions)
  const archivedSessionMetaList = useMemo(() => result.data?.pages.flatMap((p) => p.items), [result.data])
  return {
    archivedSessionMetaList,
    refetch: result.refetch,
    fetchNextPage: result.fetchNextPage,
    hasNextPage: result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
    isLoading: result.isLoading,
  }
}

/**
 * Update the paginated session list cache.
 * Flattens all loaded pages, applies the updater, then re-packs into a single page
 * preserving the nextCursor for further pagination.
 */
export function updateSessionListData(updater: (items: SessionMetaRecord[]) => SessionMetaRecord[]) {
  queryClient.setQueryData<InfiniteSessionData>(QueryKeys.ChatSessionsList, (old) => {
    if (!old || !old.pages.length) return old
    const allItems = old.pages.flatMap((p) => p.items)
    const updated = updater(allItems)
    const lastPage = old.pages[old.pages.length - 1]
    const delta = updated.length - allItems.length
    return {
      pages: [
        {
          items: updated,
          nextCursor: lastPage.nextCursor !== null ? lastPage.nextCursor + delta : null,
          total: (lastPage.total || 0) + delta,
        },
      ],
      pageParams: [0],
    }
  })
}

/** Re-read the first session list page from DB and update cache. Use for bulk operations only. */
export async function refreshSessionListCache() {
  const firstPage = await _listSessionsMetaPage(0)
  queryClient.setQueryData<InfiniteSessionData>(QueryKeys.ChatSessionsList, {
    pages: [firstPage],
    pageParams: [0],
  })
}

async function refreshArchivedSessionListCache() {
  const firstPage = await _listArchivedSessionsMetaPage(0)
  queryClient.setQueryData<InfiniteSessionData>(QueryKeys.ArchivedChatSessionsList, {
    pages: [firstPage],
    pageParams: [0],
  })
}

function updateArchivedSessionListData(updater: (items: SessionMetaRecord[]) => SessionMetaRecord[]) {
  queryClient.setQueryData<InfiniteSessionData>(QueryKeys.ArchivedChatSessionsList, (old) => {
    if (!old || !old.pages.length) return old
    const allItems = old.pages.flatMap((p) => p.items)
    const updated = updater(allItems)
    const lastPage = old.pages[old.pages.length - 1]
    const delta = updated.length - allItems.length
    return {
      pages: [
        {
          items: updated,
          nextCursor: lastPage.nextCursor !== null ? lastPage.nextCursor + delta : null,
          total: (lastPage.total || 0) + delta,
        },
      ],
      pageParams: [0],
    }
  })
}

// MARK: session operations

// get session
async function _getSessionById(id: string): Promise<Session | null> {
  console.debug('chatStore', 'getSessionById', id)
  const storageKey = StorageKeyGenerator.session(id)
  try {
    const session = await storage.getItem<Session | null>(storageKey, null)
    if (!session) {
      return null
    }
    return migrateSession(session)
  } catch (error) {
    log.error(`Failed to read session from storage (key: ${storageKey}, sessionId: ${id}):`, error)
    // Re-throw to prevent incorrect state
    throw error
  }
}

const getSessionQueryOptions = (sessionId: string) => ({
  queryKey: QueryKeys.ChatSession(sessionId),
  queryFn: () => _getSessionById(sessionId),
  staleTime: Infinity,
})

export async function getSession(sessionId: string) {
  if (deletedSessionIds.has(sessionId)) return null
  return await queryClient.fetchQuery(getSessionQueryOptions(sessionId))
}

export function useSession(sessionId: string | null) {
  const { data: session, ...rest } = useQuery({
    ...getSessionQueryOptions(sessionId!),
    enabled: !!sessionId,
  })
  return { session, ...rest }
}

function _setSessionCache(
  sessionId: string,
  updated: Session | null,
  options?: { preserveCachedGeneratingMessages?: boolean }
) {
  // 1. update session cache 2. session settings do not use cache now
  if (!options?.preserveCachedGeneratingMessages || !updated) {
    queryClient.setQueryData(QueryKeys.ChatSession(sessionId), updated)
    return
  }
  queryClient.setQueryData(QueryKeys.ChatSession(sessionId), (cached: Session | null | undefined) =>
    mergeCachedGeneratingMessages(updated, cached)
  )
}

async function runInChunks<T>(items: T[], chunkSize: number, worker: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += chunkSize) {
    await Promise.all(items.slice(i, i + chunkSize).map((item) => worker(item)))
  }
}

function getSessionMetaForStorage(session: Session): SessionMeta {
  return {
    ...getSessionMeta(session),
    status: session.status,
    lastActivityAt: session.lastActivityAt,
    archiveSource: session.archiveSource,
  }
}

function hasGeneratingMessages(session: Session): boolean {
  if (session.messages.some((message) => message.generating === true)) return true
  if (session.threads?.some((thread) => thread.messages.some((message) => message.generating === true))) return true
  return Object.values(session.messageForksHash ?? {}).some((fork) =>
    fork.lists.some((list) => list.messages.some((message) => message.generating === true))
  )
}

function isArchivedSession(session: Pick<Session, 'status' | 'archivedAt'>): boolean {
  return session.status === 'archived' || session.archivedAt !== undefined
}

// create session
export async function createSession(newSession: Omit<Session, 'id'>, previousId?: string) {
  console.debug('chatStore', 'createSession', newSession)
  const { chat: lastUsedChatModel, picture: lastUsedPictureModel } = lastUsedModelStore.getState()
  const now = Date.now()
  const session: Session = {
    ...newSession,
    id: uuidv4(),
    status: 'active',
    lastActivityAt: newSession.lastActivityAt ?? now,
    archivedAt: undefined,
    archiveSource: undefined,
    activeThreadId: newSession.activeThreadId,
    settings: {
      ...(newSession.type === 'picture' ? lastUsedPictureModel : lastUsedChatModel),
      ...newSession.settings,
    },
  }
  await storage.setItemNow(StorageKeyGenerator.session(session.id), session)

  const metaStorage = await getMetaStorage()
  let sortOrder = Date.now()
  if (previousId) {
    const currentList = getCachedSessionsMeta()
    const prevIndex = currentList.findIndex((s) => s.id === previousId)
    if (prevIndex >= 0) {
      const prevSortOrder = currentList[prevIndex].sortOrder
      const nextSortOrder =
        prevIndex + 1 < currentList.length ? currentList[prevIndex + 1].sortOrder : prevSortOrder - 2000
      sortOrder = (prevSortOrder + nextSortOrder) / 2
    }
  }

  const record: SessionMetaRecord = {
    ...getSessionMetaForStorage(session),
    sortOrder,
    createdAt: now,
  }
  await metaStorage.create(record)
  _setSessionCache(session.id, session)

  if (!record.hidden) {
    updateSessionListData((items) => sortSessionRecords([...items, record]))
  }

  return session
}

const sessionUpdateQueues: Record<string, UpdateQueue<Session>> = {}
const sessionRetentionLocks = new Map<string, Promise<void>>()
// Prevent delayed streaming writes from recreating a session after permanent deletion starts.
const deletedSessionIds = new Set<string>()

async function withSessionRetentionLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
  const previous = sessionRetentionLocks.get(sessionId) ?? Promise.resolve()
  let release = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const current = previous.then(() => pending)
  sessionRetentionLocks.set(sessionId, current)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (sessionRetentionLocks.get(sessionId) === current) {
      sessionRetentionLocks.delete(sessionId)
    }
  }
}

export async function updateSessionWithMessages(
  sessionId: string,
  updater: Updater<Session>,
  options?: { preserveCachedGeneratingMessages?: boolean }
) {
  if (deletedSessionIds.has(sessionId)) {
    throw new Error(`Session ${sessionId} has been deleted`)
  }
  if (!sessionUpdateQueues[sessionId]) {
    // do not use await here to avoid data race
    sessionUpdateQueues[sessionId] = new UpdateQueue<Session>(
      () => getSession(sessionId),
      async (session) => {
        if (session) {
          if (deletedSessionIds.has(sessionId)) {
            await storage.removeItem(StorageKeyGenerator.session(sessionId))
            return
          }
          console.debug('chatStore', 'persist session', sessionId)
          await storage.setItemNow(StorageKeyGenerator.session(sessionId), session)
          if (deletedSessionIds.has(sessionId)) {
            await storage.removeItem(StorageKeyGenerator.session(sessionId))
          }
        }
      }
    )
  }
  let needUpdateSessionList = true
  const updated = await sessionUpdateQueues[sessionId].set((prev) => {
    if (deletedSessionIds.has(sessionId)) {
      throw new Error(`Session ${sessionId} has been deleted`)
    }
    if (!prev) {
      throw new Error(`Session ${sessionId} not found`)
    }
    let next: Session
    if (typeof updater === 'function') {
      next = updater(prev)
    } else {
      if (isEmpty(getSessionMeta(updater as SessionMeta))) {
        needUpdateSessionList = false
      }
      next = { ...prev, ...updater }
    }
    const messageDataChanged =
      next.messages !== prev.messages ||
      next.threads !== prev.threads ||
      next.messageForksHash !== prev.messageForksHash ||
      next.compactionPoints !== prev.compactionPoints
    return messageDataChanged ? { ...next, lastActivityAt: Date.now() } : next
  })
  if (deletedSessionIds.has(sessionId)) {
    await storage.removeItem(StorageKeyGenerator.session(sessionId))
    throw new Error(`Session ${sessionId} has been deleted`)
  }
  if (needUpdateSessionList) {
    const newMeta = getSessionMetaForStorage(updated)
    const metaStorage = await getMetaStorage()
    if (deletedSessionIds.has(sessionId)) {
      await storage.removeItem(StorageKeyGenerator.session(sessionId))
      await metaStorage.delete(sessionId)
      throw new Error(`Session ${sessionId} has been deleted`)
    }
    await metaStorage.update(sessionId, newMeta)
    if (deletedSessionIds.has(sessionId)) {
      await storage.removeItem(StorageKeyGenerator.session(sessionId))
      await metaStorage.delete(sessionId)
      throw new Error(`Session ${sessionId} has been deleted`)
    }
    updateSessionListData((items) =>
      sortSessionRecords(items.map((s) => (s.id === sessionId ? { ...s, ...newMeta } : s)))
    )
  }
  _setSessionCache(sessionId, updated, options)
  return updated
}

// 这里只能修改messages之外的字段
export async function updateSession(sessionId: string, updater: Updater<SessionMetadataUpdate>) {
  return await updateSessionWithMessages(
    sessionId,
    (session) => {
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }
      const updated = typeof updater === 'function' ? updater(getSessionMetadataSnapshot(session)) : updater
      assertNoMessageDataUpdate(updated)
      return {
        ...session,
        ...updated,
      }
    },
    { preserveCachedGeneratingMessages: true }
  )
}

// only update session cache without touching storage, for performance sensitive usage
export async function updateSessionCache(sessionId: string, updater: Updater<Session>) {
  const session = await getSession(sessionId)
  if (!session) {
    throw new Error(`Session ${sessionId} not found`)
  }
  updateSessionCacheSync(sessionId, updater)
}

export function updateSessionCacheSync(sessionId: string, updater: Updater<Session>) {
  queryClient.setQueryData(QueryKeys.ChatSession(sessionId), (old: Session | undefined | null) => {
    if (!old) {
      return old
    }
    if (typeof updater === 'function') {
      return updater(old)
    } else {
      return { ...old, ...updater }
    }
  })
}

/**
 * If a session has persisted download artifacts, ask the user to confirm deletion, since
 * those downloadable files will be permanently removed along with the session. Returns
 * false if the user cancels; true otherwise (including when there are no artifacts).
 */
export async function confirmSessionDeletion(id: string): Promise<boolean> {
  if (platform.type !== 'desktop' || !platform.sandboxHasArtifacts) return true
  try {
    const { has } = await platform.sandboxHasArtifacts({ sessionId: id })
    if (!has) return true
    const confirmed = await NiceModal.show('confirm', {
      title: i18n.t('Delete this chat?'),
      message: i18n.t(
        'This chat has downloadable files generated in the sandbox. Deleting it will permanently remove those files.'
      ),
      confirmText: i18n.t('Delete'),
      danger: true,
    })
    return confirmed === true
  } catch {
    return true
  }
}

async function cleanupSessionAttachmentRagEntries(ids: string[], operation: string) {
  if (platform.type !== 'desktop') {
    return
  }
  await runInChunks(ids, 10, async (id) => {
    try {
      await platform.getSessionAttachmentRagController().deleteSessionAttachments(id)
    } catch (error) {
      console.warn(`Failed to cleanup session attachment RAG entries for ${operation}:`, error)
    }
  })
}

function cleanupDeletedSessionRuntimeState(id: string) {
  _setSessionCache(id, null)
  uiStore.getState().clearSessionWebBrowsing(id)
  uiStore.getState().removeSessionKnowledgeBase(id)
  uiStore.getState().clearSessionAgentMode(id)
  cleanupSessionAtomCache(id)
  clearScrollPositionCache(id)
  delete sessionUpdateQueues[id]
  // Remove persisted download artifacts so deleted session references do not leak files on disk.
  platform.sandboxReset?.({ sessionId: id }).catch(() => {})
  platform.sandboxRemoveArtifacts?.({ sessionId: id }).catch(() => {})
}

async function deleteSessionUnsafe(id: string) {
  console.debug('chatStore', 'deleteSession', id)
  await cleanupSessionAttachmentRagEntries([id], 'session deletion')
  const storageKey = StorageKeyGenerator.session(id)
  const metaStorage = await getMetaStorage()
  await deleteSessionStorageRecords({
    readSession: () => storage.getItem<Session | null>(storageKey, null),
    readMeta: () => metaStorage.getById(id),
    removeSession: () => storage.removeItem(storageKey),
    removeMeta: () => metaStorage.delete(id),
    restoreSession: (session) => storage.setItemNow(storageKey, session),
    restoreMeta: async (meta) => {
      if (!(await metaStorage.getById(id))) await metaStorage.create(meta)
    },
    onRollbackFailure: (rollbackError) => {
      log.error(`Failed to compensate session deletion (sessionId: ${id}):`, rollbackError)
    },
  })
  updateSessionListData((items) => items.filter((session) => session.id !== id))
  updateArchivedSessionListData((items) => items.filter((session) => session.id !== id))
  cleanupDeletedSessionRuntimeState(id)
}

type DeleteSessionOptions = {
  cascadeOwnedSideChats?: boolean
}

type OwnedSideChatLink = {
  queueItemId: string
  sessionId: string
  threadId?: string
  createdAt: number
  updatedAt: number
}

function getOwnedSideChatLinks(session: Session, threadId?: string): Array<[string, OwnedSideChatLink]> {
  const state = session.followUpState
  if (!state?.sideChats) return []
  if (!threadId) return Object.entries(state.sideChats)

  const scopedQueueItemIds = new Set(state.scopes[threadId]?.items.map((item) => item.id) ?? [])
  return Object.entries(state.sideChats).filter(
    ([queueItemId, link]) => link.threadId === threadId || scopedQueueItemIds.has(queueItemId)
  )
}

async function getValidOwnedSideChatSessionIds(session: Session, threadId?: string): Promise<string[]> {
  const ids = [...new Set(getOwnedSideChatLinks(session, threadId).map(([, link]) => link.sessionId))]
  const valid: string[] = []
  for (const id of ids) {
    if (!id || id === session.id) continue
    const target = await getSession(id)
    if (target?.hidden === true && target.type === 'chat') valid.push(id)
  }
  return valid
}

async function updateOwnedSideChatLinks(
  sourceSessionId: string,
  updater: (links: Record<string, OwnedSideChatLink>) => Record<string, OwnedSideChatLink>
) {
  await updateSession(sourceSessionId, (source) => {
    if (!source) throw new Error(`Session ${sourceSessionId} not found`)
    const state = source.followUpState
    if (!state) return source
    const sideChats = updater(state.sideChats ?? {})
    return {
      ...source,
      followUpState: {
        ...state,
        sideChats: Object.keys(sideChats).length > 0 ? sideChats : undefined,
      },
    }
  })
}

/**
 * Permanently removes direct hidden Side Chats owned by a source session or one of its threads.
 * The source link is removed before deletion and restored if deletion fails, so a partial failure
 * remains visible to the next cleanup attempt instead of reporting success with a stale link.
 */
export async function deleteOwnedSideChatSessions(sourceSessionId: string, threadId?: string): Promise<string[]> {
  const source = await getSession(sourceSessionId)
  if (!source) return []

  const selectedLinks = getOwnedSideChatLinks(source, threadId)
  if (selectedLinks.length === 0) return []

  const selectedKeys = new Set(selectedLinks.map(([queueItemId]) => queueItemId))
  const allLinks = Object.entries(source.followUpState?.sideChats ?? {})
  const candidateSessionIds = [
    ...new Set(
      selectedLinks
        .map(([, link]) => link.sessionId)
        .filter((sideChatSessionId) => sideChatSessionId && sideChatSessionId !== sourceSessionId)
    ),
  ]
  const deletedIds: string[] = []

  for (const sideChatSessionId of candidateSessionIds) {
    const selectedForTarget = selectedLinks.filter(([, link]) => link.sessionId === sideChatSessionId)
    const targetHasUnselectedOwner = allLinks.some(
      ([queueItemId, link]) => link.sessionId === sideChatSessionId && !selectedKeys.has(queueItemId)
    )
    if (targetHasUnselectedOwner) continue

    const target = await getSession(sideChatSessionId)
    if (!target || target.hidden !== true || target.type !== 'chat') continue

    const removedLinks = Object.fromEntries(selectedForTarget)
    await updateOwnedSideChatLinks(sourceSessionId, (links) =>
      Object.fromEntries(Object.entries(links).filter(([queueItemId]) => !(queueItemId in removedLinks)))
    )
    try {
      await deleteSession(sideChatSessionId, { cascadeOwnedSideChats: false })
      deletedIds.push(sideChatSessionId)
    } catch (error) {
      try {
        await updateOwnedSideChatLinks(sourceSessionId, (links) => ({ ...removedLinks, ...links }))
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `Failed to delete Side Chat ${sideChatSessionId} and restore its source link`
        )
      }
      throw error
    }
  }

  return deletedIds
}

export async function deleteSession(id: string, options: DeleteSessionOptions = {}) {
  const ownedSideChatIds = await withSessionRetentionLock(id, async () => {
    if (deletedSessionIds.has(id)) return
    const source = options.cascadeOwnedSideChats === false ? undefined : await getSession(id)
    const childIds = source ? await getValidOwnedSideChatSessionIds(source) : []
    deletedSessionIds.add(id)
    try {
      await deleteSessionUnsafe(id)
    } catch (error) {
      deletedSessionIds.delete(id)
      throw error
    }
    return childIds
  })
  for (const sideChatId of ownedSideChatIds ?? []) {
    await deleteSession(sideChatId, { cascadeOwnedSideChats: false })
  }
  // Keep the tombstone for the remainder of this renderer lifetime. A deleted id is never reused.
}

export class SessionArchiveBlockedError extends Error {
  constructor(
    message: string,
    readonly reason: 'generating' | 'starred' | 'current'
  ) {
    super(message)
    this.name = 'SessionArchiveBlockedError'
  }
}

type AutomaticArchiveOptions = {
  currentSessionId?: string | null
  now?: number
  signal?: AbortSignal
}

async function archiveSessionBySource(
  id: string,
  source: SessionArchiveSource,
  options: AutomaticArchiveOptions = {}
): Promise<boolean> {
  return await withSessionRetentionLock(id, async () => {
    if (options.signal?.aborted) return false
    let changed = false
    await updateSessionWithMessages(id, (session) => {
      if (!session) throw new Error(`Session ${id} not found`)
      if (isArchivedSession(session)) return session
      if (hasGeneratingMessages(session)) {
        if (source === 'manual') {
          throw new SessionArchiveBlockedError(
            'A session cannot be archived while it is generating a response.',
            'generating'
          )
        }
        return session
      }
      if (source === 'automatic' && session.starred) return session
      if (
        source === 'automatic' &&
        (options.currentSessionId === id ||
          getDefaultStore().get(currentSessionIdAtom) === id ||
          isSessionGenerationActive(id))
      ) {
        return session
      }
      changed = true
      return {
        ...session,
        status: 'archived',
        hidden: true,
        archivedAt: options.now ?? Date.now(),
        archiveSource: source,
      }
    })
    return changed
  })
}

export async function archiveSession(id: string) {
  const changed = await archiveSessionBySource(id, 'manual')
  if (changed) {
    await refreshArchivedSessionListCache()
  }
}

// 这里刻意逐个走 updateSession，保证完整 session 存储和 meta 存储一致。
// 该实现不针对超大批量归档做性能优化。
export async function archiveSessions(ids: string[]) {
  const uniqueIds = [...new Set(ids)]
  if (uniqueIds.length === 0) return

  const missingSessionIds: string[] = []
  await runInChunks(uniqueIds, 20, async (id) => {
    try {
      await archiveSessionBySource(id, 'manual')
    } catch (error) {
      if (error instanceof Error && error.message === `Session ${id} not found`) {
        missingSessionIds.push(id)
        return
      }
      throw error
    }
  })

  if (missingSessionIds.length > 0) {
    await cleanupSessionAttachmentRagEntries(missingSessionIds, 'stale session meta cleanup')
    const metaStorage = await getMetaStorage()
    await metaStorage.deleteMany(missingSessionIds)
    for (const id of missingSessionIds) {
      cleanupDeletedSessionRuntimeState(id)
    }
  }

  await refreshSessionListCache()
  await refreshArchivedSessionListCache()
}

export async function archiveSessionsAutomatically(
  ids: string[],
  options: AutomaticArchiveOptions = {}
): Promise<string[]> {
  const archivedIds: string[] = []
  for (const id of [...new Set(ids)]) {
    if (options.signal?.aborted) break
    try {
      if (await archiveSessionBySource(id, 'automatic', options)) {
        archivedIds.push(id)
      }
    } catch (error) {
      if (!(error instanceof Error && error.message === `Session ${id} not found`)) {
        throw error
      }
    }
  }
  if (archivedIds.length > 0) {
    await refreshSessionListCache()
    await refreshArchivedSessionListCache()
  }
  return archivedIds
}

export async function restoreSession(id: string) {
  await withSessionRetentionLock(id, async () => {
    await updateSession(id, {
      status: 'active',
      hidden: false,
      archivedAt: undefined,
      archiveSource: undefined,
    })
  })
  await refreshSessionListCache()
  updateArchivedSessionListData((items) => items.filter((session) => session.id !== id))
}

export async function deleteArchivedSessions(ids: string[], signal?: AbortSignal): Promise<string[]> {
  const deletedIds: string[] = []
  for (const id of [...new Set(ids)]) {
    if (signal?.aborted) break
    const ownedSideChatIds = await withSessionRetentionLock(id, async () => {
      if (deletedSessionIds.has(id)) {
        deletedIds.push(id)
        return
      }
      try {
        const session = await getSession(id)
        if (!session) {
          deletedSessionIds.add(id)
          await deleteSessionUnsafe(id)
          deletedIds.push(id)
          return []
        }
        if (
          !isArchivedSession(session) ||
          session.starred ||
          getDefaultStore().get(currentSessionIdAtom) === id ||
          hasGeneratingMessages(session) ||
          isSessionGenerationActive(id)
        ) {
          return []
        }
        const childIds = await getValidOwnedSideChatSessionIds(session)
        deletedSessionIds.add(id)
        await deleteSessionUnsafe(id)
        deletedIds.push(id)
        return childIds
      } catch (error) {
        deletedSessionIds.delete(id)
        throw error
      }
    })
    for (const sideChatId of ownedSideChatIds ?? []) {
      await deleteSession(sideChatId, { cascadeOwnedSideChats: false })
    }
  }
  return deletedIds
}

export async function deleteSessions(ids: string[]) {
  const uniqueIds = [...new Set(ids)]
  if (uniqueIds.length === 0) return

  const ownedSideChatIds = new Set<string>()
  for (const id of uniqueIds) {
    const source = await getSession(id)
    for (const sideChatId of source ? await getValidOwnedSideChatSessionIds(source) : []) {
      ownedSideChatIds.add(sideChatId)
    }
  }
  const directIds = uniqueIds.filter((id) => !deletedSessionIds.has(id))
  if (directIds.length === 0) return

  for (const id of directIds) deletedSessionIds.add(id)
  try {
    await cleanupSessionAttachmentRagEntries(directIds, 'session deletion')

    await runInChunks(directIds, 20, async (id) => {
      await storage.removeItem(StorageKeyGenerator.session(id))
    })

    const metaStorage = await getMetaStorage()
    await metaStorage.deleteMany(directIds)
    await refreshSessionListCache()
    updateArchivedSessionListData((items) => items.filter((session) => !directIds.includes(session.id)))

    for (const id of directIds) {
      cleanupDeletedSessionRuntimeState(id)
    }
  } catch (error) {
    for (const id of directIds) deletedSessionIds.delete(id)
    throw error
  }
  for (const sideChatId of ownedSideChatIds) {
    if (!directIds.includes(sideChatId)) {
      await deleteSession(sideChatId, { cascadeOwnedSideChats: false })
    }
  }
}

// MARK: session settings operations

function mergeDefaultSessionSettings(session: Session): SessionSettings {
  if (session.type === 'picture') {
    return SessionSettingsSchema.parse({
      ...defaults.pictureSessionSettings(),
      ...session.settings,
    })
  } else {
    return SessionSettingsSchema.parse({
      ...defaults.chatSessionSettings(),
      ...session.settings,
    })
  }
}
// session settings is copied from global settings when session is created, so no need to merge global settings here
export function useSessionSettings(sessionId: string | null) {
  const { session } = useSession(sessionId)
  const globalSettings = useSettingsStore((state) => state)

  const sessionSettings = useMemo(() => {
    if (!session) {
      return SessionSettingsSchema.parse(globalSettings)
    }
    return mergeDefaultSessionSettings(session)
  }, [session, globalSettings])

  return { sessionSettings }
}

export async function getSessionSettings(sessionId: string) {
  const session = await getSession(sessionId)
  if (!session) {
    const globalSettings = settingsStore.getState().getSettings()
    return SessionSettingsSchema.parse(globalSettings)
  }
  return mergeDefaultSessionSettings(session)
}

// MARK: message operations

// list messages
export async function listMessages(sessionId?: string | null): Promise<Message[]> {
  console.debug('chatStore', 'listMessages', sessionId)
  if (!sessionId) {
    return []
  }
  const session = await getSession(sessionId)
  if (!session) {
    return []
  }
  return session.messages
}

export async function insertMessage(sessionId: string, message: Message, previousId?: string, threadId?: string) {
  await updateSessionWithMessages(sessionId, (session) => {
    if (!session) {
      throw new Error(`session ${sessionId} not found`)
    }

    if (previousId) {
      // try to find insert position in message list
      let previousIndex = session.messages.findIndex((m) => m.id === previousId)

      if (previousIndex >= 0) {
        return {
          ...session,
          messages: [
            ...session.messages.slice(0, previousIndex + 1),
            message,
            ...session.messages.slice(previousIndex + 1),
          ],
        } satisfies Session
      }

      // try to find insert position in threads
      if (session.threads) {
        for (const thread of session.threads) {
          previousIndex = thread.messages.findIndex((m) => m.id === previousId)
          if (previousIndex >= 0) {
            return {
              ...session,
              threads: session.threads.map((th) => {
                if (th.id === thread.id) {
                  return {
                    ...thread,
                    messages: [
                      ...thread.messages.slice(0, previousIndex + 1),
                      message,
                      ...thread.messages.slice(previousIndex + 1),
                    ],
                  }
                }
                return th
              }),
            } satisfies Session
          }
        }
      }
    }
    if (threadId) {
      const threadExists = session.threads?.some((thread) => thread.id === threadId)
      if (threadExists) {
        return {
          ...session,
          threads: session.threads?.map((thread) =>
            thread.id === threadId ? { ...thread, messages: [...thread.messages, message] } : thread
          ),
        } satisfies Session
      }
    }
    // no previous message, insert to tail of current thread
    return {
      ...session,
      messages: [...session.messages, message],
    } satisfies Session
  })
}

export async function updateMessageCache(sessionId: string, messageId: string, updater: Updater<Message>) {
  return await updateMessage(sessionId, messageId, updater, true)
}

export async function updateMessages(sessionId: string, updater: Updater<Message[]>) {
  return await updateSessionWithMessages(sessionId, (session) => {
    if (!session) {
      throw new Error(`session ${sessionId} not found`)
    }
    const updated = compact(typeof updater === 'function' ? updater(session.messages) : updater)
    return {
      ...session,
      messages: updated,
    }
  })
}

export async function updateMessage(
  sessionId: string,
  messageId: string,
  updater: Updater<Message>,
  onlyUpdateCache?: boolean
) {
  const updateFn = onlyUpdateCache ? updateSessionCache : updateSessionWithMessages

  await updateFn(sessionId, (session) => {
    if (!session) {
      throw new Error(`session ${sessionId} not found`)
    }

    const updateMessages = (messages: Message[]) => {
      return messages.map((m) => {
        if (m.id !== messageId) {
          return m
        }
        const updated = typeof updater === 'function' ? updater(m) : updater
        return {
          ...m,
          ...updated,
        } satisfies Message
      })
    }
    const message = session.messages.find((m) => m.id === messageId)
    if (message) {
      return {
        ...session,
        messages: updateMessages(session.messages),
      }
    }

    // try find message in threads
    if (session.threads) {
      for (const thread of session.threads) {
        const message = thread.messages.find((m) => m.id === messageId)
        if (message) {
          return {
            ...session,
            threads: session.threads.map((th) => {
              if (th.id !== thread.id) {
                return th
              }
              return {
                ...th,
                messages: updateMessages(th.messages),
              }
            }),
          } satisfies Session
        }
      }
    }

    return session
  })
}

export async function removeMessage(sessionId: string, messageId: string) {
  return await updateSessionWithMessages(sessionId, (session) => {
    if (!session) {
      throw new Error(`session ${sessionId} not found`)
    }

    const messageToDelete = session.messages.find((m) => m.id === messageId)
    const isSummaryMessage = messageToDelete?.isSummary === true

    const newMessages = session.messages.filter((m) => m.id !== messageId)
    const newThreads = session.threads?.map((thread) => ({
      ...thread,
      messages: thread.messages.filter((m) => m.id !== messageId),
      compactionPoints: isSummaryMessage
        ? thread.compactionPoints?.filter((cp) => cp.summaryMessageId !== messageId)
        : thread.compactionPoints,
    }))

    const newCompactionPoints = isSummaryMessage
      ? session.compactionPoints?.filter((cp) => cp.summaryMessageId !== messageId)
      : session.compactionPoints

    // Clean up empty fork branches after message removal and auto-switch if needed
    const { messages: finalMessages, messageForksHash: newMessageForksHash } = cleanupEmptyForkBranches(
      session.messageForksHash,
      newMessages,
      newThreads
    )

    return {
      ...session,
      messages: finalMessages,
      threads: newThreads,
      messageForksHash: newMessageForksHash,
      compactionPoints: newCompactionPoints,
    }
  })
}

/**
 * Clean up empty fork branches after message removal.
 * If the current branch (messages after forkMessageId) is empty, remove it from the fork
 * and automatically switch to another branch by loading its messages.
 */
function cleanupEmptyForkBranches(
  messageForksHash: Session['messageForksHash'],
  messages: Message[],
  threads: Session['threads']
): { messages: Message[]; messageForksHash: Session['messageForksHash'] } {
  if (!messageForksHash) {
    return { messages, messageForksHash }
  }

  let resultHash: Session['messageForksHash'] = messageForksHash
  let resultMessages = messages

  for (const [forkMessageId, forkEntry] of Object.entries(messageForksHash)) {
    // Check if fork point exists in messages
    const forkIndexInMessages = resultMessages.findIndex((m) => m.id === forkMessageId)

    if (forkIndexInMessages >= 0) {
      // Fork is in main messages - check if tail is empty fork point 是 user msg，之后的 bot msg 是具体的分叉
      // 当用户这条消息(fork point)是最后一条消息，后面没了 bot msg，则当前分支是空的
      const currentBranchIsEmpty = forkIndexInMessages === resultMessages.length - 1

      if (currentBranchIsEmpty) {
        // Remove current branch from lists
        const remainingLists = forkEntry.lists.filter((_, index) => index !== forkEntry.position)

        if (remainingLists.length <= 1) {
          // Only one or zero branches left - remove the fork and load remaining messages
          const remainingBranchMessages = remainingLists[0]?.messages ?? []
          // Append remaining branch messages after the fork point
          resultMessages = resultMessages.slice(0, forkIndexInMessages + 1).concat(remainingBranchMessages)
          // Remove this fork from hash
          const { [forkMessageId]: _removed, ...rest } = resultHash ?? {}
          resultHash = Object.keys(rest).length ? rest : undefined
        } else {
          // Multiple branches remain - switch to nearest position and load its messages
          const newPosition = Math.min(forkEntry.position, remainingLists.length - 1)
          const newBranchMessages = remainingLists[newPosition]?.messages ?? []

          // Load the new branch's messages
          resultMessages = resultMessages.slice(0, forkIndexInMessages + 1).concat(newBranchMessages)

          // Clear the messages from the loaded branch (since they're now in main messages)
          const updatedLists = remainingLists.map((list, index) =>
            index === newPosition ? { ...list, messages: [] } : list
          )

          resultHash = {
            ...resultHash,
            [forkMessageId]: {
              ...forkEntry,
              position: newPosition,
              lists: updatedLists,
            },
          }
        }
      }
    } else if (threads) {
      // Fork might be in threads - just update the hash without modifying main messages
      for (const thread of threads) {
        const forkIndexInThread = thread.messages.findIndex((m) => m.id === forkMessageId)
        if (forkIndexInThread >= 0) {
          const currentBranchIsEmpty = forkIndexInThread === thread.messages.length - 1
          if (currentBranchIsEmpty) {
            const remainingLists = forkEntry.lists.filter((_, index) => index !== forkEntry.position)
            if (remainingLists.length <= 1) {
              const { [forkMessageId]: _removed, ...rest } = resultHash ?? {}
              resultHash = Object.keys(rest).length ? rest : undefined
            } else {
              const newPosition = Math.min(forkEntry.position, remainingLists.length - 1)
              resultHash = {
                ...resultHash,
                [forkMessageId]: {
                  ...forkEntry,
                  position: newPosition,
                  lists: remainingLists,
                },
              }
            }
          }
          break
        }
      }
    }
  }

  return { messages: resultMessages, messageForksHash: resultHash }
}

// MARK: data recovery operations

/**
 * Recover session list by scanning all session: prefixed keys in storage
 * This will clear the current session list and rebuild it from all found sessions
 */
export async function recoverSessionList() {
  console.debug('chatStore', 'recoverSessionList')

  // Get all storage keys
  const allKeys = await storage.getAllKeys()

  // Filter keys that match the session: prefix
  const sessionKeys = allKeys.filter((key) => key.startsWith('session:'))

  // Fetch all sessions with their first message timestamp
  const sessionsWithTimestamp: Array<{ meta: SessionMeta; timestamp: number }> = []
  const failedKeys: string[] = []

  for (const key of sessionKeys) {
    try {
      const session = await storage.getItem<Session | null>(key, null)
      // Skip junk session entries (e.g. empty `{}` objects or `session:undefined`)
      // that have no id — they cannot become valid meta records.
      if (session && session.id) {
        const migratedSession = migrateSession(session)
        const firstMessageTimestamp = migratedSession.messages[0]?.timestamp || 0
        sessionsWithTimestamp.push({
          meta: getSessionMetaForStorage(migratedSession),
          timestamp: firstMessageTimestamp,
        })
      }
    } catch (error) {
      // Handle cases where IndexedDB fails to read large values
      // This can happen with "DataError: Failed to read large IndexedDB value" in some browsers
      console.error(`Failed to read session "${key}":`, error)
      failedKeys.push(key)
    }
  }

  if (failedKeys.length > 0) {
    console.warn(`chatStore: Failed to recover ${failedKeys.length} sessions due to read errors`)
  }

  // Sort by first message timestamp (older first)
  sessionsWithTimestamp.sort((a, b) => a.timestamp - b.timestamp)

  // Build SessionMetaRecord entries with sortOrder based on message timestamp
  const now = Date.now()
  const records: SessionMetaRecord[] = sessionsWithTimestamp.map((item, i) => ({
    ...item.meta,
    sortOrder: item.timestamp || now - (sessionsWithTimestamp.length - i) * 1000,
    createdAt: item.timestamp || now - (sessionsWithTimestamp.length - i) * 1000,
  }))

  // Write to new DB (clear first to remove orphaned records)
  const metaStorage = await getMetaStorage()
  await metaStorage.clear()
  await metaStorage.createMany(records)
  await refreshSessionListCache()

  console.debug('chatStore', 'recoverSessionList', `Recovered ${records.length} sessions, ${failedKeys.length} failed`)

  return { recovered: records.length, failed: failedKeys.length }
}
