import type { ThreadGoal } from '@shared/types'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../chatStore', () => ({
  getSession: vi.fn(),
  updateSession: vi.fn(),
}))

import { createGoalService, GoalValidationError } from './goal'

function createHarness(initial?: ThreadGoal) {
  let goal = initial
  let now = 100
  const setGoal = vi.fn((_sessionId: string, next: ThreadGoal | undefined, expected: ThreadGoal | undefined) => {
    if (goal !== expected) return Promise.resolve(goal)
    goal = next
    return Promise.resolve(goal)
  })
  const service = createGoalService({
    getGoal: () => Promise.resolve(goal),
    setGoal,
    now: () => now,
    createId: () => 'goal-id',
  })
  return {
    ...service,
    setGoal,
    getGoal: () => goal,
    setNow: (value: number) => {
      now = value
    },
  }
}

describe('goal service', () => {
  it('creates a normalized active goal without logging its objective', async () => {
    const harness = createHarness()
    const consoleSpies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn')]

    const goal = await harness.createGoal('session-1', '  Ship the feature  ')

    expect(goal).toEqual({
      id: 'goal-id',
      objective: 'Ship the feature',
      status: 'active',
      createdAt: 100,
      updatedAt: 100,
    })
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled()
    consoleSpies.forEach((spy) => spy.mockRestore())
  })

  it('rejects empty and oversized objectives', async () => {
    const harness = createHarness()

    await expect(harness.createGoal('session-1', '   ')).rejects.toBeInstanceOf(GoalValidationError)
    await expect(harness.createGoal('session-1', 'a'.repeat(4001))).rejects.toBeInstanceOf(GoalValidationError)
    await expect(harness.createGoal('session-1', 'x'.repeat(4000))).resolves.toMatchObject({
      objective: 'x'.repeat(4000),
    })
  })

  it('keeps repeated create and transition operations idempotent', async () => {
    const harness = createHarness()

    const created = await harness.createGoal('session-1', 'Ship the feature')
    harness.setNow(200)
    expect(await harness.createGoal('session-1', 'Ship the feature')).toBe(created)
    expect(harness.setGoal).toHaveBeenCalledTimes(1)

    const paused = await harness.pauseGoal('session-1')
    expect(paused).toMatchObject({ status: 'paused', updatedAt: 200 })
    harness.setNow(300)
    expect(await harness.pauseGoal('session-1')).toBe(paused)
    expect(harness.setGoal).toHaveBeenCalledTimes(2)
  })

  it('pauses, resumes, and completes while preserving goal identity and creation time', async () => {
    const harness = createHarness({
      id: 'existing',
      objective: 'Ship',
      status: 'active',
      createdAt: 10,
      updatedAt: 10,
    })

    harness.setNow(20)
    expect(await harness.pauseGoal('session-1')).toMatchObject({ id: 'existing', status: 'paused', createdAt: 10 })
    harness.setNow(30)
    expect(await harness.resumeGoal('session-1')).toMatchObject({ id: 'existing', status: 'active', updatedAt: 30 })
    harness.setNow(40)
    expect(await harness.completeGoal('session-1')).toMatchObject({
      id: 'existing',
      status: 'complete',
      updatedAt: 40,
    })
  })

  it('clears an existing goal and treats repeated clear as a no-op', async () => {
    const harness = createHarness({
      id: 'existing',
      objective: 'Ship',
      status: 'active',
      createdAt: 10,
      updatedAt: 10,
    })

    await expect(harness.clearGoal('session-1')).resolves.toBeUndefined()
    expect(harness.getGoal()).toBeUndefined()
    await expect(harness.clearGoal('session-1')).resolves.toBeUndefined()
    expect(harness.setGoal).toHaveBeenCalledTimes(1)
  })

  it('returns undefined for transitions when no goal exists', async () => {
    const harness = createHarness()

    await expect(harness.pauseGoal('session-1')).resolves.toBeUndefined()
    await expect(harness.resumeGoal('session-1')).resolves.toBeUndefined()
    await expect(harness.completeGoal('session-1')).resolves.toBeUndefined()
    expect(harness.setGoal).not.toHaveBeenCalled()
  })
})
