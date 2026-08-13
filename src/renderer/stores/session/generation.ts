import { buildContext } from '@shared/context'
import type { AttachmentResolver } from '@shared/context/types'
import {
  type CompactionPoint,
  createMessage,
  type FollowUpQueueItem,
  type Message,
  type SessionSettings,
} from '@shared/types'
import type { AgentModeEntrySource } from '@/analytics/agent-mode'
import * as chatStore from '../chatStore'
import { createAttachmentResolver } from './attachment-resolver'
import {
  dispatchFollowUpById,
  dispatchReadyFollowUps,
  resolveFollowUpThreadIdForMessage,
  resumeFollowUpQueue,
} from './follow-up-queue'
import { createNewFork, findMessageLocation } from './forks'
import { isSessionGenerationActive, withSessionGenerationLock } from './generation-lock'
import { createGoal } from './goal'
import { insertMessageAfter } from './messages'
import { orchestrateGeneration } from './orchestration'
import { orchestratePictureGeneration } from './pictures'

/** Internal generation entry point for callers that already hold the session generation lock. */
export async function _generateWithoutSessionLock(
  sessionId: string,
  targetMsg: Message,
  options?: {
    operationType?: 'send_message' | 'regenerate'
    skipAgentModeSuggestion?: boolean
    agentModeEntrySource?: AgentModeEntrySource
  }
) {
  const session = await chatStore.getSession(sessionId)
  const settings = await chatStore.getSessionSettings(sessionId)
  if (!session || !settings) {
    return
  }

  if (session.type === 'chat' || session.type === undefined) {
    await orchestrateGeneration(sessionId, targetMsg, options)
    // Re-read after generation: follow-ups may have been enqueued while the
    // provider request was active, after the snapshot above was loaded.
    await dispatchFollowUpsWithinGenerationLock(sessionId, targetMsg)
    return
  }

  await orchestratePictureGeneration(sessionId, targetMsg, session, settings, options)
}

async function dispatchFollowUpsWithinGenerationLock(sessionId: string, terminalMessage: Message): Promise<void> {
  const session = await chatStore.getSession(sessionId)
  if (!session || !session.followUpState || (session.type !== 'chat' && session.type !== undefined)) return
  const location = findMessageLocation(session, terminalMessage.id)
  const currentMessage = location ? location.list[location.index] : undefined
  if (currentMessage?.generating || currentMessage?.finishReason === 'tool-call-paused') return
  const threadId = resolveFollowUpThreadIdForMessage(session, terminalMessage.id)
  await dispatchReadyFollowUps(sessionId, threadId, (item) => dispatchFollowUpItem(sessionId, item))
}

async function dispatchFollowUpItem(sessionId: string, item: FollowUpQueueItem) {
  const userMessage = { ...item.userMessage, id: item.userMessage.id || item.id }
  let session = await chatStore.getSession(sessionId)
  if (!session) return { terminal: false }

  if (item.goalObjective) {
    await createGoal(sessionId, item.goalObjective)
  }

  if (!findMessageLocation(session, userMessage.id)) {
    await chatStore.insertMessage(sessionId, userMessage, undefined, item.threadId)
    session = (await chatStore.getSession(sessionId)) ?? session
  }

  const existingAssistant = findMessageLocation(session, item.reservedAssistantMessageId)
  const storedAssistant = existingAssistant?.list[existingAssistant.index]
  if (storedAssistant && isPersistedGenerationTerminal(storedAssistant)) {
    return { terminal: true }
  }

  const assistantMessage =
    storedAssistant ??
    ({
      ...createMessage('assistant', ''),
      id: item.reservedAssistantMessageId,
      generating: true,
    } satisfies Message)
  if (!storedAssistant) {
    await insertMessageAfter(sessionId, assistantMessage, userMessage.id)
  }
  await orchestrateGeneration(sessionId, assistantMessage, {
    operationType: 'send_message',
    sessionSettingsOverride: item.sessionSettings,
    webBrowsingOverride: item.webBrowsing,
  })
  const updated = await chatStore.getSession(sessionId)
  const location = updated ? findMessageLocation(updated, assistantMessage.id) : undefined
  const generated = location ? location.list[location.index] : undefined
  return { terminal: Boolean(generated && isPersistedGenerationTerminal(generated)) }
}

function isPersistedGenerationTerminal(message: Message): boolean {
  if (message.generating || message.finishReason === 'tool-call-paused') return false
  return Boolean(message.error || message.finishReason)
}

export function dispatchQueuedFollowUpNow(sessionId: string, threadId: string, itemId: string) {
  return withSessionGenerationLock(
    sessionId,
    () => dispatchFollowUpById(sessionId, threadId, itemId, (item) => dispatchFollowUpItem(sessionId, item)),
    `follow-up:${itemId}`
  )
}

/** Resumes a paused scope and drains it under the same per-session generation lock. */
export function resumeAndDispatchQueuedFollowUps(sessionId: string, threadId: string) {
  return withSessionGenerationLock(
    sessionId,
    async () => {
      await resumeFollowUpQueue(sessionId, threadId)
      await dispatchReadyFollowUps(sessionId, threadId, (item) => dispatchFollowUpItem(sessionId, item))
    },
    `follow-up-resume:${threadId}`
  )
}

/**
 * Registers a drain after a queue item has been persisted. A distinct wake key per item
 * prevents a late enqueue from being hidden behind a drain that is just settling.
 */
export function wakeAndDispatchQueuedFollowUps(sessionId: string, threadId: string, queueItemId: string) {
  return withSessionGenerationLock(
    sessionId,
    () => dispatchReadyFollowUps(sessionId, threadId, (item) => dispatchFollowUpItem(sessionId, item)),
    `follow-up-wake:${threadId}:${queueItemId}`
  )
}

export async function waitForConfirmedSessionGenerationStop(
  sessionId: string,
  messageId: string,
  timeoutMs = 15_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const session = await chatStore.getSession(sessionId)
    const location = session ? findMessageLocation(session, messageId) : undefined
    const message = location ? location.list[location.index] : undefined
    if (message && !message.generating && !isSessionGenerationActive(sessionId)) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return false
}

/** Starts the initial response for a newly opened Side Chat exactly once. */
export function generateSideChatReply(sessionId: string, userMessageId: string) {
  return withSessionGenerationLock(
    sessionId,
    async () => {
      const session = await chatStore.getSession(sessionId)
      if (!session || session.hidden !== true || (session.type !== 'chat' && session.type !== undefined)) return
      const location = findMessageLocation(session, userMessageId)
      if (!location || location.list[location.index]?.role !== 'user') return
      if (location.list.slice(location.index + 1).some((message) => message.role === 'assistant')) return

      const assistantMessage = { ...createMessage('assistant', ''), generating: true }
      await insertMessageAfter(sessionId, assistantMessage, userMessageId)
      await _generateWithoutSessionLock(sessionId, assistantMessage, { operationType: 'send_message' })
    },
    `side-chat-reply:${userMessageId}`
  )
}

export function generate(
  sessionId: string,
  targetMsg: Message,
  options?: {
    operationType?: 'send_message' | 'regenerate'
    skipAgentModeSuggestion?: boolean
    agentModeEntrySource?: AgentModeEntrySource
  }
) {
  return withSessionGenerationLock(
    sessionId,
    () => _generateWithoutSessionLock(sessionId, targetMsg, options),
    `generate:${targetMsg.id}`
  )
}

/**
 * Insert and generate a new message below the target message
 * @param sessionId Session ID
 * @param msgId Message ID
 */
async function generateMoreWithoutSessionLock(sessionId: string, msgId: string) {
  const newAssistantMsg = createMessage('assistant', '')
  newAssistantMsg.generating = true // prevent estimating token count before generating done
  await insertMessageAfter(sessionId, newAssistantMsg, msgId)
  await _generateWithoutSessionLock(sessionId, newAssistantMsg, { operationType: 'regenerate' })
}

export function generateMore(sessionId: string, msgId: string) {
  return withSessionGenerationLock(
    sessionId,
    () => generateMoreWithoutSessionLock(sessionId, msgId),
    `generate-more:${msgId}`
  )
}

export function generateMoreInNewFork(sessionId: string, msgId: string) {
  return withSessionGenerationLock(
    sessionId,
    async () => {
      await createNewFork(sessionId, msgId)
      await generateMoreWithoutSessionLock(sessionId, msgId)
    },
    `generate-more-fork:${msgId}`
  )
}

type GenerateMoreFn = (sessionId: string, msgId: string) => Promise<void>

export function regenerateInNewFork(sessionId: string, msg: Message, options?: { runGenerateMore?: GenerateMoreFn }) {
  return withSessionGenerationLock(
    sessionId,
    () => regenerateInNewForkWithoutSessionLock(sessionId, msg, options),
    `regenerate-fork:${msg.id}`
  )
}

async function regenerateInNewForkWithoutSessionLock(
  sessionId: string,
  msg: Message,
  options?: { runGenerateMore?: GenerateMoreFn }
) {
  const runGenerateMore = options?.runGenerateMore ?? generateMoreWithoutSessionLock
  const session = await chatStore.getSession(sessionId)
  if (!session) {
    return
  }
  const location = findMessageLocation(session, msg.id)
  if (!location) {
    await _generateWithoutSessionLock(sessionId, msg, { operationType: 'regenerate' })
    return
  }
  const previousMessageIndex = location.index - 1
  if (previousMessageIndex < 0) {
    // If target message is the first message, regenerate directly
    await _generateWithoutSessionLock(sessionId, msg, { operationType: 'regenerate' })
    return
  }
  const forkMessage = location.list[previousMessageIndex]
  await createNewFork(sessionId, forkMessage.id)
  return runGenerateMore(sessionId, forkMessage.id)
}

/**
 * Build message context for prompt
 * Thin wrapper over shared buildContext() for backward compatibility
 *
 * @param settings Session settings
 * @param msgs Original message list
 * @param modelSupportToolUseForFile Whether model supports file reading tool (if supported, file content is not directly included)
 * @param optionsOrAdapter Optional configuration object OR legacy storageAdapter (for backward compatibility)
 * @returns Processed message list
 */
export async function genMessageContext(
  settings: SessionSettings,
  msgs: Message[],
  modelSupportToolUseForFile: boolean,
  optionsOrAdapter?:
    | {
        storageAdapter?: { getBlob: (key: string) => Promise<string> }
        compactionPoints?: CompactionPoint[]
      }
    | { getBlob: (key: string) => Promise<string> }
): Promise<Message[]> {
  let storageAdapter: { getBlob: (key: string) => Promise<string> } | undefined
  let compactionPoints: CompactionPoint[] | undefined

  if (optionsOrAdapter) {
    if ('getBlob' in optionsOrAdapter) {
      storageAdapter = optionsOrAdapter
    } else {
      storageAdapter = optionsOrAdapter.storageAdapter
      compactionPoints = optionsOrAdapter.compactionPoints
    }
  }

  const attachmentResolver = storageAdapter
    ? createAttachmentResolverFromAdapter(storageAdapter)
    : createAttachmentResolver()

  return buildContext(msgs, {
    attachmentResolver,
    compactionPoints,
    maxContextMessageCount: settings.maxContextMessageCount,
    modelSupportToolUseForFile,
  })
}

/**
 * Helper to create AttachmentResolver from legacy storageAdapter interface
 * Used by integration tests that pass custom storage adapter
 */
function createAttachmentResolverFromAdapter(adapter: {
  getBlob: (key: string) => Promise<string>
}): AttachmentResolver {
  return {
    async read(id) {
      return adapter.getBlob(id).catch(() => null as string | null)
    },
  }
}

/**
 * Find the thread message list that a message belongs to
 * @param sessionId Session ID
 * @param messageId Message ID
 * @returns The thread message list containing the message
 */
export async function getMessageThreadContext(sessionId: string, messageId: string): Promise<Message[]> {
  const session = await chatStore.getSession(sessionId)
  if (!session) {
    return []
  }
  if (session.messages.find((m) => m.id === messageId)) {
    return session.messages
  }
  if (!session.threads) {
    return []
  }
  for (const t of session.threads) {
    if (t.messages.find((m) => m.id === messageId)) {
      return t.messages
    }
  }
  return []
}

// Re-export for backward compatibility
export { getSessionWebBrowsing } from './utils'
