import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetSessionGenerationLocksForTests, withSessionGenerationLock } from './generation-lock'

describe('session generation lock', () => {
  afterEach(() => {
    resetSessionGenerationLocksForTests()
  })

  it('serializes work for the same session', async () => {
    let releaseFirst = () => {}
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const events: string[] = []

    const first = withSessionGenerationLock('session-1', async () => {
      events.push('first:start')
      await firstGate
      events.push('first:end')
    })
    const secondTask = vi.fn(() => {
      events.push('second')
      return Promise.resolve()
    })
    const second = withSessionGenerationLock('session-1', secondTask)

    await Promise.resolve()
    expect(secondTask).not.toHaveBeenCalled()
    releaseFirst()
    await Promise.all([first, second])
    expect(events).toEqual(['first:start', 'first:end', 'second'])
  })

  it('continues the queue after a task fails', async () => {
    const first = withSessionGenerationLock('session-1', () => Promise.reject(new Error('failure')))
    const secondTask = vi.fn(() => Promise.resolve('ok'))
    const second = withSessionGenerationLock('session-1', secondTask)

    await expect(first).rejects.toThrow('failure')
    await expect(second).resolves.toBe('ok')
    expect(secondTask).toHaveBeenCalledOnce()
  })

  it('does not serialize different sessions', async () => {
    let releaseFirst = () => {}
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const secondTask = vi.fn(() => Promise.resolve('second'))

    const first = withSessionGenerationLock('session-1', () => firstGate)
    const second = withSessionGenerationLock('session-2', secondTask)

    await expect(second).resolves.toBe('second')
    releaseFirst()
    await first
  })

  it('reuses an in-flight task with the same operation key', async () => {
    let releaseTask = () => {}
    const taskGate = new Promise<string>((resolve) => {
      releaseTask = () => resolve('done')
    })
    const task = vi.fn(() => taskGate)

    const first = withSessionGenerationLock('session-1', task, 'submit:message-1')
    const duplicate = withSessionGenerationLock('session-1', task, 'submit:message-1')

    await Promise.resolve()
    expect(task).toHaveBeenCalledOnce()
    releaseTask()
    await expect(Promise.all([first, duplicate])).resolves.toEqual(['done', 'done'])
  })

  it('allows the same operation key again after the previous task settles', async () => {
    const task = vi.fn().mockResolvedValue('done')

    await withSessionGenerationLock('session-1', task, 'submit:message-1')
    await withSessionGenerationLock('session-1', task, 'submit:message-1')

    expect(task).toHaveBeenCalledTimes(2)
  })
})
