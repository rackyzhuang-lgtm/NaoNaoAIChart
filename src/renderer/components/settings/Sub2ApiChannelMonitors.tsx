import { ActionIcon, Alert, Badge, Group, Loader, Paper, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core'
import type { Sub2ApiChannelMonitor, Sub2ApiChannelMonitorResponse } from '@shared/sub2api/contracts'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { IconAlertCircle, IconRefresh, IconTimeline } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  api: Sub2ApiRendererApi
  availableChannelsEnabled?: boolean
  channelMonitorEnabled?: boolean
}

function statusColor(status: string): string {
  if (status === 'operational') return 'green'
  if (status === 'degraded') return 'yellow'
  if (status === 'error') return 'red'
  return 'gray'
}

function statusLabel(status: string, t: (key: string) => string): string {
  if (status === 'operational') return t('Operational')
  if (status === 'degraded') return t('Degraded')
  if (status === 'error') return t('Unavailable')
  return t('Unknown')
}

function formatLatency(value: number | null | undefined): string {
  return value === undefined || value === null ? '-' : `${Math.round(value)} ms`
}

function ChannelItem({ item }: { item: Sub2ApiChannelMonitor }) {
  const { t } = useTranslation()
  return (
    <Paper withBorder radius="sm" p="md">
      <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Text fw={600} truncate="end">
            {item.name}
          </Text>
          <Text size="xs" c="dimmed" mt={3}>
            {item.provider} · {item.primary_model}
          </Text>
        </div>
        <Badge color={statusColor(item.primary_status)} variant="light">
          {statusLabel(item.primary_status, t)}
        </Badge>
      </Group>
      <SimpleGrid cols={2} spacing="sm" mt="md">
        <div>
          <Text size="xs" c="dimmed">
            {t('Primary latency')}
          </Text>
          <Text size="sm" fw={600} ff="monospace">
            {formatLatency(item.primary_latency_ms)}
          </Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            {t('7-day availability')}
          </Text>
          <Text size="sm" fw={600} ff="monospace">
            {item.availability_7d === undefined || item.availability_7d === null
              ? '-'
              : `${item.availability_7d.toFixed(1)}%`}
          </Text>
        </div>
      </SimpleGrid>
    </Paper>
  )
}

export default function Sub2ApiChannelMonitors({
  api,
  availableChannelsEnabled = true,
  channelMonitorEnabled = true,
}: Props) {
  const { t } = useTranslation()
  const [data, setData] = useState<Sub2ApiChannelMonitorResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    if (!channelMonitorEnabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    setFailed(false)
    try {
      setData(await api.getChannelMonitors())
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [api, channelMonitorEnabled])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group gap="sm">
          <IconTimeline size={19} />
          <Text fw={600}>{t('Available channels')}</Text>
        </Group>
        <Tooltip label={t('Refresh channels')}>
          <ActionIcon
            variant="subtle"
            aria-label={t('Refresh channels')}
            onClick={() => void load()}
            disabled={loading}
          >
            <IconRefresh size={17} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {!availableChannelsEnabled && (
        <Alert color="yellow">{t('Channel selection is not enabled by the service.')}</Alert>
      )}
      {!channelMonitorEnabled && <Alert color="gray">{t('Channel monitoring is not enabled by the service.')}</Alert>}
      {failed && (
        <Alert icon={<IconAlertCircle size={17} />} color="red">
          {t('Unable to load channel status.')}
        </Alert>
      )}
      {loading && (
        <Group justify="center" py="md">
          <Loader size="sm" aria-label={String(t('Loading'))} />
        </Group>
      )}
      {!loading && !failed && data?.items.length === 0 && <Text c="dimmed">{t('No channel status available')}</Text>}
      {!loading && !failed && data && data.items.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {data.items.map((item) => (
            <ChannelItem item={item} key={item.id} />
          ))}
        </SimpleGrid>
      )}
    </Stack>
  )
}
