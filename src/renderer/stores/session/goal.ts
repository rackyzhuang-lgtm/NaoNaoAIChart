import type { ThreadGoal } from '@shared/types'
import { v4 as uuidv4 } from 'uuid'

const MAX_GOAL_LENGTH = 4000

export class GoalValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoalValidationError'
  }
}

export interface GoalServiceDependencies {
  getGoal: (sessionId: string) => Promise<ThreadGoal | undefined>
  setGoal: (
    sessionId: string,
    next: ThreadGoal | undefined,
    expected: ThreadGoal | undefined
  ) => Promise<ThreadGoal | undefined>
  now?: () => number
  createId?: () => string
}

function countCharacters(value: string): number {
  return Array.from(value).length
}

function normalizeObjective(objective: string): string {
  const normalized = objective.trim()
  if (countCharacters(normalized) < 1 || countCharacters(normalized) > MAX_GOAL_LENGTH) {
    throw new GoalValidationError(`Goal objective must contain 1-${MAX_GOAL_LENGTH} characters.`)
  }
  return normalized
}

function sameGoal(left: ThreadGoal | undefined, right: ThreadGoal | undefined): boolean {
  return (
    left?.id === right?.id &&
    left?.objective === right?.objective &&
    left?.status === right?.status &&
    left?.createdAt === right?.createdAt &&
    left?.updatedAt === right?.updatedAt
  )
}

function createDefaultDependencies(): GoalServiceDependencies {
  return {
    getGoal: async (sessionId) => {
      const chatStore = await import('../chatStore')
      return (await chatStore.getSession(sessionId))?.goal
    },
    setGoal: async (sessionId, next, expected) => {
      const chatStore = await import('../chatStore')
      let result: ThreadGoal | undefined
      await chatStore.updateSession(sessionId, (session) => {
        if (!session) throw new Error(`Session ${sessionId} not found`)
        if (!sameGoal(session.goal, expected)) {
          result = session.goal
          return session
        }
        result = next
        return { ...session, goal: next }
      })
      return result
    },
    now: () => Date.now(),
    createId: () => uuidv4(),
  }
}

export function createGoalService(overrides: Partial<GoalServiceDependencies> = {}) {
  const dependencies = { ...createDefaultDependencies(), ...overrides }

  async function createGoal(sessionId: string, objective: string): Promise<ThreadGoal> {
    const normalized = normalizeObjective(objective)
    const current = await dependencies.getGoal(sessionId)
    if (current?.objective === normalized) return current

    const now = dependencies.now?.() ?? Date.now()
    const next: ThreadGoal = {
      id: dependencies.createId?.() ?? uuidv4(),
      objective: normalized,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
    return (await dependencies.setGoal(sessionId, next, current)) ?? next
  }

  async function transitionGoal(sessionId: string, status: ThreadGoal['status']): Promise<ThreadGoal | undefined> {
    const current = await dependencies.getGoal(sessionId)
    if (!current || current.status === status) return current
    const next = { ...current, status, updatedAt: dependencies.now?.() ?? Date.now() }
    return await dependencies.setGoal(sessionId, next, current)
  }

  async function clearGoal(sessionId: string): Promise<undefined> {
    const current = await dependencies.getGoal(sessionId)
    if (!current) return undefined
    await dependencies.setGoal(sessionId, undefined, current)
    return undefined
  }

  return {
    createGoal,
    pauseGoal: (sessionId: string) => transitionGoal(sessionId, 'paused'),
    resumeGoal: (sessionId: string) => transitionGoal(sessionId, 'active'),
    completeGoal: (sessionId: string) => transitionGoal(sessionId, 'complete'),
    clearGoal,
  }
}

const defaultGoalService = createGoalService()
export const createGoal = defaultGoalService.createGoal
export const pauseGoal = defaultGoalService.pauseGoal
export const resumeGoal = defaultGoalService.resumeGoal
export const completeGoal = defaultGoalService.completeGoal
export const clearGoal = defaultGoalService.clearGoal
