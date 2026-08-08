import { Alert, Button, Center, Group, Loader, PasswordInput, Stack, Switch, Text, TextInput } from '@mantine/core'
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import Page from '@/components/layout/Page'
import { CHATBOX_BUILD_TARGET } from '@/variables'
import { CanvasAgentBroker } from '@/components/infinite-canvas/CanvasAgentBroker'

export const Route = createFileRoute('/infinite-canvas/')({
  component: InfiniteCanvasPage,
})

function InfiniteCanvasPage() {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [apiUrl, setApiUrl] = useState('https://naonaoai.shop')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [agentError, setAgentError] = useState<string | null>(null)
  const [savingAgent, setSavingAgent] = useState(false)
  const [allowSkills, setAllowSkills] = useState(true)
  const [allowMcp, setAllowMcp] = useState(false)
  const [canvasRevision, setCanvasRevision] = useState(0)

  const loadCanvas = useCallback(() => {
    setError(null)
    setUrl(null)
    if (CHATBOX_BUILD_TARGET === 'mobile_app' || !window.electronAPI) {
      setError('Infinite Canvas is available in the desktop app only.')
      return
    }
    void window.electronAPI
      .getInfiniteCanvasUrl()
      .then(async (canvasUrl) => {
        const parsed = new URL(canvasUrl)
        if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1') {
          throw new Error('Invalid canvas origin')
        }
        const connection = await window.electronAPI.getInfiniteCanvasAgentConnection()
        const agentUrl = new URL(canvasUrl)
        agentUrl.searchParams.set('agentUrl', connection.endpoint)
        agentUrl.searchParams.set('agentToken', connection.token)
        agentUrl.searchParams.set('revision', String(canvasRevision))
        setUrl(agentUrl.toString())
      })
      .catch(() => setError('Infinite Canvas could not be loaded.'))
  }, [canvasRevision])

  useEffect(() => {
    loadCanvas()
  }, [loadCanvas])

  const configureAgent = useCallback(async () => {
    if (!window.electronAPI || !apiKey.trim()) {
      setAgentError('Enter an API key before connecting the Canvas Agent.')
      return
    }
    setSavingAgent(true)
    setAgentError(null)
    try {
      await window.electronAPI.configureInfiniteCanvasAgent({ baseUrl: apiUrl, apiKey, model })
      setApiKey('')
      setCanvasRevision((revision) => revision + 1)
    } catch {
      setAgentError('The API URL, key, or model could not be configured.')
    } finally {
      setSavingAgent(false)
    }
  }, [apiKey, apiUrl, model])

  return (
    <Page title="Infinite Canvas">
      <div className="flex h-full min-h-0 flex-col bg-chatbox-background-primary">
        <CanvasAgentBroker allowSkills={allowSkills} allowMcp={allowMcp} />
        <div className="shrink-0 border-b border-chatbox-border-primary px-4 py-3">
          <Group align="end" gap="sm" wrap="wrap">
            <TextInput
              className="min-w-[220px] flex-1"
              label="Agent API URL"
              value={apiUrl}
              onChange={(event) => setApiUrl(event.currentTarget.value)}
            />
            <PasswordInput
              className="min-w-[220px] flex-1"
              label="API Key"
              value={apiKey}
              onChange={(event) => setApiKey(event.currentTarget.value)}
              autoComplete="off"
            />
            <TextInput
              className="min-w-[160px] flex-1"
              label="Model"
              value={model}
              onChange={(event) => setModel(event.currentTarget.value)}
            />
            <Button loading={savingAgent} onClick={() => void configureAgent()}>
              Connect Agent
            </Button>
          </Group>
          <Group mt="xs" gap="lg">
            <Switch
              checked={allowSkills}
              label="Use enabled Skills"
              onChange={(event) => setAllowSkills(event.currentTarget.checked)}
            />
            <Switch
              checked={allowMcp}
              label="Allow enabled MCP tools (confirm every call)"
              onChange={(event) => setAllowMcp(event.currentTarget.checked)}
            />
            {agentError && <Text c="red" size="sm">{agentError}</Text>}
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
          />
        ) : error ? (
          <Center h="100%" p="md">
            <Stack align="center" gap="md" maw={420}>
              <Alert color="red" icon={<IconAlertCircle size={18} />} title="Infinite Canvas">
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
                Loading Infinite Canvas...
              </Text>
            </Stack>
          </Center>
        )}
      </div>
    </Page>
  )
}
