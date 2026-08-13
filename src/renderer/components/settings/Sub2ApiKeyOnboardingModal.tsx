import { Alert, Button, Center, Group, Loader, Modal, Radio, Select, Stack, Text, TextInput } from '@mantine/core'
import type { Sub2ApiApiKeySummary, Sub2ApiProviderBinding } from '@shared/sub2api/contracts'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { IconAlertCircle, IconKey, IconPlus } from '@tabler/icons-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { switchCurrentSession } from '@/stores/sessionActions'
import { applySub2ApiProviderBinding } from './sub2api-provider-binding'

interface Props {
  api: Sub2ApiRendererApi
  opened: boolean
  onClose: () => void
  onApplied?: (binding: Sub2ApiProviderBinding) => void
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

export default function Sub2ApiKeyOnboardingModal({ api, opened, onClose, onApplied }: Props) {
  const { t } = useTranslation()
  const [keys, setKeys] = useState<Sub2ApiApiKeySummary[]>([])
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formName, setFormName] = useState('')
  const [formGroupId, setFormGroupId] = useState<string | null>(null)
  const [groups, setGroups] = useState<{ id: number; name: string; platform: string }[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const bindingInFlight = useRef(false)

  const activeKeys = useMemo(() => keys.filter((key) => key.status === 'active'), [keys])

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true)
    try {
      const availableGroups = await api.getAvailableGroups()
      setGroups(availableGroups)
      setFormGroupId((current) => current ?? availableGroups[0]?.id.toString() ?? null)
    } catch (loadError) {
      setError(safeError(loadError, t('Unable to load groups.')))
    } finally {
      setLoadingGroups(false)
    }
  }, [api, t])

  const loadKeys = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const page = await api.listApiKeys()
      const availableKeys = page.items.filter((key) => key.status === 'active')
      setKeys(page.items)
      setSelectedKeyId(availableKeys[0]?.id.toString() ?? null)
      const needsCreation = availableKeys.length === 0
      setCreating(needsCreation)
      if (needsCreation) {
        await loadGroups()
      }
    } catch (loadError) {
      setError(safeError(loadError, t('Unable to load API keys.')))
    } finally {
      setLoading(false)
    }
  }, [api, loadGroups, t])

  useEffect(() => {
    if (!opened) {
      return
    }
    setFormName('')
    setFormGroupId(null)
    setGroups([])
    setCreating(false)
    void loadKeys()
  }, [loadKeys, opened])

  const openCreation = () => {
    setCreating(true)
    setFormName('')
    setFormGroupId(null)
    setError(null)
    setNotice(null)
    void loadGroups()
  }

  const createKey = async (event: FormEvent) => {
    event.preventDefault()
    if (!formName.trim() || !formGroupId || saving) {
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const created = await api.createApiKey({ name: formName.trim(), group_id: Number(formGroupId) })
      setKeys((current) => [created, ...current.filter((key) => key.id !== created.id)])
      if (created.status === 'active') {
        setSelectedKeyId(created.id.toString())
        setCreating(false)
        setNotice(t('API key created. Apply it to enable chat.'))
      } else {
        setError(t('The new API key is not active and cannot be used for chat.'))
      }
      setFormName('')
      setFormGroupId(null)
    } catch (saveError) {
      setError(safeError(saveError, t('Unable to create API key.')))
    } finally {
      setSaving(false)
    }
  }

  const applySelectedKey = async () => {
    if (!selectedKeyId || bindingInFlight.current) {
      return
    }
    bindingInFlight.current = true
    setApplying(true)
    setError(null)
    setNotice(null)
    try {
      const binding = await api.prepareProviderBinding(Number(selectedKeyId))
      const applied = await applySub2ApiProviderBinding(binding)
      onApplied?.(binding)
      onClose()
      if (applied.sessionId) {
        switchCurrentSession(applied.sessionId)
      }
    } catch (bindError) {
      setError(safeError(bindError, t('Unable to connect provider.')))
    } finally {
      bindingInFlight.current = false
      setApplying(false)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!applying && !saving) {
          onClose()
        }
      }}
      title={t('Set up an API key for chat')}
      centered
      closeOnClickOutside={!applying && !saving}
      closeOnEscape={!applying && !saving}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t('Choose an active API key, or create one before applying it to the current chat.')}
        </Text>

        {error && (
          <Alert color="red" icon={<IconAlertCircle size={18} />}>
            {error}
          </Alert>
        )}
        {notice && <Alert color="green">{notice}</Alert>}

        {loading ? (
          <Center mih={120}>
            <Loader size="sm" aria-label={String(t('Loading'))} />
          </Center>
        ) : creating ? (
          <Stack component="form" onSubmit={createKey} gap="sm">
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
              {activeKeys.length > 0 && (
                <Button variant="default" disabled={saving} onClick={() => setCreating(false)}>
                  {t('Cancel')}
                </Button>
              )}
              <Button type="submit" loading={saving} disabled={!formName.trim() || !formGroupId || loadingGroups}>
                {t('Create API Key')}
              </Button>
            </Group>
          </Stack>
        ) : (
          <>
            <Radio.Group value={selectedKeyId} onChange={setSelectedKeyId} aria-label={String(t('API Keys'))}>
              <Stack gap="xs">
                {activeKeys.map((key) => (
                  <Radio
                    key={key.id}
                    value={key.id.toString()}
                    label={
                      <Stack gap={1}>
                        <Text size="sm" fw={500}>
                          {key.name}
                        </Text>
                        <Text size="xs" c="dimmed" ff="monospace">
                          {key.key_hint}
                        </Text>
                      </Stack>
                    }
                  />
                ))}
              </Stack>
            </Radio.Group>
            <Button variant="subtle" leftSection={<IconPlus size={16} />} onClick={openCreation} w="fit-content">
              {t('Create another API Key')}
            </Button>
            <Group justify="flex-end">
              <Button variant="default" disabled={applying} onClick={onClose}>
                {t('Not now')}
              </Button>
              <Button
                leftSection={<IconKey size={16} />}
                loading={applying}
                disabled={!selectedKeyId}
                onClick={() => void applySelectedKey()}
              >
                {t('Apply to chat')}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  )
}
