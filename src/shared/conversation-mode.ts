import { type ConversationMode, ConversationModeSchema } from './types/session'

export { ConversationModeSchema }

export const PLAN_DEVELOPER_INSTRUCTION =
  'Plan mode is read-only. Inspect the available context, do not modify files or execute commands, and return one complete, concise, verifiable plan wrapped in <proposed_plan>...</proposed_plan>. Never reveal private reasoning.'

export type ActiveGoalContext = {
  kind: 'thread-goal'
  role: 'user'
  id: string
  objective: string
  status: 'active'
}

export type ConversationModeContext = {
  mode: ConversationMode
  planDeveloperInstruction?: string
  goalUserContext?: ActiveGoalContext
}

type GoalLike = {
  id: string
  objective: string
  status: 'active' | 'paused' | 'complete'
}

/**
 * Builds prompt context without promoting user-authored goal text to a developer instruction.
 * The returned goal object is intended to be serialized as user-level context by the caller.
 */
export function buildConversationModeContext(mode: ConversationMode, goal?: GoalLike): ConversationModeContext {
  const activeGoal =
    goal?.status === 'active'
      ? {
          kind: 'thread-goal' as const,
          role: 'user' as const,
          id: goal.id,
          objective: goal.objective,
          status: 'active' as const,
        }
      : undefined

  return {
    mode,
    ...(mode === 'plan' ? { planDeveloperInstruction: PLAN_DEVELOPER_INSTRUCTION } : {}),
    ...(mode === 'goal' && activeGoal ? { goalUserContext: activeGoal } : {}),
  }
}
