import type {
  FollowUpIntent,
  FollowUpQueueItem,
  FollowUpQueueScope,
  FollowUpState,
  Message,
  Session,
} from '@shared/types'
import { v4 as uuidv4 } from 'uuid'
import platform from '@/platform'
import * as chatStore from '../chatStore'
import { interruptSessionRetryBackoff } from './session-generation-retry'

export type FollowUpPauseReason = NonNullable<FollowUpQueueScope['pausedReason']>

export interface EnqueueFollowUpInput {
  threadId?: string
  userMessage: Message
  intent: FollowUpIntent
  sessionSettings?: FollowUpQueueItem['sessionSettings']
  webBrowsing?: boolean
  goalObjective?: string
  sideChatSessionId?: string
}

export interface FollowUpDispatchResult {
  terminal: boolean
}

export function resolveActiveFollowUpThreadId(session: Pick<Session, 'id' | 'activeThreadId'>): string {
  return session.activeThreadId || session.id
}

export function resolveFollowUpThreadIdForMessage(session: Session, messageId: string): string {
  const historicalThread = session.threads?.find((thread) =>
    thread.messages.some((message) => message.id === messageId)
  )
  return historicalThread?.id ?? resolveActiveFollowUpThreadId(session)
}

export function getFollowUpScope(session: Session, threadId = resolveActiveFollowUpThreadId(session)) {
  return session.followUpState?.scopes[threadId]
}

export function removeFollowUpThreadState(
  state: FollowUpState | undefined,
  threadId: string,
  options?: { preserveSideChats?: boolean }
): FollowUpState | undefined {
  if (!state) return state

  const removedQueueItemIds = new Set(state.scopes[threadId]?.items.map((item) => item.id) ?? [])
  const scopes = { ...state.scopes }
  delete scopes[threadId]

  const sideChats = options?.preserveSideChats
    ? state.sideChats
    : Object.fromEntries(
        Object.entries(state.sideChats ?? {}).filter(
          ([queueItemId, link]) => link.threadId !== threadId && !removedQueueItemIds.has(queueItemId)
        )
      )

  return {
    ...state,
    scopes,
    sideChats: sideChats && Object.keys(sideChats).length > 0 ? sideChats : undefined,
  }
}

export function createFollowUpQueueItem(
  session: Pick<Session, 'id' | 'activeThreadId'>,
  input: EnqueueFollowUpInput,
  options?: { now?: number; createId?: () => string }
): FollowUpQueueItem {
  const now = options?.now ?? Date.now()
  const createId = options?.createId ?? uuidv4
  const threadId = input.threadId ?? resolveActiveFollowUpThreadId(session)
  return {
    id: createId(),
    threadId,
    userMessage: input.userMessage,
    reservedAssistantMessageId: createId(),
    intent: input.intent,
    status: 'ready',
    createdAt: now,
    updatedAt: now,
    sessionSettings: input.sessionSettings,
    webBrowsing: input.webBrowsing,
    goalObjective: input.goalObjective,
    sideChatSessionId: input.sideChatSessionId,
  }
}

export async function enqueueFollowUp(sessionId: string, input: EnqueueFollowUpInput): Promise<FollowUpQueueItem> {
  let queuedItem: FollowUpQueueItem | undefined
  await updateFollowUpState(sessionId, (session, state) => {
    const item = createFollowUpQueueItem(session, input)
    const scope = ensureScope(state, item.threadId)
    queuedItem = { ...item, status: scope.status === 'paused' ? 'paused' : 'ready' }
    return setScope(state, { ...scope, items: [...scope.items, queuedItem] })
  })
  if (!queuedItem) throw new Error(`Session ${sessionId} not found`)
  if (queuedItem.intent === 'steer') {
    interruptSessionRetryBackoff(sessionId)
  }
  return queuedItem
}

export async function editFollowUp(sessionId: string, threadId: string, itemId: string, userMessage: Message) {
  return updateScopeItems(sessionId, threadId, (items) =>
    items.map((item) =>
      item.id === itemId && item.status !== 'dispatching' ? { ...item, userMessage, updatedAt: Date.now() } : item
    )
  )
}

export async function promoteFollowUpToSteer(sessionId: string, threadId: string, itemId: string) {
  const updated = await updateScopeItems(sessionId, threadId, (items) =>
    items.map((item) =>
      item.id === itemId && item.status !== 'dispatching'
        ? { ...item, intent: 'steer' as const, updatedAt: Date.now() }
        : item
    )
  )
  interruptSessionRetryBackoff(sessionId)
  return updated
}

export async function removeFollowUp(sessionId: string, threadId: string, itemId: string) {
  let removedMessageId: string | undefined
  const updated = await updateScopeItems(sessionId, threadId, (items) =>
    items.filter((item) => {
      if (item.id !== itemId || item.status === 'dispatching') return true
      removedMessageId = item.userMessage.id
      return false
    })
  )
  if (removedMessageId) await cleanupFollowUpMessageAttachments(removedMessageId, 'queue item deletion')
  return updated
}

export async function consumeFollowUpIntoSideChat(sessionId: string, queueItemId: string, sideChatSessionId: string) {
  let consumedMessageId: string | undefined
  const updated = await updateFollowUpState(sessionId, (_session, state) => {
    const now = Date.now()
    const scope = Object.values(state.scopes).find((scope) => scope.items.some((item) => item.id === queueItemId))
    if (!scope) {
      if (state.sideChats?.[queueItemId]?.sessionId === sideChatSessionId) return state
      throw new Error(`Follow-up ${queueItemId} is no longer queued`)
    }
    const item = scope.items.find((candidate) => candidate.id === queueItemId)
    if (!item || item.status === 'dispatching') {
      throw new Error(`Follow-up ${queueItemId} is already being dispatched`)
    }
    consumedMessageId = item.userMessage.id

    const consumedState = setScope(state, {
      ...scope,
      items: scope.items.filter((candidate) => candidate.id !== queueItemId),
    })
    return {
      ...consumedState,
      sideChats: {
        ...consumedState.sideChats,
        [queueItemId]: {
          queueItemId,
          sessionId: sideChatSessionId,
          threadId: consumedState.sideChats?.[queueItemId]?.threadId ?? scope.threadId,
          createdAt: consumedState.sideChats?.[queueItemId]?.createdAt ?? now,
          updatedAt: now,
        },
      },
    }
  })
  if (consumedMessageId) await cleanupFollowUpMessageAttachments(consumedMessageId, 'Side Chat transfer')
  return updated
}

export async function reorderFollowUps(sessionId: string, threadId: string, orderedItemIds: string[]) {
  return updateScopeItems(sessionId, threadId, (items) => {
    const movable = new Map(items.filter((item) => item.status !== 'dispatching').map((item) => [item.id, item]))
    const ordered = orderedItemIds.flatMap((id) => {
      const item = movable.get(id)
      if (!item) return []
      movable.delete(id)
      return [item]
    })
    const remainder = items.filter((item) => item.status !== 'dispatching' && movable.has(item.id))
    const reordered = [...ordered, ...remainder]
    let cursor = 0
    return items.map((item) => (item.status === 'dispatching' ? item : (reordered[cursor++] ?? item)))
  })
}

export async function dispatchFollowUpById(
  sessionId: string,
  threadId: string,
  itemId: string,
  dispatch: (item: FollowUpQueueItem) => Promise<FollowUpDispatchResult>
): Promise<FollowUpDispatchResult> {
  const item = await claimFollowUpById(sessionId, threadId, itemId, true)
  if (!item) return { terminal: false }
  try {
    const result = await dispatch(item)
    if (!result.terminal) {
      await pauseClaimedFollowUp(sessionId, threadId, item.id)
      return result
    }
    await completeFollowUpsForGeneration(sessionId, threadId, item.reservedAssistantMessageId)
    return result
  } catch (error) {
    await pauseClaimedFollowUp(sessionId, threadId, item.id)
    throw error
  }
}

export async function pauseFollowUpQueue(sessionId: string, threadId: string, reason: FollowUpPauseReason) {
  return updateFollowUpState(sessionId, (_session, state) => {
    const scope = ensureScope(state, threadId)
    return setScope(state, {
      ...scope,
      status: 'paused',
      pausedReason: reason,
      items: scope.items.map((item) =>
        item.status === 'ready' || item.status === 'dispatching'
          ? { ...item, status: 'paused', updatedAt: Date.now() }
          : item
      ),
    })
  })
}

export async function resumeFollowUpQueue(sessionId: string, threadId: string) {
  return updateFollowUpState(sessionId, (_session, state) => {
    const scope = ensureScope(state, threadId)
    return setScope(state, {
      ...scope,
      status: 'active',
      pausedReason: undefined,
      items: scope.items.map((item) =>
        item.status === 'paused'
          ? {
              ...item,
              status: 'ready',
              dispatchTargetMessageId: undefined,
              dispatchAttemptId: undefined,
              updatedAt: Date.now(),
            }
          : item
      ),
    })
  })
}

export async function pauseFollowUpQueuesForLifecycle(
  sessionIds: string[],
  reason: Exclude<FollowUpPauseReason, 'user'>
): Promise<void> {
  await Promise.all(
    sessionIds.map(async (sessionId) => {
      const session = await chatStore.getSession(sessionId)
      if (!session?.followUpState) return
      const hasWorkToPause = Object.values(session.followUpState.scopes).some(
        (scope) => scope.status !== 'paused' || scope.items.some((item) => item.status !== 'paused')
      )
      if (!hasWorkToPause) return
      await updateFollowUpState(sessionId, (_session, state) => ({
        ...state,
        scopes: Object.fromEntries(
          Object.entries(state.scopes).map(([threadId, scope]) => [
            threadId,
            {
              ...scope,
              status: 'paused' as const,
              pausedReason: reason,
              items: scope.items.map((item) =>
                item.status === 'paused' ? item : { ...item, status: 'paused' as const, updatedAt: Date.now() }
              ),
            },
          ])
        ),
      }))
    })
  )
}

export async function pauseAllFollowUpQueuesForLifecycle(reason: Exclude<FollowUpPauseReason, 'user'>): Promise<void> {
  const metaStorage = await chatStore.getMetaStorage()
  const sessionIds = (await metaStorage.getAllIncludingHidden()).map((item) => item.id)
  await pauseFollowUpQueuesForLifecycle(sessionIds, reason)
}

export async function claimSteerAtPrepareStep(options: {
  sessionId: string
  threadId: string
  targetMessageId: string
  attemptId: string
}): Promise<FollowUpQueueItem | undefined> {
  let claimed: FollowUpQueueItem | undefined
  await updateFollowUpState(options.sessionId, (_session, state) => {
    const scope = state.scopes[options.threadId]
    if (!scope || scope.status === 'paused') return state
    const candidate = scope.items.find(
      (item) =>
        item.intent === 'steer' &&
        canInjectFollowUpAtStepBoundary(item) &&
        (item.status === 'ready' ||
          (item.dispatchTargetMessageId === options.targetMessageId &&
            item.dispatchAttemptId !== undefined &&
            item.dispatchAttemptId !== options.attemptId))
    )
    if (!candidate) return state
    claimed = {
      ...candidate,
      status: 'dispatching',
      dispatchTargetMessageId: options.targetMessageId,
      dispatchAttemptId: options.attemptId,
      updatedAt: Date.now(),
    }
    return setScope(state, {
      ...scope,
      status: 'dispatching',
      items: scope.items.map((item) => (item.id === candidate.id ? claimed! : item)),
    })
  })
  return claimed
}

function canInjectFollowUpAtStepBoundary(item: FollowUpQueueItem): boolean {
  return (
    !item.userMessage.files?.length &&
    !item.userMessage.links?.length &&
    !item.userMessage.contentParts.some((part) => part.type === 'image')
  )
}

export async function completeFollowUpsForGeneration(sessionId: string, threadId: string, targetMessageId: string) {
  return updateFollowUpState(sessionId, (_session, state) => {
    const scope = state.scopes[threadId]
    if (!scope) return state
    const items = scope.items.filter((item) => item.dispatchTargetMessageId !== targetMessageId)
    return setScope(state, {
      ...scope,
      status: scope.status === 'paused' ? 'paused' : 'active',
      items,
    })
  })
}

export async function pauseFollowUpsForCancelledGeneration(
  sessionId: string,
  threadId: string,
  targetMessageId: string
) {
  return updateFollowUpState(sessionId, (_session, state) => {
    const scope = state.scopes[threadId]
    if (!scope) return state
    const hasClaimedItem = scope.items.some(
      (item) => item.status === 'dispatching' && item.dispatchTargetMessageId === targetMessageId
    )
    if (!hasClaimedItem) return state
    return setScope(state, {
      ...scope,
      status: 'paused',
      pausedReason: 'user',
      items: scope.items.map((item) =>
        item.status === 'dispatching' && item.dispatchTargetMessageId === targetMessageId
          ? { ...item, status: 'paused', updatedAt: Date.now() }
          : item
      ),
    })
  })
}

export async function dispatchReadyFollowUps(
  sessionId: string,
  threadId: string,
  dispatch: (item: FollowUpQueueItem) => Promise<FollowUpDispatchResult>
): Promise<void> {
  while (true) {
    const item = await claimNextFollowUp(sessionId, threadId)
    if (!item) return
    let result: FollowUpDispatchResult
    try {
      result = await dispatch(item)
    } catch {
      await pauseClaimedFollowUp(sessionId, threadId, item.id)
      return
    }
    if (!result.terminal) {
      await pauseClaimedFollowUp(sessionId, threadId, item.id)
      return
    }
    await completeFollowUpsForGeneration(sessionId, threadId, item.reservedAssistantMessageId)
  }
}

export function getFollowUpText(item: FollowUpQueueItem): string {
  return item.userMessage.contentParts
    .filter(
      (part): part is Extract<(typeof item.userMessage.contentParts)[number], { type: 'text' }> => part.type === 'text'
    )
    .map((part) => part.text)
    .join('\n')
}

async function claimNextFollowUp(sessionId: string, threadId: string): Promise<FollowUpQueueItem | undefined> {
  let claimed: FollowUpQueueItem | undefined
  await updateFollowUpState(sessionId, (_session, state) => {
    const scope = state.scopes[threadId]
    if (!scope || scope.status !== 'active') return state
    const ready = scope.items.filter((item) => item.status === 'ready')
    const candidate = ready.find((item) => item.intent === 'steer') ?? ready[0]
    if (!candidate) return state
    claimed = {
      ...candidate,
      status: 'dispatching',
      dispatchTargetMessageId: candidate.reservedAssistantMessageId,
      updatedAt: Date.now(),
    }
    return setScope(state, {
      ...scope,
      status: 'dispatching',
      items: scope.items.map((item) => (item.id === candidate.id ? claimed! : item)),
    })
  })
  return claimed
}

async function claimFollowUpById(
  sessionId: string,
  threadId: string,
  itemId: string,
  allowPaused = false
): Promise<FollowUpQueueItem | undefined> {
  let claimed: FollowUpQueueItem | undefined
  await updateFollowUpState(sessionId, (_session, state) => {
    const scope = state.scopes[threadId]
    if (!scope || (!allowPaused && scope.status !== 'active')) return state
    const candidate = scope.items.find(
      (item) => item.id === itemId && (item.status === 'ready' || (allowPaused && item.status === 'paused'))
    )
    if (!candidate) return state
    claimed = {
      ...candidate,
      status: 'dispatching',
      dispatchTargetMessageId: candidate.reservedAssistantMessageId,
      updatedAt: Date.now(),
    }
    return setScope(state, {
      ...scope,
      // Immediate send may claim one paused item after a confirmed cancellation.
      // Keep the scope paused so no sibling item is implicitly resumed.
      status: allowPaused && scope.status === 'paused' ? 'paused' : 'dispatching',
      items: scope.items.map((item) => (item.id === candidate.id ? claimed! : item)),
    })
  })
  return claimed
}

async function pauseClaimedFollowUp(sessionId: string, threadId: string, itemId: string) {
  return updateFollowUpState(sessionId, (_session, state) => {
    const scope = state.scopes[threadId]
    if (!scope) return state
    return setScope(state, {
      ...scope,
      status: 'paused',
      pausedReason: 'user',
      items: scope.items.map((item) =>
        item.id === itemId ? { ...item, status: 'paused', updatedAt: Date.now() } : item
      ),
    })
  })
}

async function updateScopeItems(
  sessionId: string,
  threadId: string,
  updater: (items: FollowUpQueueItem[]) => FollowUpQueueItem[]
) {
  return updateFollowUpState(sessionId, (_session, state) => {
    const scope = ensureScope(state, threadId)
    return setScope(state, { ...scope, items: updater(scope.items) })
  })
}

async function updateFollowUpState(
  sessionId: string,
  updater: (session: Pick<Session, 'id' | 'activeThreadId'>, state: FollowUpState) => FollowUpState
) {
  return chatStore.updateSession(sessionId, (session) => {
    if (!session) throw new Error(`Session ${sessionId} not found`)
    return {
      ...session,
      followUpState: updater(session, session.followUpState ?? emptyState()),
    }
  })
}

function emptyState(): FollowUpState {
  return { version: 1, scopes: {} }
}

function ensureScope(state: FollowUpState, threadId: string): FollowUpQueueScope {
  return state.scopes[threadId] ?? { threadId, status: 'active', items: [] }
}

function setScope(state: FollowUpState, scope: FollowUpQueueScope): FollowUpState {
  return { ...state, scopes: { ...state.scopes, [scope.threadId]: scope } }
}

async function cleanupFollowUpMessageAttachments(messageId: string, operation: string): Promise<void> {
  if (platform.type !== 'desktop') return
  try {
    await platform.getSessionAttachmentRagController().deleteMessageAttachments(messageId)
  } catch (error) {
    console.warn(`Failed to cleanup session attachment RAG entries for ${operation}:`, error)
  }
}

export async function cleanupFollowUpThreadAttachments(
  session: Pick<Session, 'followUpState'>,
  threadId: string
): Promise<void> {
  const messageIds = session.followUpState?.scopes[threadId]?.items.map((item) => item.userMessage.id) ?? []
  await Promise.all(
    [...new Set(messageIds)].map((messageId) =>
      cleanupFollowUpMessageAttachments(messageId, `thread ${threadId} deletion`)
    )
  )
}
