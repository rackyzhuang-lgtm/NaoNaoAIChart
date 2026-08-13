import NiceModal from '@ebay/nice-modal-react'
import { Box, Button } from '@mantine/core'
import type { Message, ModelProvider } from '@shared/types'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from 'zustand'
import { JK_PAGE_NAMES } from '@/analytics/jk-events'
import MessageList, { type MessageListRef } from '@/components/chat/MessageList'
import SideChatPanel from '@/components/chat/SideChatPanel'
import { ChatboxWelcomeCard } from '@/components/common/ChatboxWelcomeCard'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import InputBox, { type InputBoxPayload, type QueueFollowUpPayload } from '@/components/InputBox/InputBox'
import Header from '@/components/layout/Header'
import Page from '@/components/layout/Page'
import ThreadHistoryDrawer from '@/components/session/ThreadHistoryDrawer'
import * as chatStore from '@/stores/chatStore'
import { updateSession as updateSessionStore, useSession } from '@/stores/chatStore'
import { lastUsedModelStore } from '@/stores/lastUsedModelStore'
import * as scrollActions from '@/stores/scrollActions'
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
import * as goalActions from '@/stores/session/goal'
import { openFollowUpInSideChat, startFollowUpSideChatGeneration } from '@/stores/session/side-chat'
import { removeCurrentThread, startNewThread, submitNewUserMessage } from '@/stores/sessionActions'
import { getAllMessageList } from '@/stores/sessionHelpers'
import { add as addToast } from '@/stores/toastActions'
import { useUIStore } from '@/stores/uiStore'

export const Route = createFileRoute('/session/$sessionId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { t } = useTranslation()
  const { sessionId: currentSessionId } = Route.useParams()
  const navigate = useNavigate()
  const { session: currentSession, isFetching } = useSession(currentSessionId)
  const widthFull = useUIStore((s) => s.widthFull)
  const welcomeCardMode = 'none' as const
  const shouldShowTemplateWelcomeCard = false
  const setLastUsedChatModel = useStore(lastUsedModelStore, (state) => state.setChatModel)
  const setLastUsedPictureModel = useStore(lastUsedModelStore, (state) => state.setPictureModel)
  const currentMessageList = useMemo(() => (currentSession ? getAllMessageList(currentSession) : []), [currentSession])
  const lastGeneratingMessage = useMemo(
    () => currentMessageList.find((m: Message) => m.generating),
    [currentMessageList]
  )
  const activeThreadId = currentSession ? resolveActiveFollowUpThreadId(currentSession) : currentSessionId
  const followUpScope = currentSession ? getFollowUpScope(currentSession, activeThreadId) : undefined
  const linkedSideChats = useMemo(
    () =>
      Object.values(currentSession?.followUpState?.sideChats ?? {}).map((link, index) => ({
        sessionId: link.sessionId,
        label: `${t('Side Chat')} ${index + 1}`,
      })),
    [currentSession?.followUpState?.sideChats, t]
  )
  const linkedSideChatSessionId = linkedSideChats.at(-1)?.sessionId
  const [sideChatSelection, setSideChatSelection] = useState<{
    sourceSessionId: string
    sideChatSessionId: string
  }>()
  const sideChatRestoreSourceRef = useRef<string>()

  const messageListRef = useRef<MessageListRef>(null)

  const goHome = useCallback(() => {
    navigate({ to: '/', replace: true })
  }, [navigate])

  useEffect(() => {
    setTimeout(() => {
      scrollActions.scrollToBottom('auto') // 每次启动时自动滚动到底部
    }, 200)
  }, [])

  useEffect(() => {
    return () => {
      void pauseFollowUpQueue(currentSessionId, activeThreadId, 'navigation').catch(() => undefined)
    }
  }, [activeThreadId, currentSessionId])

  useEffect(() => {
    if (sideChatSelection?.sourceSessionId !== currentSessionId) return
    return () => {
      void pauseSideChatQueue(sideChatSelection.sideChatSessionId, 'navigation')
    }
  }, [currentSessionId, sideChatSelection])

  useEffect(() => {
    if (!currentSession) return
    if (sideChatRestoreSourceRef.current === currentSession.id) return
    sideChatRestoreSourceRef.current = currentSession.id
    setSideChatSelection(
      linkedSideChatSessionId
        ? { sourceSessionId: currentSession.id, sideChatSessionId: linkedSideChatSessionId }
        : undefined
    )
  }, [currentSession, linkedSideChatSessionId])

  // currentSession变化时（包括session settings变化），存下当前的settings作为新Session的默认值
  useEffect(() => {
    if (currentSession) {
      if (currentSession.type === 'chat' && currentSession.settings) {
        const { provider, modelId } = currentSession.settings
        if (provider && modelId) {
          setLastUsedChatModel(provider, modelId)
        }
      }
      if (currentSession.type === 'picture' && currentSession.settings) {
        const { provider, modelId } = currentSession.settings
        if (provider && modelId) {
          setLastUsedPictureModel(provider, modelId)
        }
      }
    }
  }, [currentSession?.settings, currentSession?.type, currentSession, setLastUsedChatModel, setLastUsedPictureModel])

  const onSelectModel = useCallback(
    (provider: ModelProvider, modelId: string) => {
      if (!currentSession) {
        return
      }
      void updateSessionStore(currentSession.id, {
        settings: {
          ...(currentSession.settings || {}),
          provider,
          modelId,
        },
      })
    },
    [currentSession]
  )

  const onStartNewThread = useCallback(() => {
    if (!currentSession) {
      return false
    }
    void startNewThread(currentSession.id)
    return true
  }, [currentSession])

  const onRollbackThread = useCallback(() => {
    if (!currentSession) {
      return false
    }
    void removeCurrentThread(currentSession.id)
    return true
  }, [currentSession])

  const onSubmit = useCallback(
    async ({ constructedMessage, needGenerating = true, onUserMessageReady, goalObjective }: InputBoxPayload) => {
      messageListRef.current?.setIsNewMessage(true)

      if (!currentSession) {
        return
      }
      messageListRef.current?.scrollToBottom('instant')

      if (goalObjective) {
        await goalActions.createGoal(currentSession.id, goalObjective)
      }

      await submitNewUserMessage(currentSession.id, {
        newUserMsg: constructedMessage,
        needGenerating,
        onUserMessageReady,
      })
    },
    [currentSession]
  )

  const onQueueFollowUp = useCallback(
    async ({ constructedMessage, settingsPatch, goalObjective, intent, webBrowsing }: QueueFollowUpPayload) => {
      if (!currentSession) return
      const sessionSettings = await chatStore.getSessionSettings(currentSession.id)
      const queuedItem = await enqueueFollowUp(currentSession.id, {
        threadId: activeThreadId,
        userMessage: constructedMessage,
        intent,
        sessionSettings: { ...sessionSettings, ...settingsPatch },
        webBrowsing,
        goalObjective,
      })
      void wakeAndDispatchQueuedFollowUps(currentSession.id, activeThreadId, queuedItem.id).catch(() => {
        addToast(t('The follow-up could not be sent and remains queued.'))
      })
    },
    [activeThreadId, currentSession, t]
  )

  const onEditFollowUp = useCallback(
    async (itemId: string, message: Message, intent?: 'queue' | 'steer') => {
      if (!currentSession) return
      if (intent === 'steer') {
        await promoteFollowUpToSteer(currentSession.id, activeThreadId, itemId)
        return
      }
      await editFollowUp(currentSession.id, activeThreadId, itemId, message)
    },
    [activeThreadId, currentSession]
  )

  const onDeleteFollowUp = useCallback(
    async (itemId: string) => {
      if (currentSession) await removeFollowUp(currentSession.id, activeThreadId, itemId)
    },
    [activeThreadId, currentSession]
  )

  const onReorderFollowUps = useCallback(
    async (orderedItemIds: string[]) => {
      if (currentSession) await reorderFollowUps(currentSession.id, activeThreadId, orderedItemIds)
    },
    [activeThreadId, currentSession]
  )

  const onOpenFollowUpSideChat = useCallback(
    async (itemId: string) => {
      if (!currentSession) return
      const item = getFollowUpScope(currentSession, activeThreadId)?.items.find((candidate) => candidate.id === itemId)
      if (!item) return
      try {
        const sideChat = await openFollowUpInSideChat(currentSession.id, item)
        setSideChatSelection({ sourceSessionId: currentSession.id, sideChatSessionId: sideChat.id })
        void startFollowUpSideChatGeneration(sideChat.id, item.webBrowsing).catch(() => {
          addToast(t('The Side Chat response could not be started. You can retry from the Side Chat.'))
        })
      } catch {
        addToast(t('The Side Chat could not be opened. The follow-up remains queued.'))
      }
    },
    [activeThreadId, currentSession, t]
  )

  const onSendFollowUpNow = useCallback(
    async (itemId: string) => {
      if (!currentSession) return
      const outcome = await sendQueuedFollowUpImmediately({
        confirm: async () =>
          (await NiceModal.show('confirm', {
            title: t('Send this follow-up now?'),
            message: t(
              'The current response will be stopped before this message is sent. The message stays queued if cancellation cannot be confirmed.'
            ),
            confirmText: t('Send now'),
          })) === true,
        pauseQueue: () => pauseFollowUpQueue(currentSession.id, activeThreadId, 'user').then(() => undefined),
        isGenerationActive: isSessionGenerationActive(currentSession.id) || Boolean(lastGeneratingMessage?.generating),
        cancelGeneration: lastGeneratingMessage?.cancel,
        waitForGenerationStop: () =>
          lastGeneratingMessage
            ? waitForConfirmedSessionGenerationStop(currentSession.id, lastGeneratingMessage.id)
            : Promise.resolve(false),
        dispatch: () => dispatchQueuedFollowUpNow(currentSession.id, activeThreadId, itemId),
      })
      if (outcome === 'not-stopped') {
        addToast(t('The current response could not be confirmed as stopped. The follow-up remains queued.'))
      } else if (outcome === 'not-sent') {
        addToast(t('The follow-up could not be sent and remains queued.'))
      }
    },
    [activeThreadId, currentSession, lastGeneratingMessage, t]
  )

  const onCloseFollowUpQueue = useCallback(async () => {
    if (!currentSession) return
    await updateSessionStore(currentSession.id, {
      settings: { ...currentSession.settings, followUpBehavior: 'steer' },
    })
  }, [currentSession])

  const onResumeFollowUpQueue = useCallback(async () => {
    if (currentSession) await resumeAndDispatchQueuedFollowUps(currentSession.id, activeThreadId)
  }, [activeThreadId, currentSession])

  const onClickSessionSettings = useCallback(() => {
    if (!currentSession) {
      return false
    }
    void NiceModal.show('session-settings', {
      session: currentSession,
    })
    return true
  }, [currentSession])

  const onStopGenerating = useCallback(() => {
    if (!currentSession) {
      return false
    }
    if (lastGeneratingMessage?.generating) {
      void pauseFollowUpQueue(currentSession.id, activeThreadId, 'user').then(
        () => lastGeneratingMessage.cancel?.(),
        () => addToast(t('The follow-up could not be sent and remains queued.'))
      )
    }
    return true
  }, [activeThreadId, currentSession, lastGeneratingMessage, t])

  const model = useMemo(() => {
    if (!currentSession?.settings?.modelId || !currentSession?.settings?.provider) {
      return undefined
    }
    return {
      provider: currentSession.settings.provider,
      modelId: currentSession.settings.modelId,
    }
  }, [currentSession?.settings?.provider, currentSession?.settings?.modelId])

  return currentSession ? (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          session={currentSession}
          sideChats={linkedSideChats}
          selectedSideChatSessionId={
            sideChatSelection?.sourceSessionId === currentSessionId ? sideChatSelection.sideChatSessionId : undefined
          }
          onOpenSideChat={(sessionId) =>
            setSideChatSelection({ sourceSessionId: currentSessionId, sideChatSessionId: sessionId })
          }
        />

        {/* MessageList 设置 key，确保每个 session 对应新的 MessageList 实例 */}
        <MessageList ref={messageListRef} key={`message-list${currentSessionId}`} currentSession={currentSession} />

        <Box className="relative">
          {shouldShowTemplateWelcomeCard && (
            // absolute — taken out of flow, doesn't affect layout of siblings
            // bottom: '100%' — positioned right above the parent box's top edge (like a tooltip anchoring upward)
            <Box
              className="pointer-events-none absolute left-0 right-0 z-10"
              style={{ bottom: '100%' }}
              px="sm"
              mb="sm"
            >
              <Box className={widthFull ? 'w-full' : 'max-w-4xl mx-auto'}>
                <ChatboxWelcomeCard
                  mode={welcomeCardMode}
                  pageName={JK_PAGE_NAMES.CHAT_PAGE}
                  className="pointer-events-auto w-full"
                />
              </Box>
            </Box>
          )}

          {/* <ScrollButtons /> */}
          <ErrorBoundary name="session-inputbox">
            <InputBox
              key={`input-box${currentSession.id}`}
              sessionId={currentSession.id}
              sessionType={currentSession.type}
              model={model}
              onStartNewThread={onStartNewThread}
              onRollbackThread={onRollbackThread}
              onSelectModel={onSelectModel}
              onClickSessionSettings={onClickSessionSettings}
              generating={!!lastGeneratingMessage}
              followUpBehavior={currentSession.settings?.followUpBehavior}
              followUpItems={followUpScope?.items}
              followUpQueueStatus={followUpScope?.status}
              onQueueFollowUp={onQueueFollowUp}
              onEditFollowUp={onEditFollowUp}
              onDeleteFollowUp={onDeleteFollowUp}
              onReorderFollowUps={onReorderFollowUps}
              onSendFollowUpNow={onSendFollowUpNow}
              onOpenFollowUpSideChat={onOpenFollowUpSideChat}
              onCloseFollowUpQueue={onCloseFollowUpQueue}
              onResumeFollowUpQueue={onResumeFollowUpQueue}
              onSubmit={onSubmit}
              onStopGenerating={onStopGenerating}
            />
          </ErrorBoundary>
        </Box>
        <ThreadHistoryDrawer session={currentSession} />
      </div>
      {sideChatSelection?.sourceSessionId === currentSessionId && (
        <SideChatPanel
          sessionId={sideChatSelection.sideChatSessionId}
          onClose={() => {
            void pauseSideChatQueue(sideChatSelection.sideChatSessionId, 'navigation')
            setSideChatSelection(undefined)
          }}
        />
      )}
    </div>
  ) : (
    !isFetching && (
      <Page title="">
        <div className="flex flex-1 flex-col items-center justify-center min-h-[60vh]">
          <div className="text-2xl font-semibold text-gray-700 mb-4">{t('Conversation not found')}</div>
          <Button variant="outline" onClick={goHome}>
            {t('Back to HomePage')}
          </Button>
        </div>
      </Page>
    )
  )
}

async function pauseSideChatQueue(sessionId: string, reason: 'navigation') {
  const session = await chatStore.getSession(sessionId)
  if (!session) return
  await pauseFollowUpQueue(session.id, resolveActiveFollowUpThreadId(session), reason)
}
