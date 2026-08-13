import { describe, expect, it } from 'vitest'
import { buildConversationModeContext, ConversationModeSchema, PLAN_DEVELOPER_INSTRUCTION } from './conversation-mode'
import { SessionSchema } from './types/session'

describe('conversation mode', () => {
  it('accepts only the supported conversation modes', () => {
    expect(ConversationModeSchema.parse('default')).toBe('default')
    expect(ConversationModeSchema.parse('plan')).toBe('plan')
    expect(ConversationModeSchema.parse('goal')).toBe('goal')
    expect(() => ConversationModeSchema.parse('agent')).toThrow()
  })

  it('generates a concise developer instruction only for plan mode', () => {
    expect(buildConversationModeContext('plan')).toEqual({
      mode: 'plan',
      planDeveloperInstruction: PLAN_DEVELOPER_INSTRUCTION,
    })
    expect(buildConversationModeContext('default')).toEqual({ mode: 'default' })
  })

  it('keeps an active goal in user-level context instead of developer instructions', () => {
    const objective = 'Prepare the quarterly report'
    const context = buildConversationModeContext('goal', {
      id: 'goal-1',
      objective,
      status: 'active',
    })

    expect(context.planDeveloperInstruction).toBeUndefined()
    expect(context.goalUserContext).toEqual({
      kind: 'thread-goal',
      role: 'user',
      id: 'goal-1',
      objective,
      status: 'active',
    })
    expect(context.planDeveloperInstruction ?? '').not.toContain(objective)
  })

  it('does not inject paused goals or goals outside goal mode', () => {
    expect(
      buildConversationModeContext('goal', { id: 'goal-1', objective: 'Paused work', status: 'paused' }).goalUserContext
    ).toBeUndefined()
    expect(
      buildConversationModeContext('default', { id: 'goal-1', objective: 'Active work', status: 'active' })
        .goalUserContext
    ).toBeUndefined()
  })

  it('parses legacy sessions and optional mode and goal fields', () => {
    expect(SessionSchema.parse({ id: 'legacy', name: 'Legacy', messages: [] })).toMatchObject({ id: 'legacy' })

    const parsed = SessionSchema.parse({
      id: 'session-1',
      name: 'Session',
      messages: [
        {
          id: 'message-1',
          role: 'user',
          contentParts: [],
          conversationMode: 'goal',
        },
      ],
      goal: {
        id: 'goal-1',
        objective: 'Ship the feature',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
      threads: [
        {
          id: 'thread-1',
          name: 'Previous',
          messages: [],
          createdAt: 1,
          goal: {
            id: 'goal-2',
            objective: 'Review the feature',
            status: 'complete',
            createdAt: 1,
            updatedAt: 2,
          },
        },
      ],
    })

    expect(parsed.messages[0].conversationMode).toBe('goal')
    expect(parsed.goal?.objective).toBe('Ship the feature')
    expect(parsed.threads?.[0].goal?.status).toBe('complete')
  })

  it('keeps follow-up state optional and parses an active-thread queue', () => {
    const legacy = SessionSchema.parse({ id: 'legacy', name: 'Legacy', messages: [] })
    expect(legacy.activeThreadId).toBeUndefined()
    expect(legacy.followUpState).toBeUndefined()

    const parsed = SessionSchema.parse({
      id: 'session-1',
      name: 'Queued',
      messages: [],
      activeThreadId: 'thread-1',
      followUpState: {
        version: 1,
        scopes: {
          'thread-1': {
            threadId: 'thread-1',
            status: 'paused',
            pausedReason: 'startup',
            items: [],
          },
        },
      },
    })
    expect(parsed.followUpState?.scopes['thread-1']).toMatchObject({ status: 'paused', items: [] })
  })
})
