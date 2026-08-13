import {
  copyMessage,
  createMessage,
  type FollowUpQueueItem,
  type Message,
  MessageSchema,
  type Session,
  SessionSettingsSchema,
} from '@shared/types'
import { v4 as uuidv4 } from 'uuid'
import platform from '@/platform'
import * as chatStore from '../chatStore'
import { ensureMessageFileSessionAttachment } from '../sessionAttachmentRagIndexing'
import { uiStore } from '../uiStore'
import { consumeFollowUpIntoSideChat } from './follow-up-queue'
import { generateSideChatReply } from './generation'
import { createGoal } from './goal'

const sideChatOpenTasks = new Map<string, Promise<Session>>()
const sideChatGenerationTasks = new Map<string, Promise<void>>()

export async function openFollowUpInSideChat(sourceSessionId: string, item: FollowUpQueueItem): Promise<Session> {
  const taskKey = JSON.stringify([sourceSessionId, item.id])
  const activeTask = sideChatOpenTasks.get(taskKey)
  if (activeTask) return activeTask

  const task = createOrOpenFollowUpSideChat(sourceSessionId, item)
  sideChatOpenTasks.set(taskKey, task)
  try {
    return await task
  } finally {
    if (sideChatOpenTasks.get(taskKey) === task) sideChatOpenTasks.delete(taskKey)
  }
}

export function startFollowUpSideChatGeneration(
  sideChatSessionId: string,
  webBrowsing: boolean | undefined
): Promise<void> {
  const activeTask = sideChatGenerationTasks.get(sideChatSessionId)
  if (activeTask) return activeTask

  const task = startInitialSideChatGeneration(sideChatSessionId, webBrowsing)
  // A linked Side Chat owns this initial request. Reopening it must not submit
  // the copied source message again.
  sideChatGenerationTasks.set(sideChatSessionId, task)
  return task
}

async function startInitialSideChatGeneration(
  sideChatSessionId: string,
  webBrowsing: boolean | undefined
): Promise<void> {
  const session = await chatStore.getSession(sideChatSessionId)
  if (!session || session.hidden !== true || (session.type !== 'chat' && session.type !== undefined)) return
  const initialUserMessage = session.messages.find((message) => message.role === 'user')
  if (!initialUserMessage) return
  if (webBrowsing !== undefined) {
    uiStore.getState().setSessionWebBrowsing(sideChatSessionId, webBrowsing)
  }
  await generateSideChatReply(sideChatSessionId, initialUserMessage.id)
}

export function findLinkedSideChatSessionId(source: Session, sessionId: string): string | undefined {
  return Object.values(source.followUpState?.sideChats ?? {}).find((link) => link.sessionId === sessionId)?.sessionId
}

async function createOrOpenFollowUpSideChat(sourceSessionId: string, item: FollowUpQueueItem): Promise<Session> {
  const source = await chatStore.getSession(sourceSessionId)
  if (!source) throw new Error(`Session ${sourceSessionId} not found`)

  const existingId = source.followUpState?.sideChats?.[item.id]?.sessionId ?? item.sideChatSessionId
  if (existingId) {
    const existing = await chatStore.getSession(existingId)
    if (existing?.hidden === true && existing.type === 'chat' && existing.id !== sourceSessionId) return existing
  }

  const userMessage = copySideChatMessage(item.userMessage)
  const sideChat = await chatStore.createSession({
    name: getSideChatName(source, userMessage),
    type: 'chat',
    hidden: true,
    messages: [createMessage('system', getSystemPrompt(source)), userMessage],
    settings: getSafeSessionSettings(item.sessionSettings ?? source.settings),
    activeThreadId: undefined,
  })

  try {
    await chatStore.updateSession(sideChat.id, { activeThreadId: sideChat.id })
    const hydratedMessage = await rebuildSideChatAttachments(sideChat.id, userMessage)
    if (hydratedMessage !== userMessage) {
      await chatStore.updateMessage(sideChat.id, userMessage.id, hydratedMessage)
    }
    if (item.goalObjective) {
      await createGoal(sideChat.id, item.goalObjective)
    }
    const completed = (await chatStore.getSession(sideChat.id)) ?? {
      ...sideChat,
      messages: [sideChat.messages[0], hydratedMessage],
    }
    await consumeFollowUpIntoSideChat(sourceSessionId, item.id, sideChat.id)
    return completed
  } catch (error) {
    const rollbackErrors = await rollBackSideChat(sourceSessionId, item.id, sideChat.id)
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], `Failed to roll back Side Chat ${sideChat.id}`)
    }
    throw error
  }
}

async function rollBackSideChat(sourceSessionId: string, queueItemId: string, sideChatSessionId: string) {
  const errors: unknown[] = []
  try {
    await chatStore.updateSession(sourceSessionId, (source) => {
      if (!source) throw new Error(`Session ${sourceSessionId} not found`)
      const state = source.followUpState
      if (state?.sideChats?.[queueItemId]?.sessionId !== sideChatSessionId) return source
      const sideChats = { ...state.sideChats }
      delete sideChats[queueItemId]
      return { ...source, followUpState: { ...state, sideChats } }
    })
  } catch (error) {
    errors.push(error)
  }
  try {
    await chatStore.deleteSession(sideChatSessionId)
  } catch (error) {
    errors.push(error)
  }
  return errors
}

function copySideChatMessage(source: Message): Message {
  // Parsing produces an isolated data copy and drops runtime-only/unknown fields before persistence.
  const message = MessageSchema.parse(copyMessage(source))
  delete message.generating
  delete message.cancel
  delete message.error
  delete message.errorCode
  delete message.errorExtra
  message.status = []
  message.files = message.files?.map((file) => {
    const copiedFile = { ...file, id: uuidv4() }
    delete copiedFile.chatboxAIFileUUID
    delete copiedFile.sessionAttachmentId
    delete copiedFile.sessionAttachmentAvailability
    delete copiedFile.sessionAttachmentIndexStatus
    delete copiedFile.sessionAttachmentStatus
    delete copiedFile.sessionAttachmentChunkCount
    delete copiedFile.sessionAttachmentTotalChunks
    delete copiedFile.sessionAttachmentEmbeddedChunks
    delete copiedFile.sessionAttachmentIndexingStage
    delete copiedFile.sessionAttachmentBlockedReason
    delete copiedFile.sessionAttachmentWarningReason
    return copiedFile
  })
  return message
}

async function rebuildSideChatAttachments(sessionId: string, message: Message): Promise<Message> {
  if (platform.type !== 'desktop' || !message.files?.length) return message
  const files: NonNullable<Message['files']> = []
  // Keep creation ordered so rollback cannot race a still-running sibling attachment task.
  for (const file of message.files) {
    files.push(await ensureMessageFileSessionAttachment({ sessionId, messageId: message.id, file }))
  }
  return { ...message, files }
}

function getSafeSessionSettings(settings: Session['settings']): NonNullable<Session['settings']> {
  // Session settings intentionally exclude Provider credentials. Zod also strips unknown runtime fields.
  return SessionSettingsSchema.parse(settings ?? {})
}

function getSystemPrompt(source: Session): string {
  const system = source.messages.find((message) => message.role === 'system')
  return (
    system?.contentParts
      .filter((part): part is Extract<(typeof system.contentParts)[number], { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('\n') || ''
  )
}

function getSideChatName(source: Session, message: Message): string {
  const text = message.contentParts
    .filter((part): part is Extract<(typeof message.contentParts)[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text.trim())
    .find(Boolean)
  return text ? text.slice(0, 64) : `${source.name} Side Chat`
}
