import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import type { Sub2ApiApiKeySummary, Sub2ApiProviderBinding } from '@shared/sub2api/contracts'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import {
  IconAlertCircle,
  IconCheck,
  IconLink,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PopoverConfirm from '@/components/common/PopoverConfirm'
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
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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

  const createKey = async (event: FormEvent) => {
    event.preventDefault()
    if (!newName.trim() || creating) {
      return
    }
    setCreating(true)
    setError(null)
    try {
      const created = await api.createApiKey({ name: newName.trim() })
      setKeys((current) => [created, ...current])
      setNewName('')
      setShowCreate(false)
    } catch (createError) {
      setError(safeError(createError, t('Unable to create API key.')))
    } finally {
      setCreating(false)
    }
  }

  const updateKey = async (key: Sub2ApiApiKeySummary, update: { name?: string; status?: 'active' | 'inactive' }) => {
    if (busyId !== null) {
      return
    }
    setBusyId(key.id)
    setError(null)
    try {
      const updated = await api.updateApiKey(key.id, update)
      setKeys((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setEditingId(null)
      setEditingName('')
    } catch (updateError) {
      setError(safeError(updateError, t('Unable to update API key.')))
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
      if (onBindProvider) {
        onBindProvider(binding)
      } else {
        settingsStore.setState((currentSettings) => buildSub2ApiProviderSettings(currentSettings, binding))
      }
      setNotice(t('Provider connected with {{count}} models.', { count: binding.models.length }))
    } catch (bindError) {
      setError(safeError(bindError, t('Unable to connect provider.')))
    } finally {
      setBusyId(null)
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
            onClick={() => setShowCreate((value) => !value)}
          >
            {t('Create API Key')}
          </Button>
        </Group>
      </Group>

      {showCreate && (
        <Group component="form" onSubmit={createKey} align="flex-end" wrap="nowrap">
          <TextInput
            label={t('Key name')}
            value={newName}
            onChange={(event) => setNewName(event.currentTarget.value)}
            maxLength={100}
            required
            flex={1}
          />
          <Button type="submit" loading={creating} disabled={!newName.trim()}>
            {t('Create')}
          </Button>
        </Group>
      )}

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
              <Stack gap={3} flex={1} miw={0}>
                {editingId === key.id ? (
                  <Group
                    component="form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void updateKey(key, { name: editingName.trim() })
                    }}
                    gap="xs"
                    wrap="nowrap"
                  >
                    <TextInput
                      aria-label={String(t('Key name'))}
                      value={editingName}
                      onChange={(event) => setEditingName(event.currentTarget.value)}
                      maxLength={100}
                      size="xs"
                      flex={1}
                    />
                    <ActionIcon type="submit" aria-label={t('Save')} disabled={!editingName.trim()}>
                      <IconCheck size={15} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={t('Cancel')}
                      onClick={() => setEditingId(null)}
                    >
                      <IconX size={15} />
                    </ActionIcon>
                  </Group>
                ) : (
                  <Group gap="xs" wrap="nowrap">
                    <Text fw={500} truncate>
                      {key.name}
                    </Text>
                    <Badge color={key.status === 'active' ? 'green' : 'gray'} variant="light" size="sm">
                      {t(key.status === 'active' ? 'Active' : 'Disabled')}
                    </Badge>
                  </Group>
                )}
                <Text c="dimmed" size="xs" ff="monospace">
                  {key.key_hint}
                </Text>
              </Stack>

              <Group gap="xs" wrap="nowrap">
                <Switch
                  size="sm"
                  checked={key.status === 'active'}
                  disabled={busyId !== null}
                  aria-label={String(t('Toggle API Key'))}
                  onChange={(event) =>
                    void updateKey(key, { status: event.currentTarget.checked ? 'active' : 'inactive' })
                  }
                />
                <Tooltip label={t('Edit')}>
                  <ActionIcon
                    variant="subtle"
                    aria-label={t('Edit')}
                    disabled={busyId !== null}
                    onClick={() => {
                      setEditingId(key.id)
                      setEditingName(key.name)
                    }}
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
                  {t('Bind to Chatbox')}
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
