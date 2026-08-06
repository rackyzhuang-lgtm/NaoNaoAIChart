import { Alert, Badge, Button, Group, Loader, Paper, Stack, Table, Text, TextInput, ThemeIcon } from '@mantine/core'
import type { Sub2ApiRedeemHistorySummary, Sub2ApiRedeemResult, Sub2ApiUser } from '@shared/sub2api/contracts'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { IconAlertCircle, IconCheck, IconGift, IconHistory } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  api: Sub2ApiRendererApi
  user: Sub2ApiUser
  onUserChange: (user: Sub2ApiUser) => void
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '-'
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value)
}

function formatHistoryValue(item: Sub2ApiRedeemHistorySummary, t: (key: string) => string): string {
  if (item.type.includes('balance')) {
    return `${item.value >= 0 ? '+' : ''}$${formatAmount(item.value)}`
  }
  if (item.type === 'subscription') {
    const days = item.validity_days ?? Math.round(item.value)
    return `${days} ${t('days')}${item.group_name ? ` · ${item.group_name}` : ''}`
  }
  return `${item.value >= 0 ? '+' : ''}${item.value} ${t('requests')}`
}

function formatResultValue(result: Sub2ApiRedeemResult, t: (key: string) => string): string {
  if (result.type.includes('balance')) {
    return `${t('Added')}: $${formatAmount(result.value)}`
  }
  if (result.type === 'subscription') {
    return `${t('Added')}: ${Math.round(result.value)} ${t('days')}`
  }
  return `${t('Added')}: ${result.value} ${t('requests')}`
}

export default function Sub2ApiRedeem({ api, user, onUserChange }: Props) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [result, setResult] = useState<Sub2ApiRedeemResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<Sub2ApiRedeemHistorySummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyFailed, setHistoryFailed] = useState(false)

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      setHistory(await api.getRedeemHistory())
      setHistoryFailed(false)
    } catch {
      setHistory([])
      setHistoryFailed(true)
    } finally {
      setHistoryLoading(false)
    }
  }, [api])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const handleRedeem = async () => {
    const trimmedCode = code.trim()
    if (!trimmedCode || busy) {
      setError(t('Enter a redemption code.'))
      return
    }

    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const redeemResult = await api.redeemCode({ code: trimmedCode })
      setResult(redeemResult)
      setCode('')
      try {
        onUserChange(await api.getCurrentUser())
      } catch {
        // The redemption succeeded even if refreshing the account summary fails.
      }
      await loadHistory()
    } catch {
      setError(t('Unable to redeem code. Check the code and try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack gap="md">
      <Group gap="sm">
        <ThemeIcon variant="light" radius="sm" color="grape">
          <IconGift size={18} />
        </ThemeIcon>
        <Text fw={600}>{t('Redeem code')}</Text>
      </Group>

      <Group align="flex-end">
        <TextInput
          label={t('Redemption code')}
          placeholder={t('Enter your code')}
          value={code}
          onChange={(event) => setCode(event.currentTarget.value.slice(0, 256))}
          disabled={busy}
          miw={220}
          style={{ flex: 1 }}
        />
        <Button
          leftSection={<IconCheck size={17} />}
          loading={busy}
          disabled={!code.trim()}
          onClick={() => void handleRedeem()}
        >
          {t('Redeem')}
        </Button>
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={18} />} color="red">
          {error}
        </Alert>
      )}
      {result && (
        <Alert icon={<IconCheck size={18} />} color="green" title={t('Redemption successful')}>
          <Stack gap={4}>
            <Text size="sm">{result.message}</Text>
            <Text size="sm" fw={600}>
              {formatResultValue(result, t)}
            </Text>
            {result.new_balance !== undefined && (
              <Text size="sm">
                {t('New balance')}: ${formatAmount(result.new_balance)}
              </Text>
            )}
            {result.new_concurrency !== undefined && (
              <Text size="sm">
                {t('New concurrency')}: {result.new_concurrency}
              </Text>
            )}
          </Stack>
        </Alert>
      )}

      <Paper withBorder radius="sm" p="md">
        <Group gap="sm" mb="sm">
          <IconHistory size={18} />
          <Text fw={600}>{t('Redemption history')}</Text>
          <Text size="xs" c="dimmed">
            {user.email}
          </Text>
        </Group>
        {historyLoading && <Loader size="sm" aria-label={String(t('Loading'))} />}
        {historyFailed && (
          <Alert icon={<IconAlertCircle size={18} />} color="yellow">
            {t('Unable to load redemption history.')}
          </Alert>
        )}
        {!historyLoading && !historyFailed && history.length === 0 && (
          <Text size="sm" c="dimmed">
            {t('No redemption history')}
          </Text>
        )}
        {!historyLoading && !historyFailed && history.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <Table withTableBorder striped miw={560}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('Code')}</Table.Th>
                  <Table.Th>{t('Type')}</Table.Th>
                  <Table.Th>{t('Status')}</Table.Th>
                  <Table.Th>{t('Date')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {item.code_hint}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatHistoryValue(item, t)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={item.status === 'used' ? 'green' : 'gray'}>
                        {item.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {formatDate(item.used_at ?? item.created_at)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        )}
      </Paper>
    </Stack>
  )
}
