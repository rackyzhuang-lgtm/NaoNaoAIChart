import { Alert, Button, Center, Group, Loader, Stack, Switch, Text, TextInput } from '@mantine/core'
import { IconAlertCircle, IconFolder, IconRefresh, IconRotateClockwise } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { CanvasAgentBroker } from '@/components/infinite-canvas/CanvasAgentBroker'
import Page from '@/components/layout/Page'
import {
  acknowledgePendingInfiniteCanvasImport,
  getPendingInfiniteCanvasImport,
  subscribePendingInfiniteCanvasImport,
} from '@/stores/infiniteCanvasImportStore'
import { settingsStore } from '@/stores/settingsStore'
import { resolveInfiniteCanvasAgentConfig } from '@/utils/infinite-canvas-agent-config'
import { getInfiniteCanvasStoragePathApi } from '@/utils/infinite-canvas-storage-path-api'
import { CHATBOX_BUILD_TARGET } from '@/variables'

export const Route = createFileRoute('/infinite-canvas/')({
  component: InfiniteCanvasPage,
})

export function InfiniteCanvasPage() {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [agentError, setAgentError] = useState<string | null>(null)
  const [agentModel, setAgentModel] = useState<string | null>(null)
  const [allowSkills, setAllowSkills] = useState(true)
  const [allowMcp, setAllowMcp] = useState(false)
  const [canvasRevision, setCanvasRevision] = useState(0)
  const pendingImport = useSyncExternalStore(
    subscribePendingInfiniteCanvasImport,
    getPendingInfiniteCanvasImport,
    getPendingInfiniteCanvasImport
  )
  const [storagePath, setStoragePath] = useState('')
  const [selectingStoragePath, setSelectingStoragePath] = useState(false)
  const [storageRestartRequired, setStorageRestartRequired] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const storagePathApi = useMemo(() => getInfiniteCanvasStoragePathApi(window.electronAPI), [])

  const loadCanvas = useCallback(() => {
    setError(null)
    setUrl(null)
    if (CHATBOX_BUILD_TARGET === 'mobile_app' || !window.electronAPI) {
      setError('无限画布仅在桌面版应用中可用。')
      return
    }
    void window.electronAPI
      .getInfiniteCanvasUrl()
      .then(async (canvasUrl) => {
        const parsed = new URL(canvasUrl)
        if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1') {
          throw new Error('Invalid canvas origin')
        }
        const agentConfig = resolveInfiniteCanvasAgentConfig(
          settingsStore.getState().getSettings(),
          getPendingInfiniteCanvasImport()?.payload ?? null
        )
        if (agentConfig && typeof window.electronAPI.configureInfiniteCanvasAgent === 'function') {
          try {
            await window.electronAPI.configureInfiniteCanvasAgent(agentConfig)
            setAgentModel(agentConfig.model)
            setAgentError(null)
          } catch (configurationError) {
            setAgentError(configurationError instanceof Error ? configurationError.message : '文本模型配置无效。')
          }
        }
        const connection = await window.electronAPI.getInfiniteCanvasAgentConnection()
        if (!connection.configured && !agentConfig) {
          setAgentError('未检测到可用的文本模型。请先在 NaoNaoAI Chat 的模型设置中配置 API Key 和模型。')
        }
        const agentUrl = new URL(canvasUrl)
        agentUrl.searchParams.set('agentUrl', connection.endpoint)
        agentUrl.searchParams.set('agentToken', connection.token)
        agentUrl.searchParams.set('revision', String(canvasRevision))
        setUrl(agentUrl.toString())
      })
      .catch(() => setError('无限画布加载失败，请重试。'))
  }, [canvasRevision])

  useEffect(() => {
    loadCanvas()
  }, [loadCanvas])

  useEffect(() => {
    if (!url || !pendingImport) return
    const canvasOrigin = new URL(url).origin
    let completed = false
    let bridgeReady = false
    const timerIds: { retry?: number; timeout?: number } = {}
    const stopDelivery = () => {
      completed = true
      if (timerIds.retry !== undefined) window.clearInterval(timerIds.retry)
      if (timerIds.timeout !== undefined) window.clearTimeout(timerIds.timeout)
    }
    const postToCanvas = (message: unknown) => {
      iframeRef.current?.contentWindow?.postMessage(message, canvasOrigin)
    }
    const sendImport = () => {
      if (!bridgeReady || completed) return
      postToCanvas({
        type: 'naonao-import-ai-config',
        requestId: pendingImport.requestId,
        payload: pendingImport.payload,
      })
    }
    const handleImportResult = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== canvasOrigin) return
      const result = event.data as { type?: unknown; requestId?: unknown; ok?: unknown; error?: unknown } | null
      if (result?.type === 'naonao-embed-bridge-ready') {
        bridgeReady = true
        sendImport()
        return
      }
      if (!result || result.type !== 'naonao-import-ai-config-result' || result.requestId !== pendingImport.requestId) {
        return
      }
      stopDelivery()
      if (result.ok === true) {
        acknowledgePendingInfiniteCanvasImport(pendingImport.requestId)
        setAgentError(null)
      } else {
        setAgentError(typeof result.error === 'string' ? result.error : '无法导入 API Key 到无限画布。')
      }
    }
    window.addEventListener('message', handleImportResult)
    postToCanvas({ type: 'naonao-embed-bridge-ping' })
    timerIds.retry = window.setInterval(() => {
      if (bridgeReady) sendImport()
      else postToCanvas({ type: 'naonao-embed-bridge-ping' })
    }, 500)
    timerIds.timeout = window.setTimeout(() => {
      if (completed) return
      stopDelivery()
      setAgentError('无法导入 API Key 到无限画布：画布未确认接收，请重试。')
    }, 10_000)
    return () => {
      stopDelivery()
      window.removeEventListener('message', handleImportResult)
    }
  }, [pendingImport, url])

  useEffect(() => {
    if (!window.electronAPI) return
    if (!storagePathApi) {
      setStorageError('本地存储目录功能需要重启软件后使用。')
      return
    }
    void storagePathApi
      .getInfiniteCanvasStoragePath()
      .then(setStoragePath)
      .catch(() => {
        setStorageError('无法读取本地存储目录。')
      })
  }, [storagePathApi])

  const chooseStoragePath = useCallback(async () => {
    if (!storagePathApi || selectingStoragePath) return
    setSelectingStoragePath(true)
    setStorageError(null)
    try {
      const result = await storagePathApi.chooseInfiniteCanvasStoragePath()
      if (!result.canceled && result.path) {
        setStoragePath(result.path)
        setStorageRestartRequired(result.requiresRestart === true)
      }
    } catch {
      setStorageError('无法设置本地存储目录。')
    } finally {
      setSelectingStoragePath(false)
    }
  }, [selectingStoragePath, storagePathApi])

  return (
    <Page title="Infinite Canvas">
      <div className="flex h-full min-h-0 flex-col bg-chatbox-background-primary">
        <CanvasAgentBroker allowSkills={allowSkills} allowMcp={allowMcp} />
        <div className="shrink-0 border-b border-chatbox-border-primary px-4 py-3">
          <Group align="end" gap="sm" wrap="wrap" mb="sm">
            <TextInput
              className="min-w-[260px] flex-1"
              label="本地存储目录"
              value={storagePath}
              readOnly
              placeholder="使用应用默认目录"
            />
            <Button
              variant="default"
              leftSection={<IconFolder size={16} />}
              loading={selectingStoragePath}
              disabled={!storagePathApi}
              onClick={() => void chooseStoragePath()}
            >
              选择目录
            </Button>
            {storageRestartRequired && (
              <Button
                color="orange"
                leftSection={<IconRotateClockwise size={16} />}
                onClick={() => void window.electronAPI?.invoke('relaunch')}
              >
                重启后生效
              </Button>
            )}
          </Group>
          {storageError && (
            <Alert mb="sm" color="red" icon={<IconAlertCircle size={18} />}>
              {storageError}
            </Alert>
          )}
          <Group align="center" gap="sm" wrap="wrap">
            <Text size="sm">
              {agentModel
                ? `内置 Agent 已使用文本模型：${agentModel}`
                : '内置 Agent 将自动使用 NaoNaoAI Chat 当前文本模型'}
            </Text>
            <Button
              variant="default"
              leftSection={<IconRefresh size={16} />}
              onClick={() => setCanvasRevision((revision) => revision + 1)}
            >
              重新连接 Agent
            </Button>
          </Group>
          <Group mt="xs" gap="lg">
            <Switch
              checked={allowSkills}
              label="使用已启用技能"
              onChange={(event) => setAllowSkills(event.currentTarget.checked)}
            />
            <Switch
              checked={allowMcp}
              label="允许 MCP 工具（每次调用前确认）"
              onChange={(event) => setAllowMcp(event.currentTarget.checked)}
            />
            {agentError && (
              <Text c="red" size="sm">
                {agentError}
              </Text>
            )}
          </Group>
        </div>
        {url ? (
          <iframe
            key={url}
            title="Infinite Canvas"
            src={url}
            className="block min-h-0 flex-1 w-full border-0"
            sandbox="allow-downloads allow-forms allow-modals allow-same-origin allow-scripts"
            referrerPolicy="no-referrer"
            ref={iframeRef}
            onLoad={() => {
              iframeRef.current?.contentWindow?.postMessage({ type: 'naonao-embed-bridge-ping' }, new URL(url).origin)
            }}
          />
        ) : error ? (
          <Center h="100%" p="md">
            <Stack align="center" gap="md" maw={420}>
              <Alert color="red" icon={<IconAlertCircle size={18} />} title="无限画布">
                {error}
              </Alert>
              <Button leftSection={<IconRefresh size={16} />} onClick={loadCanvas}>
                Retry
              </Button>
            </Stack>
          </Center>
        ) : (
          <Center h="100%">
            <Stack align="center" gap="xs">
              <Loader size="sm" />
              <Text c="dimmed" size="sm">
                正在加载无限画布...
              </Text>
            </Stack>
          </Center>
        )}
      </div>
    </Page>
  )
}
