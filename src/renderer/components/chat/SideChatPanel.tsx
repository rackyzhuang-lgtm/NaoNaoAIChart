import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Box, Flex, Text } from '@mantine/core'
import { useMediaQuery } from '@mui/material'
import type { Message, ModelProvider } from '@shared/types'
import { IconArrowLeft, IconX } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import InputBox, { type InputBoxPayload, type QueueFollowUpPayload } from '@/components/InputBox/InputBox'
import { getSessionSettings, updateSession, useSession } from '@/stores/chatStore'
import { sendQueuedFollowUpImmediately } from '@/stores/session/follow-up-immediate'
import {
  editFollowUp,
  enqueueFollowUp,
  getFollowUpScope,
  pauseFollowUpQueue,
  promoteFollowUpToSteer,
  removeFollowUp,
  reorderFollowUps,
  resolveActiveFollowUpThreadId,
} from '@/stores/session/follow-up-queue'
import {
  dispatchQueuedFollowUpNow,
  resumeAndDispatchQueuedFollowUps,
  waitForConfirmedSessionGenerationStop,
  wakeAndDispatchQueuedFollowUps,
} from '@/stores/session/generation'
import { isSessionGenerationActive } from '@/stores/session/generation-lock'
import { submitNewUserMessage } from '@/stores/sessionActions'
import { getAllMessageList } from '@/stores/sessionHelpers'
import { add as addToast } from '@/stores/toastActions'
import MessageList, { type MessageListRef } from './MessageList'

const DEFAULT_WIDTH = 420
const MIN_WIDTH = 360

export default function SideChatPanel({ sessionId, onClose }: { sessionId: string; onClose(): void }) {
  const { t } = useTranslation()
  const { session } = useSession(sessionId)
  const isNarrowScreen = useMediaQuery('(max-width:899.95px)')
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [resizing, setResizing] = useState(false)
  const startX = useRef(0)
  const startWidth = useRef(DEFAULT_WIDTH)
  const messageListRef = useRef<MessageListRef>(null)
  const messageList = useMemo(() => (session ? getAllMessageList(session) : []), [session])
  const generatingMessage = useMemo(() => messageList.find((message) => message.generating), [messageList])
  const activeThreadId = session ? resolveActiveFollowUpThreadId(session) : sessionId
  const followUpScope = session ? getFollowUpScope(session, activeThreadId) : undefined

  useEffect(() => {
    if (!resizing) return
    const move = (event: MouseEvent) => {
      const maxWidth = Math.max(MIN_WIDTH, window.innerWidth / 2)
      setWidth(Math.max(MIN_WIDTH, Math.min(maxWidth, startWidth.current + startX.current - event.clientX)))
    }
    const stop = () => setResizing(false)
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', stop)
    return () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', stop)
    }
  }, [resizing])

  if (!session) return null

  const model =
    session.settings?.provider && session.settings.modelId
      ? { provider: session.settings.provider, modelId: session.settings.modelId }
      : undefined

  const onSubmit = async ({ constructedMessage, needGenerating = true, onUserMessageReady }: InputBoxPayload) => {
    await submitNewUserMessage(session.id, {
      newUserMsg: constructedMessage,
      needGenerating,
      onUserMessageReady,
    })
  }

  const onStopGenerating = () => {
    if (!generatingMessage) return false
    void pauseFollowUpQueue(session.id, resolveActiveFollowUpThreadId(session), 'user').then(() =>
      generatingMessage.cancel?.()
    )
    return true
  }

  const onQueueFollowUp = async ({
    constructedMessage,
    settingsPatch,
    goalObjective,
    intent,
    webBrowsing,
  }: QueueFollowUpPayload) => {
    const sessionSettings = await getSessionSettings(session.id)
    const queuedItem = await enqueueFollowUp(session.id, {
      threadId: activeThreadId,
      userMessage: constructedMessage,
      intent,
      sessionSettings: { ...sessionSettings, ...settingsPatch },
      webBrowsing,
      goalObjective,
    })
    void wakeAndDispatchQueuedFollowUps(session.id, activeThreadId, queuedItem.id).catch(() => {
      addToast(t('The follow-up could not be sent and remains queued.'))
    })
  }

  const onEditFollowUp = async (itemId: string, message: Message, intent?: 'queue' | 'steer') => {
    if (intent === 'steer') {
      await promoteFollowUpToSteer(session.id, activeThreadId, itemId)
      return
    }
    await editFollowUp(session.id, activeThreadId, itemId, message)
  }

  const onSelectModel = (provider: ModelProvider, modelId: string) => {
    void updateSession(session.id, {
      settings: { ...session.settings, provider, modelId },
    })
  }

  const onSendFollowUpNow = async (itemId: string) => {
    const outcome = await sendQueuedFollowUpImmediately({
      confirm: async () =>
        (await NiceModal.show('confirm', {
          title: t('Send this follow-up now?'),
          message: t(
            'The current response will be stopped before this message is sent. The message stays queued if cancellation cannot be confirmed.'
          ),
          confirmText: t('Send now'),
        })) === true,
      pauseQueue: () => pauseFollowUpQueue(session.id, activeThreadId, 'user').then(() => undefined),
      isGenerationActive: isSessionGenerationActive(session.id) || Boolean(generatingMessage?.generating),
      cancelGeneration: generatingMessage?.cancel,
      waitForGenerationStop: () =>
        generatingMessage
          ? waitForConfirmedSessionGenerationStop(session.id, generatingMessage.id)
          : Promise.resolve(false),
      dispatch: () => dispatchQueuedFollowUpNow(session.id, activeThreadId, itemId),
    })
    if (outcome === 'not-stopped') {
      addToast(t('The current response could not be confirmed as stopped. The follow-up remains queued.'))
    } else if (outcome === 'not-sent') {
      addToast(t('The follow-up could not be sent and remains queued.'))
    }
  }

  return (
    <Box
      role="complementary"
      aria-label={t('Side Chat') || undefined}
      className={
        isNarrowScreen
          ? 'fixed inset-0 z-40 flex min-w-0 flex-col bg-chatbox-background-primary'
          : 'relative flex min-w-0 shrink-0 flex-col border-0 border-l border-solid border-chatbox-border-primary bg-chatbox-background-primary'
      }
      style={isNarrowScreen ? undefined : { width, minWidth: MIN_WIDTH, maxWidth: '50vw' }}
    >
      {!isNarrowScreen && (
        <Box
          aria-hidden="true"
          className="absolute bottom-0 left-0 top-0 z-10 w-1 cursor-col-resize hover:bg-chatbox-border-primary"
          onMouseDown={(event) => {
            event.preventDefault()
            startX.current = event.clientX
            startWidth.current = width
            setResizing(true)
          }}
        />
      )}
      <Flex
        align="center"
        justify="space-between"
        px="sm"
        mih={48}
        className="shrink-0 border-0 border-b border-solid border-chatbox-border-primary"
      >
        <Flex align="center" gap="xs" className="min-w-0">
          {isNarrowScreen && (
            <ActionIcon variant="subtle" color="chatbox-gray" aria-label={t('Back') || undefined} onClick={onClose}>
              <IconArrowLeft size={18} />
            </ActionIcon>
          )}
          <Box className="min-w-0">
            <Text size="sm" fw={600} truncate>
              {t('Side Chat')}
            </Text>
            <Text size="xs" c="chatbox-tertiary" truncate>
              {session.name}
            </Text>
          </Box>
        </Flex>
        <ActionIcon variant="subtle" color="chatbox-gray" aria-label={t('Close') || undefined} onClick={onClose}>
          <IconX size={18} />
        </ActionIcon>
      </Flex>
      <MessageList ref={messageListRef} key={`side-chat-${session.id}`} currentSession={session} />
      <Box className="shrink-0">
        <InputBox
          key={`side-chat-input-${session.id}`}
          sessionId={session.id}
          sessionType="chat"
          model={model}
          generating={Boolean(generatingMessage)}
          followUpBehavior={session.settings?.followUpBehavior}
          followUpItems={followUpScope?.items}
          followUpQueueStatus={followUpScope?.status}
          onSelectModel={onSelectModel}
          onQueueFollowUp={onQueueFollowUp}
          onEditFollowUp={onEditFollowUp}
          onDeleteFollowUp={async (itemId) => {
            await removeFollowUp(session.id, activeThreadId, itemId)
          }}
          onReorderFollowUps={async (itemIds) => {
            await reorderFollowUps(session.id, activeThreadId, itemIds)
          }}
          onSendFollowUpNow={onSendFollowUpNow}
          onCloseFollowUpQueue={async () => {
            await updateSession(session.id, {
              settings: { ...session.settings, followUpBehavior: 'steer' },
            })
          }}
          onResumeFollowUpQueue={async () => {
            await resumeAndDispatchQueuedFollowUps(session.id, activeThreadId)
          }}
          onSubmit={onSubmit}
          onStopGenerating={onStopGenerating}
        />
      </Box>
    </Box>
  )
}
