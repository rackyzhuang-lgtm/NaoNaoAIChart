// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/session-retention', () => ({
  runSessionRetentionScan: vi.fn(),
}))
vi.mock('@/stores/settingsStore', () => ({
  settingsStore: { getState: () => ({ getSettings: () => ({ sessionRetention: { enabled: false } }) }) },
}))

import { createSessionRetentionScheduler, SESSION_RETENTION_SCAN_INTERVAL_MS } from './session_retention'

afterEach(() => {
  vi.useRealTimers()
})

describe('session retention scheduler', () => {
  it('runs at startup, hourly, and when the app regains focus', async () => {
    vi.useFakeTimers()
    const runScan = vi.fn(async ({ reason }) => ({
      reason,
      archivedCount: 0,
      deletedCount: 0,
      skippedCount: 0,
      interrupted: false,
    }))
    const scheduler = createSessionRetentionScheduler({ runScan, isEnabled: () => true })

    scheduler.start()
    await vi.runAllTicks()
    expect(runScan).toHaveBeenCalledWith({ reason: 'startup' })

    await vi.advanceTimersByTimeAsync(SESSION_RETENTION_SCAN_INTERVAL_MS)
    expect(runScan).toHaveBeenCalledWith({ reason: 'interval' })

    window.dispatchEvent(new Event('focus'))
    await vi.runAllTicks()
    expect(runScan).toHaveBeenCalledWith({ reason: 'focus' })

    scheduler.dispose()
  })

  it('starts only once and removes timers when disposed', async () => {
    vi.useFakeTimers()
    const runScan = vi.fn(async ({ reason }) => ({
      reason,
      archivedCount: 0,
      deletedCount: 0,
      skippedCount: 0,
      interrupted: false,
    }))
    const scheduler = createSessionRetentionScheduler({ runScan, isEnabled: () => true })

    scheduler.start()
    scheduler.start()
    await vi.runAllTicks()
    expect(runScan).toHaveBeenCalledTimes(1)

    scheduler.dispose()
    await vi.advanceTimersByTimeAsync(SESSION_RETENTION_SCAN_INTERVAL_MS)
    expect(runScan).toHaveBeenCalledTimes(1)
  })

  it('does not run storage scans while the master switch is disabled', async () => {
    vi.useFakeTimers()
    const runScan = vi.fn()
    const scheduler = createSessionRetentionScheduler({ runScan, isEnabled: () => false })

    scheduler.start()
    await vi.advanceTimersByTimeAsync(SESSION_RETENTION_SCAN_INTERVAL_MS)
    window.dispatchEvent(new Event('focus'))
    await vi.runAllTicks()

    expect(runScan).not.toHaveBeenCalled()
    scheduler.dispose()
  })
})
