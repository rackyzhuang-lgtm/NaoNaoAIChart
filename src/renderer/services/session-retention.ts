import type { Session, SessionMetaRecord, SessionRetentionSettings } from '@shared/types'
import { getDefaultStore } from 'jotai'
import { currentSessionIdAtom } from '@/stores/atoms'
import { archiveSessionsAutomatically, deleteArchivedSessions, getMetaStorage, getSession } from '@/stores/chatStore'
import { settingsStore } from '@/stores/settingsStore'

const DAY_MS = 24 * 60 * 60 * 1000

export type SessionRetentionScanReason = 'startup' | 'interval' | 'focus' | 'manual'

export type SessionRetentionScanOptions = {
  reason?: SessionRetentionScanReason
  cleanupOnly?: boolean
  now?: number
  signal?: AbortSignal
}

export type SessionRetentionScanResult = {
  reason: SessionRetentionScanReason
  archivedCount: number
  deletedCount: number
  skippedCount: number
  interrupted: boolean
}

export function isArchivedSessionRecord(record: Pick<SessionMetaRecord, 'status' | 'archivedAt'>): boolean {
  return record.status === 'archived' || record.archivedAt !== undefined
}

export function getSessionLastActivityAt(session: Session, fallback: number): number {
  const timestamps: number[] = []
  const collect = (messages: Session['messages']) => {
    for (const message of messages) {
      if (typeof message.timestamp === 'number') timestamps.push(message.timestamp)
      if (typeof message.updatedAt === 'number') timestamps.push(message.updatedAt)
    }
  }
  collect(session.messages)
  for (const thread of session.threads ?? []) collect(thread.messages)
  for (const fork of Object.values(session.messageForksHash ?? {})) {
    for (const list of fork.lists) collect(list.messages)
  }
  return session.lastActivityAt ?? timestamps.reduce((latest, value) => Math.max(latest, value), fallback)
}

function isDue(value: number | undefined, cutoff: number): boolean {
  return value !== undefined && value <= cutoff
}

function sessionHasGeneratingMessages(session: Session): boolean {
  if (session.messages.some((message) => message.generating === true)) return true
  if (session.threads?.some((thread) => thread.messages.some((message) => message.generating === true))) return true
  return Object.values(session.messageForksHash ?? {}).some((fork) =>
    fork.lists.some((list) => list.messages.some((message) => message.generating === true))
  )
}

type SessionRetentionServiceDependencies = {
  listRecords: () => Promise<SessionMetaRecord[]>
  getSession: (id: string) => Promise<Session | null>
  archive: (
    ids: string[],
    options: { currentSessionId?: string | null; now?: number; signal?: AbortSignal }
  ) => Promise<string[]>
  deleteArchived: (ids: string[], signal?: AbortSignal) => Promise<string[]>
  getSettings: () => SessionRetentionSettings
  getCurrentSessionId: () => string | null
}

export function createSessionRetentionService(overrides: Partial<SessionRetentionServiceDependencies> = {}) {
  const dependencies: SessionRetentionServiceDependencies = {
    listRecords: async () => (await getMetaStorage()).getAllIncludingHidden(),
    getSession,
    archive: archiveSessionsAutomatically,
    deleteArchived: deleteArchivedSessions,
    getSettings: () => settingsStore.getState().getSettings().sessionRetention,
    getCurrentSessionId: () => getDefaultStore().get(currentSessionIdAtom),
    ...overrides,
  }

  let activeScan: { key: string; promise: Promise<SessionRetentionScanResult> } | null = null

  async function scan(options: SessionRetentionScanOptions = {}): Promise<SessionRetentionScanResult> {
    const reason = options.reason ?? 'manual'
    const settings = dependencies.getSettings()
    const result: SessionRetentionScanResult = {
      reason,
      archivedCount: 0,
      deletedCount: 0,
      skippedCount: 0,
      interrupted: false,
    }
    if (!settings.enabled) return result

    const now = options.now ?? Date.now()
    const records = await dependencies.listRecords()
    const sessionsById = new Map<string, Session>()
    const archiveIds: string[] = []
    const archiveCutoff = now - settings.archiveAfterDays * DAY_MS
    const currentSessionId = dependencies.getCurrentSessionId()

    if (settings.autoArchiveEnabled && !options.cleanupOnly) {
      for (const record of records) {
        if (options.signal?.aborted) {
          result.interrupted = true
          break
        }
        if (record.hidden || record.starred || isArchivedSessionRecord(record)) continue
        if (record.id === currentSessionId) {
          result.skippedCount += 1
          continue
        }
        const session = await dependencies.getSession(record.id)
        if (!session) {
          result.skippedCount += 1
          continue
        }
        sessionsById.set(record.id, session)
        if (session.starred || isArchivedSessionRecord(session)) continue
        if (sessionHasGeneratingMessages(session)) {
          result.skippedCount += 1
          continue
        }
        const activityAt = getSessionLastActivityAt(session, record.lastActivityAt ?? record.createdAt)
        if (isDue(activityAt, archiveCutoff)) archiveIds.push(record.id)
      }
      const archived = await dependencies.archive(archiveIds, {
        currentSessionId,
        now,
        signal: options.signal,
      })
      result.archivedCount = archived.length
    }

    const shouldDelete = settings.autoDeleteEnabled || options.cleanupOnly
    if (shouldDelete && !options.signal?.aborted) {
      const latestRecords = result.archivedCount > 0 ? await dependencies.listRecords() : records
      const deleteCutoff = now - settings.deleteAfterDays * DAY_MS
      const deleteIds: string[] = []
      for (const record of latestRecords) {
        if (options.signal?.aborted) {
          result.interrupted = true
          break
        }
        if (!isArchivedSessionRecord(record)) continue
        if (record.id === currentSessionId || record.starred) {
          result.skippedCount += 1
          continue
        }
        const session = sessionsById.get(record.id) ?? (await dependencies.getSession(record.id))
        if (!session) {
          result.skippedCount += 1
          continue
        }
        if (sessionHasGeneratingMessages(session)) {
          result.skippedCount += 1
          continue
        }
        const lastActivityAt = getSessionLastActivityAt(session, record.lastActivityAt ?? record.createdAt)
        const basisValue = settings.deleteBasis === 'lastActivityAt' ? lastActivityAt : record.archivedAt
        if (isDue(basisValue, deleteCutoff)) deleteIds.push(record.id)
      }
      result.deletedCount = (await dependencies.deleteArchived(deleteIds, options.signal)).length
    }

    if (options.signal?.aborted) result.interrupted = true
    return result
  }

  async function runSessionRetentionScan(options: SessionRetentionScanOptions = {}) {
    const key = options.cleanupOnly === true ? 'cleanup' : 'scan'
    if (activeScan) {
      if (activeScan.key === key) return await activeScan.promise
      await activeScan.promise
      return await runSessionRetentionScan(options)
    }
    const promise = scan(options)
    activeScan = { key, promise }
    try {
      return await promise
    } finally {
      if (activeScan?.promise === promise) activeScan = null
    }
  }

  return { runSessionRetentionScan }
}

const defaultService = createSessionRetentionService()
export const runSessionRetentionScan = defaultService.runSessionRetentionScan
