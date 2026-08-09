import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import type { Sub2ApiApiKeySummary, Sub2ApiProviderBinding } from '@shared/sub2api/contracts'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { ModelProviderEnum } from '@shared/types'
import {
  IconAlertCircle,
  IconCheck,
  IconCopy,
  IconLink,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PopoverConfirm from '@/components/common/PopoverConfirm'
import { router } from '@/router'
import { createSession } from '@/stores/chatStore'
import { setPendingInfiniteCanvasImport } from '@/stores/infiniteCanvasImportStore'
import { switchCurrentSession } from '@/stores/sessionActions'
import { initEmptyChatSession } from '@/stores/sessionHelpers'
import { settingsStore } from '@/stores/settingsStore'
import { buildSub2ApiProviderSettings } from './sub2api-provider-binding'

interface Props {
  api: Sub2ApiRendererApi
  onBindProvider?: (binding: Sub2ApiProviderBinding) => void
}

function safeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback
  }
  const message = error.message
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .replace(/^Error: /, '')
    .trim()
  return message ? message.slice(0, 240) : fallback
}

export default function Sub2ApiKeySettings({ api, onBindProvider }: Props) {
  const { t } = useTranslation()
  const [keys, setKeys] = useState<Sub2ApiApiKeySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [formKey, setFormKey] = useState<Sub2ApiApiKeySummary | null | undefined>(undefined)
  const [formName, setFormName] = useState('')
  const [formGroupId, setFormGroupId] = useState<string | null>(null)
  const [groups, setGroups] = useState<{ id: number; name: string; platform: string }[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [importKey, setImportKey] = useState<Sub2ApiApiKeySummary | null>(null)
  const [importCapability, setImportCapability] = useState<'text' | 'image' | 'video'>('text')
  const [importing, setImporting] = useState(false)

  const loadKeys = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const page = await api.listApiKeys()
      setKeys(page.items)
    } catch (loadError) {
      setError(safeError(loadError, t('Unable to load API keys.')))
    } finally {
      setLoading(false)
    }
  }, [api, t])

  useEffect(() => {
    void loadKeys()
  }, [loadKeys])

  const openKeyForm = async (key: Sub2ApiApiKeySummary | null) => {
    setFormKey(key)
    setFormName(key?.name ?? '')
    setFormGroupId(key?.group_id?.toString() ?? null)
    setError(null)
    setLoadingGroups(true)
    const getAvailableGroups = api.getAvailableGroups
    if (typeof getAvailableGroups !== 'function') {
      setGroups([])
      setError(t('Group selection needs an app restart. Please restart and try again.'))
      setLoadingGroups(false)
      return
    }
    try {
      setGroups(await getAvailableGroups.call(api))
    } catch (loadError) {
      setError(safeError(loadError, t('Unable to load groups.')))
    } finally {
      setLoadingGroups(false)
    }
  }

  const saveKey = async (event: FormEvent) => {
    event.preventDefault()
    if (!formName.trim() || !formGroupId || saving) {
      return
    }
    const request = { name: formName.trim(), group_id: Number(formGroupId) }
    setSaving(true)
    setError(null)
    try {
      if (formKey) {
        const updated = await api.updateApiKey(formKey.id, request)
        setKeys((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      } else {
        const created = await api.createApiKey(request)
        setKeys((current) => [created, ...current])
      }
      setFormKey(undefined)
      setFormName('')
      setFormGroupId(null)
    } catch (saveError) {
      setError(safeError(saveError, formKey ? t('Unable to update API key.') : t('Unable to create API key.')))
    } finally {
      setSaving(false)
    }
  }

  const copyApiKey = async (key: Sub2ApiApiKeySummary) => {
    if (busyId !== null) {
      return
    }
    setBusyId(key.id)
    setError(null)
    try {
      await api.copyApiKey(key.id)
      setCopiedId(key.id)
      setNotice(t('API key copied to clipboard.'))
    } catch (copyError) {
      setError(safeError(copyError, t('Unable to copy API key.')))
    } finally {
      setBusyId(null)
    }
  }

  const deleteKey = async (key: Sub2ApiApiKeySummary) => {
    if (busyId !== null) {
      return
    }
    setBusyId(key.id)
    setError(null)
    try {
      await api.deleteApiKey(key.id)
      setKeys((current) => current.filter((item) => item.id !== key.id))
    } catch (deleteError) {
      setError(safeError(deleteError, t('Unable to delete API key.')))
    } finally {
      setBusyId(null)
    }
  }

  const bindProvider = async (key: Sub2ApiApiKeySummary) => {
    if (busyId !== null) {
      return
    }
    setBusyId(key.id)
    setError(null)
    setNotice(null)
    try {
      const binding = await api.prepareProviderBinding(key.id)
      settingsStore.setState((currentSettings) => buildSub2ApiProviderSettings(currentSettings, binding))
      onBindProvider?.(binding)

      const initialSession = initEmptyChatSession()
      const firstModelId = binding.models[0]?.id
      const newSession = await createSession({
        ...initialSession,
        settings: {
          ...initialSession.settings,
          provider: ModelProviderEnum.OpenAI,
          ...(firstModelId ? { modelId: firstModelId } : {}),
        },
      })
      switchCurrentSession(newSession.id)
      setNotice(t('Provider connected with {{count}} models.', { count: binding.models.length }))
    } catch (bindError) {
      setError(safeError(bindError, t('Unable to connect provider.')))
    } finally {
      setBusyId(null)
    }
  }

  const importToInfiniteCanvas = async () => {
    if (!importKey || importing) return
    setImporting(true)
    setError(null)
    try {
      const payload = await api.prepareInfiniteCanvasImport(importKey.id, importCapability)
      setPendingInfiniteCanvasImport(payload)
      setImportKey(null)
      await router.navigate({ to: '/infinite-canvas' })
    } catch (importError) {
      setError(safeError(importError, t('Unable to import API key to Infinite Canvas.')))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text fw={600}>{t('API Keys')}</Text>
        <Group gap="xs">
          <Tooltip label={t('Refresh API Keys')}>
            <ActionIcon variant="subtle" aria-label={t('Refresh API Keys')} onClick={() => void loadKeys()}>
              <IconRefresh size={17} />
            </ActionIcon>
          </Tooltip>
          <Button
            size="compact-sm"
            variant="light"
            leftSection={<IconPlus size={15} />}
            onClick={() => void openKeyForm(null)}
          >
            {t('Create API Key')}
          </Button>
        </Group>
      </Group>

      {formKey !== undefined && (
        <Stack component="form" onSubmit={saveKey} gap="sm">
          <TextInput
            label={t('Key name')}
            value={formName}
            onChange={(event) => setFormName(event.currentTarget.value)}
            maxLength={100}
            required
          />
          <Select
            label={String(t('Group'))}
            aria-label={String(t('Group'))}
            placeholder={String(loadingGroups ? t('Loading groups...') : t('Select a group'))}
            data={groups.map((group) => ({ value: String(group.id), label: `${group.name} (${group.platform})` }))}
            value={formGroupId}
            onChange={setFormGroupId}
            disabled={loadingGroups || groups.length === 0}
            nothingFoundMessage={String(t('No available groups'))}
            required
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setFormKey(undefined)
                setFormName('')
                setFormGroupId(null)
              }}
            >
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={saving} disabled={!formName.trim() || !formGroupId || loadingGroups}>
              {formKey ? t('Save') : t('Create')}
            </Button>
          </Group>
        </Stack>
      )}

      <Modal
        opened={importKey !== null}
        onClose={() => {
          if (!importing) setImportKey(null)
        }}
        title={t('Import to Infinite Canvas')}
        centered
      >
        <Stack gap="md">
          <Text size="sm">{t('Choose the model type to import.')}</Text>
          <SegmentedControl
            fullWidth
            value={importCapability}
            onChange={(value) => setImportCapability(value as 'text' | 'image' | 'video')}
            data={[
              { label: t('Text model'), value: 'text' },
              { label: t('Image model'), value: 'image' },
              { label: t('Video model'), value: 'video' },
            ]}
          />
          <Group justify="flex-end">
            <Button variant="default" disabled={importing} onClick={() => setImportKey(null)}>
              {t('Cancel')}
            </Button>
            <Button loading={importing} onClick={() => void importToInfiniteCanvas()}>
              {t('Import')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {error && (
        <Alert color="red" icon={<IconAlertCircle size={18} />}>
          {error}
        </Alert>
      )}
      {notice && <Alert color="green">{notice}</Alert>}

      {loading ? (
        <Center mih={100}>
          <Loader size="sm" aria-label={String(t('Loading'))} />
        </Center>
      ) : keys.length === 0 ? (
        <Text c="dimmed" size="sm">
          {t('No API keys')}
        </Text>
      ) : (
        <Stack gap={0}>
          {keys.map((key) => (
            <Group
              key={key.id}
              justify="space-between"
              align="center"
              py="sm"
              gap="md"
              style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
            >
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" flex={1} miw={0}>
                <Stack gap={2} miw={0}>
                  <Text c="dimmed" size="xs">
                    {t('Key name')}
                  </Text>
                  <Text fw={500} truncate>
                    {key.name}
                  </Text>
                </Stack>
                <Stack gap={2} miw={0}>
                  <Text c="dimmed" size="xs">
                    {t('API Key')}
                  </Text>
                  <Group gap="xs" wrap="nowrap">
                    <Text c="dimmed" size="xs" ff="monospace" truncate>
                      {key.key_hint}
                    </Text>
                    <Tooltip label={t(copiedId === key.id ? 'Copied' : 'Copy API key')}>
                      <ActionIcon
                        variant="subtle"
                        aria-label={t('Copy API key')}
                        disabled={busyId !== null}
                        onClick={() => void copyApiKey(key)}
                      >
                        {copiedId === key.id ? <IconCheck size={16} /> : <IconCopy size={16} />}
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Stack>
                <Stack gap={2}>
                  <Text c="dimmed" size="xs">
                    {t('Usage')}
                  </Text>
                  <Text size="sm" fw={500} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    ${key.quota_used.toFixed(4)} / {key.quota > 0 ? `$${key.quota.toFixed(4)}` : t('Unlimited')}
                  </Text>
                </Stack>
              </SimpleGrid>

              <Group gap="xs" wrap="wrap" justify="flex-end">
                <Tooltip label={t('Edit')}>
                  <ActionIcon
                    variant="subtle"
                    aria-label={t('Edit')}
                    disabled={busyId !== null}
                    onClick={() => void openKeyForm(key)}
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                </Tooltip>
                <PopoverConfirm
                  title={t('Delete this API Key?')}
                  confirmButtonColor="red"
                  onConfirm={() => void deleteKey(key)}
                >
                  <Tooltip label={t('Delete')}>
                    <ActionIcon variant="subtle" color="red" aria-label={t('Delete')} disabled={busyId !== null}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </PopoverConfirm>
                <Button
                  size="compact-sm"
                  variant="light"
                  leftSection={<IconLink size={15} />}
                  loading={busyId === key.id}
                  disabled={busyId !== null || key.status !== 'active'}
                  onClick={() => void bindProvider(key)}
                >
                  {t('Use for chat')}
                </Button>
                <Button
                  size="compact-sm"
                  variant="default"
                  leftSection={<IconUpload size={15} />}
                  disabled={busyId !== null || key.status !== 'active'}
                  onClick={() => {
                    setImportCapability('text')
                    setImportKey(key)
                  }}
                >
                  {t('Import to Infinite Canvas')}
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
