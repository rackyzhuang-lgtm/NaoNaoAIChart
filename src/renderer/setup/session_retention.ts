import {
  runSessionRetentionScan,
  type SessionRetentionScanReason,
  type SessionRetentionScanResult,
} from '@/services/session-retention'
import { settingsStore } from '@/stores/settingsStore'

export const SESSION_RETENTION_SCAN_INTERVAL_MS = 60 * 60 * 1000

type SessionRetentionSchedulerOptions = {
  intervalMs?: number
  runScan?: (options: { reason: SessionRetentionScanReason }) => Promise<SessionRetentionScanResult>
  windowTarget?: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'>
  documentTarget?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>
  isEnabled?: () => boolean
}

export function createSessionRetentionScheduler(options: SessionRetentionSchedulerOptions = {}) {
  const intervalMs = options.intervalMs ?? SESSION_RETENTION_SCAN_INTERVAL_MS
  const runScan = options.runScan ?? runSessionRetentionScan
  const windowTarget = options.windowTarget ?? (typeof window === 'undefined' ? undefined : window)
  const documentTarget = options.documentTarget ?? (typeof document === 'undefined' ? undefined : document)
  const isEnabled = options.isEnabled ?? (() => settingsStore.getState().getSettings().sessionRetention.enabled)
  let intervalId: number | undefined
  let started = false

  const run = async (reason: SessionRetentionScanReason) => {
    if (!isEnabled()) return null
    try {
      return await runScan({ reason })
    } catch (error) {
      console.warn(`[SESSION_RETENTION] ${reason} scan failed`, error)
      return null
    }
  }
  const onFocus = () => void run('focus')
  const onVisibilityChange = () => {
    if (documentTarget?.visibilityState === 'visible') void run('focus')
  }

  return {
    start() {
      if (started) return
      started = true
      void run('startup')
      if (windowTarget) {
        intervalId = windowTarget.setInterval(() => void run('interval'), intervalMs)
        windowTarget.addEventListener('focus', onFocus)
      }
      documentTarget?.addEventListener('visibilitychange', onVisibilityChange)
    },
    runNow() {
      return run('manual')
    },
    dispose() {
      if (!started) return
      started = false
      if (intervalId !== undefined) windowTarget?.clearInterval(intervalId)
      intervalId = undefined
      windowTarget?.removeEventListener('focus', onFocus)
      documentTarget?.removeEventListener('visibilitychange', onVisibilityChange)
    },
  }
}

let scheduler: ReturnType<typeof createSessionRetentionScheduler> | null = null

export function initSessionRetentionScheduler() {
  if (!scheduler) {
    scheduler = createSessionRetentionScheduler()
    scheduler.start()
  }
  return scheduler
}
