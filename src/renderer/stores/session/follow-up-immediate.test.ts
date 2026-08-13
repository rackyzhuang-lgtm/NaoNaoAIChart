import { describe, expect, it, vi } from 'vitest'
import { sendQueuedFollowUpImmediately } from './follow-up-immediate'

function dependencies(overrides: Partial<Parameters<typeof sendQueuedFollowUpImmediately>[0]> = {}) {
  return {
    confirm: vi.fn().mockResolvedValue(true),
    pauseQueue: vi.fn().mockResolvedValue(undefined),
    isGenerationActive: true,
    cancelGeneration: vi.fn(),
    waitForGenerationStop: vi.fn().mockResolvedValue(true),
    dispatch: vi.fn().mockResolvedValue({ terminal: true }),
    ...overrides,
  }
}

describe('immediate follow-up coordination', () => {
  it('does nothing when the user dismisses confirmation', async () => {
    const deps = dependencies({ confirm: vi.fn().mockResolvedValue(false) })

    await expect(sendQueuedFollowUpImmediately(deps)).resolves.toBe('dismissed')

    expect(deps.pauseQueue).not.toHaveBeenCalled()
    expect(deps.cancelGeneration).not.toHaveBeenCalled()
    expect(deps.dispatch).not.toHaveBeenCalled()
  })

  it('waits for confirmed cancellation before dispatching exactly once', async () => {
    let releaseStop!: (stopped: boolean) => void
    const stop = new Promise<boolean>((resolve) => {
      releaseStop = resolve
    })
    const events: string[] = []
    const deps = dependencies({
      pauseQueue: vi.fn(() => {
        events.push('paused')
        return Promise.resolve()
      }),
      cancelGeneration: vi.fn(() => events.push('cancelled')),
      waitForGenerationStop: vi.fn(() => stop),
      dispatch: vi.fn(() => {
        events.push('dispatched')
        return Promise.resolve({ terminal: true })
      }),
    })

    const pending = sendQueuedFollowUpImmediately(deps)
    await vi.waitFor(() => expect(events).toEqual(['paused', 'cancelled']))
    expect(deps.dispatch).not.toHaveBeenCalled()
    releaseStop(true)

    await expect(pending).resolves.toBe('sent')
    expect(events).toEqual(['paused', 'cancelled', 'dispatched'])
    expect(deps.dispatch).toHaveBeenCalledOnce()
  })

  it('keeps the item queued and sends nothing when cancellation is not confirmed', async () => {
    const deps = dependencies({ waitForGenerationStop: vi.fn().mockResolvedValue(false) })

    await expect(sendQueuedFollowUpImmediately(deps)).resolves.toBe('not-stopped')

    expect(deps.cancelGeneration).toHaveBeenCalledOnce()
    expect(deps.dispatch).not.toHaveBeenCalled()
  })

  it('never dispatches when a generation is active but no cancellable message is available', async () => {
    const deps = dependencies({ cancelGeneration: undefined })

    await expect(sendQueuedFollowUpImmediately(deps)).resolves.toBe('not-stopped')

    expect(deps.waitForGenerationStop).not.toHaveBeenCalled()
    expect(deps.dispatch).not.toHaveBeenCalled()
  })
})
