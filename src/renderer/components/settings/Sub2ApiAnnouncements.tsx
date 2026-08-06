import { ActionIcon, Alert, Badge, Button, Group, Loader, Paper, Stack, Text, Tooltip } from '@mantine/core'
import type { Sub2ApiAnnouncement } from '@shared/sub2api/contracts'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { IconAlertCircle, IconBell, IconCheck, IconChevronDown, IconChevronUp, IconRefresh } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  api: Sub2ApiRendererApi
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function Sub2ApiAnnouncements({ api }: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<Sub2ApiAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [markingId, setMarkingId] = useState<number | null>(null)
  const [markFailedId, setMarkFailedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      setItems(await api.getAnnouncements())
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  const markRead = async (id: number) => {
    setMarkingId(id)
    setMarkFailedId(null)
    try {
      await api.markAnnouncementRead(id)
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, read_at: new Date().toISOString() } : item))
      )
    } catch {
      setMarkFailedId(id)
    } finally {
      setMarkingId(null)
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="sm">
          <IconBell size={19} />
          <Text fw={600}>{t('Announcements')}</Text>
          {items.some((item) => !item.read_at) && (
            <Badge color="red" variant="light">
              {items.filter((item) => !item.read_at).length} {t('Unread')}
            </Badge>
          )}
        </Group>
        <Tooltip label={t('Refresh announcements')}>
          <ActionIcon
            variant="subtle"
            aria-label={t('Refresh announcements')}
            onClick={() => void load()}
            disabled={loading}
          >
            <IconRefresh size={17} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {failed && (
        <Alert icon={<IconAlertCircle size={17} />} color="red">
          {t('Unable to load announcements.')}
        </Alert>
      )}
      {loading && (
        <Group justify="center" py="md">
          <Loader size="sm" aria-label={String(t('Loading'))} />
        </Group>
      )}
      {!loading && !failed && items.length === 0 && <Text c="dimmed">{t('No announcements')}</Text>}
      {!loading &&
        !failed &&
        items.map((item) => {
          const expanded = expandedId === item.id
          const unread = !item.read_at
          return (
            <Paper withBorder radius="sm" p="md" key={item.id}>
              <Group justify="space-between" align="flex-start" gap="sm">
                <div style={{ minWidth: 0 }}>
                  <Group gap="xs">
                    <Text fw={600}>{item.title}</Text>
                    {unread && (
                      <Badge size="xs" color="red" variant="light">
                        {t('Unread')}
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed" mt={3}>
                    {formatDate(item.created_at)}
                  </Text>
                </div>
                <ActionIcon
                  variant="subtle"
                  aria-label={expanded ? t('Collapse announcement') : t('Expand announcement')}
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                >
                  {expanded ? <IconChevronUp size={17} /> : <IconChevronDown size={17} />}
                </ActionIcon>
              </Group>
              <Text size="sm" mt="md" style={{ whiteSpace: 'pre-wrap' }} lineClamp={expanded ? undefined : 3}>
                {item.content}
              </Text>
              {markFailedId === item.id && (
                <Alert color="red" mt="md">
                  {t('Unable to mark this announcement as read.')}
                </Alert>
              )}
              {unread && (
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<IconCheck size={15} />}
                  loading={markingId === item.id}
                  onClick={() => void markRead(item.id)}
                  mt="md"
                >
                  {t('Mark as read')}
                </Button>
              )}
            </Paper>
          )
        })}
    </Stack>
  )
}
