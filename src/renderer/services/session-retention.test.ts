import type { Session, SessionMetaRecord, SessionRetentionSettings } from '@shared/types'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/chatStore', () => ({
  getMetaStorage: vi.fn(),
  getSession: vi.fn(),
  archiveSessionsAutomatically: vi.fn(),
  deleteArchivedSessions: vi.fn(),
}))
vi.mock('@/stores/atoms', () => ({ currentSessionIdAtom: {} }))
vi.mock('@/stores/settingsStore', () => ({ settingsStore: { getState: vi.fn() } }))

import { createSessionRetentionService, getSessionLastActivityAt } from './session-retention'

const DAY_MS = 24 * 60 * 60 * 1000

function makeSettings(overrides: Partial<SessionRetentionSettings> = {}): SessionRetentionSettings {
  return {
    enabled: true,
    autoArchiveEnabled: true,
    archiveAfterDays: 30,
    autoDeleteEnabled: false,
    deleteAfterDays: 30,
    deleteBasis: 'archivedAt',
    ...overrides,
  }
}

function makeSession(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    name: id,
    messages: [],
    ...overrides,
  }
}

function makeRecord(id: string, overrides: Partial<SessionMetaRecord> = {}): SessionMetaRecord {
  return {
    id,
    name: id,
    sortOrder: 1,
    createdAt: 1,
    ...overrides,
  }
}

function createHarness({
  records,
  sessions,
  settings = makeSettings(),
  currentSessionId = null,
}: {
  records: SessionMetaRecord[]
  sessions: Session[]
  settings?: SessionRetentionSettings
  currentSessionId?: string | null
}) {
  const archive = vi.fn(async (ids: string[]) => ids)
  const deleteArchived = vi.fn(async (ids: string[]) => ids)
  const listRecords = vi.fn(async () => records)
  const sessionMap = new Map(sessions.map((session) => [session.id, session]))
  const service = createSessionRetentionService({
    listRecords,
    getSession: async (id) => sessionMap.get(id) ?? null,
    archive,
    deleteArchived,
    getSettings: () => settings,
    getCurrentSessionId: () => currentSessionId,
  })
  return { ...service, archive, deleteArchived, listRecords }
}

describe('session retention service', () => {
  it('derives legacy activity from the newest message timestamp or update timestamp', () => {
    const session = makeSession('legacy', {
      messages: [
        { id: 'a', role: 'user', contentParts: [], timestamp: 100 },
        { id: 'b', role: 'assistant', contentParts: [], timestamp: 200, updatedAt: 300 },
      ],
    })

    expect(getSessionLastActivityAt(session, 50)).toBe(300)
    expect(getSessionLastActivityAt({ ...session, lastActivityAt: 400 }, 50)).toBe(400)
  })

  it('does no storage work while the master feature switch is disabled', async () => {
    const harness = createHarness({
      records: [makeRecord('old')],
      sessions: [makeSession('old')],
      settings: makeSettings({ enabled: false }),
    })

    await expect(harness.runSessionRetentionScan({ reason: 'startup', now: 100 * DAY_MS })).resolves.toMatchObject({
      archivedCount: 0,
      deletedCount: 0,
    })
    expect(harness.listRecords).not.toHaveBeenCalled()
    expect(harness.archive).not.toHaveBeenCalled()
  })

  it('archives only expired active sessions and skips hidden, starred, current, and generating sessions', async () => {
    const now = 100 * DAY_MS
    const records = [
      makeRecord('eligible'),
      makeRecord('recent'),
      makeRecord('hidden', { hidden: true }),
      makeRecord('starred', { starred: true }),
      makeRecord('current'),
      makeRecord('generating'),
      makeRecord('legacy-archived', { archivedAt: now - 60 * DAY_MS }),
    ]
    const sessions = records.map((record) =>
      makeSession(record.id, {
        lastActivityAt: record.id === 'recent' ? now - 2 * DAY_MS : now - 60 * DAY_MS,
        messages:
          record.id === 'generating' ? [{ id: 'answer', role: 'assistant', contentParts: [], generating: true }] : [],
      })
    )
    const harness = createHarness({ records, sessions, currentSessionId: 'current' })

    const result = await harness.runSessionRetentionScan({ reason: 'interval', now })

    expect(harness.archive).toHaveBeenCalledWith(
      ['eligible'],
      expect.objectContaining({ currentSessionId: 'current', now })
    )
    expect(result.archivedCount).toBe(1)
    expect(result.skippedCount).toBe(2)
  })

  it('manual cleanup deletes only expired archived sessions even when automatic deletion is disabled', async () => {
    const now = 100 * DAY_MS
    const records = [
      makeRecord('expired', { status: 'archived', archivedAt: now - 40 * DAY_MS }),
      makeRecord('recent', { status: 'archived', archivedAt: now - 2 * DAY_MS }),
      makeRecord('active'),
    ]
    const sessions = records.map((record) => makeSession(record.id, { lastActivityAt: now - 60 * DAY_MS }))
    const harness = createHarness({ records, sessions })

    const result = await harness.runSessionRetentionScan({ reason: 'manual', cleanupOnly: true, now })

    expect(harness.archive).not.toHaveBeenCalled()
    expect(harness.deleteArchived).toHaveBeenCalledWith(['expired'], undefined)
    expect(result.deletedCount).toBe(1)
  })

  it('supports last activity as the permanent deletion basis', async () => {
    const now = 100 * DAY_MS
    const records = [makeRecord('expired', { status: 'archived', archivedAt: now - DAY_MS })]
    const sessions = [makeSession('expired', { lastActivityAt: now - 60 * DAY_MS })]
    const harness = createHarness({
      records,
      sessions,
      settings: makeSettings({ autoArchiveEnabled: false, autoDeleteEnabled: true, deleteBasis: 'lastActivityAt' }),
    })

    await harness.runSessionRetentionScan({ reason: 'interval', now })

    expect(harness.deleteArchived).toHaveBeenCalledWith(['expired'], undefined)
  })

  it('skips current, starred, and nested generating sessions during automatic deletion', async () => {
    const now = 100 * DAY_MS
    const records = ['eligible', 'current', 'starred', 'thread-generating', 'fork-generating'].map((id) =>
      makeRecord(id, {
        status: 'archived',
        archivedAt: now - 60 * DAY_MS,
        starred: id === 'starred',
      })
    )
    const sessions = records.map((record) =>
      makeSession(record.id, {
        lastActivityAt: now - 60 * DAY_MS,
        starred: record.starred,
        threads:
          record.id === 'thread-generating'
            ? [
                {
                  id: 'thread',
                  name: 'thread',
                  createdAt: 1,
                  messages: [{ id: 'm', role: 'assistant', contentParts: [], generating: true }],
                },
              ]
            : undefined,
        messageForksHash:
          record.id === 'fork-generating'
            ? {
                m: {
                  position: 0,
                  createdAt: 1,
                  lists: [
                    { id: 'list', messages: [{ id: 'f', role: 'assistant', contentParts: [], generating: true }] },
                  ],
                },
              }
            : undefined,
      })
    )
    const harness = createHarness({
      records,
      sessions,
      currentSessionId: 'current',
      settings: makeSettings({ autoArchiveEnabled: false, autoDeleteEnabled: true }),
    })

    await harness.runSessionRetentionScan({ reason: 'interval', now })

    expect(harness.deleteArchived).toHaveBeenCalledWith(['eligible'], undefined)
  })

  it('coalesces overlapping scans so the task is idempotent within one process', async () => {
    let release = () => {}
    const pending = new Promise<SessionMetaRecord[]>((resolve) => {
      release = () => resolve([])
    })
    const listRecords = vi.fn(() => pending)
    const service = createSessionRetentionService({
      listRecords,
      getSession: async () => null,
      archive: async () => [],
      deleteArchived: async () => [],
      getSettings: () => makeSettings(),
      getCurrentSessionId: () => null,
    })

    const first = service.runSessionRetentionScan({ reason: 'startup' })
    const second = service.runSessionRetentionScan({ reason: 'interval' })
    release()
    await Promise.all([first, second])

    expect(listRecords).toHaveBeenCalledTimes(1)
  })

  it('queues manual cleanup behind a different active scan', async () => {
    let release = () => {}
    const firstRead = new Promise<SessionMetaRecord[]>((resolve) => {
      release = () => resolve([])
    })
    const listRecords = vi.fn().mockReturnValueOnce(firstRead).mockResolvedValue([])
    const service = createSessionRetentionService({
      listRecords,
      getSession: async () => null,
      archive: async () => [],
      deleteArchived: async () => [],
      getSettings: () => makeSettings(),
      getCurrentSessionId: () => null,
    })

    const interval = service.runSessionRetentionScan({ reason: 'interval' })
    const cleanup = service.runSessionRetentionScan({ reason: 'manual', cleanupOnly: true })
    release()
    await Promise.all([interval, cleanup])

    expect(listRecords).toHaveBeenCalledTimes(2)
  })
})
