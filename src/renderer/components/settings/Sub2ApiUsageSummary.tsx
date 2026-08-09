import { Alert, Badge, Group, Loader, Paper, Progress, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core'
import type {
  Sub2ApiSubscriptionSummaryItem,
  Sub2ApiUsageDashboardModels,
  Sub2ApiUsageDashboardStats,
  Sub2ApiUsageDashboardTrend,
  Sub2ApiUsageModelItem,
  Sub2ApiUsageTrendItem,
} from '@shared/sub2api/contracts'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { IconAlertCircle, IconChartBar, IconReceipt } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  api: Sub2ApiRendererApi
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formatCost(value: number): string {
  return `$${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value)}`
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function UsagePeriod({
  label,
  requests,
  tokens,
  actualCost,
}: {
  label: string
  requests: number
  tokens: number
  actualCost: number
}) {
  const { t } = useTranslation()
  return (
    <Paper withBorder radius="sm" p="md">
      <Text fw={600} size="sm" mb="sm">
        {label}
      </Text>
      <SimpleGrid cols={3} spacing="sm">
        <div>
          <Text size="xs" c="dimmed">
            {t('Requests')}
          </Text>
          <Text fw={600}>{formatCompactNumber(requests)}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            {t('Tokens')}
          </Text>
          <Text fw={600}>{formatCompactNumber(tokens)}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            {t('Actual cost')}
          </Text>
          <Text fw={600}>{formatCost(actualCost)}</Text>
        </div>
      </SimpleGrid>
    </Paper>
  )
}

function SubscriptionItem({ subscription }: { subscription: Sub2ApiSubscriptionSummaryItem }) {
  const { t } = useTranslation()
  const windows = [
    { label: t('Daily'), used: subscription.daily_used_usd, limit: subscription.daily_limit_usd },
    { label: t('Weekly'), used: subscription.weekly_used_usd, limit: subscription.weekly_limit_usd },
    { label: t('Monthly'), used: subscription.monthly_used_usd, limit: subscription.monthly_limit_usd },
  ].filter(({ used, limit }) => used !== undefined || limit !== undefined)

  return (
    <Paper withBorder radius="sm" p="md">
      <Group justify="space-between" align="flex-start" gap="sm">
        <div>
          <Text fw={600}>{subscription.group_name || t('Subscription')}</Text>
          {subscription.expires_at && (
            <Text size="xs" c="dimmed" mt={3}>
              {t('Expires')}: {formatDate(subscription.expires_at)}
            </Text>
          )}
        </div>
        <Badge variant="light" color="green">
          {t('Active')}
        </Badge>
      </Group>
      {windows.length > 0 && (
        <Stack gap="sm" mt="md">
          {windows.map(({ label, used = 0, limit }) => {
            const percentage = limit && limit > 0 ? Math.min(100, (used / limit) * 100) : 0
            return (
              <div key={label}>
                <Group justify="space-between" gap="sm" mb={4}>
                  <Text size="xs" c="dimmed">
                    {label}
                  </Text>
                  <Text size="xs" ff="monospace">
                    {limit === null || limit === undefined
                      ? `${formatCost(used)} / ${t('No limit')}`
                      : `${formatCost(used)} / ${formatCost(limit)}`}
                  </Text>
                </Group>
                {limit !== null && limit !== undefined && limit > 0 && (
                  <Progress value={percentage} size="sm" radius="sm" />
                )}
              </div>
            )
          })}
        </Stack>
      )}
    </Paper>
  )
}

function UsageTrendItemView({ item, maxRequests }: { item: Sub2ApiUsageTrendItem; maxRequests: number }) {
  const { t } = useTranslation()
  return (
    <Paper withBorder radius="sm" p="md">
      <Group justify="space-between" gap="sm">
        <Text fw={600}>{formatDate(item.date)}</Text>
        <Text size="xs" c="dimmed">
          {formatCompactNumber(item.requests)} {t('Requests')}
        </Text>
      </Group>
      <Progress value={maxRequests > 0 ? (item.requests / maxRequests) * 100 : 0} size="sm" mt="sm" radius="sm" />
      <Group justify="space-between" gap="sm" mt="sm">
        <Text size="xs" c="dimmed">
          {t('Tokens')}: {formatCompactNumber(item.total_tokens)}
        </Text>
        <Text size="xs" ff="monospace">
          {formatCost(item.actual_cost)}
        </Text>
      </Group>
    </Paper>
  )
}

function UsageModelItemView({ item }: { item: Sub2ApiUsageModelItem }) {
  const { t } = useTranslation()
  return (
    <Paper withBorder radius="sm" p="md">
      <Group justify="space-between" gap="sm" wrap="nowrap">
        <Text fw={600} truncate="end">
          {item.model}
        </Text>
        <Badge variant="light" color="blue">
          {formatCompactNumber(item.requests)} {t('Requests')}
        </Badge>
      </Group>
      <Group justify="space-between" gap="sm" mt="sm">
        <Text size="xs" c="dimmed">
          {t('Tokens')}: {formatCompactNumber(item.total_tokens)}
        </Text>
        <Text size="xs" ff="monospace">
          {formatCost(item.actual_cost)}
        </Text>
      </Group>
    </Paper>
  )
}

export default function Sub2ApiUsageSummary({ api }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [usage, setUsage] = useState<Sub2ApiUsageDashboardStats | null>(null)
  const [subscriptions, setSubscriptions] = useState<Sub2ApiSubscriptionSummaryItem[] | null>(null)
  const [usageTrend, setUsageTrend] = useState<Sub2ApiUsageDashboardTrend | null>(null)
  const [usageModels, setUsageModels] = useState<Sub2ApiUsageDashboardModels | null>(null)
  const [usageFailed, setUsageFailed] = useState(false)
  const [usageTrendFailed, setUsageTrendFailed] = useState(false)
  const [usageModelsFailed, setUsageModelsFailed] = useState(false)
  const [subscriptionsFailed, setSubscriptionsFailed] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    void Promise.allSettled([
      api.getUsageDashboardStats(),
      api.getSubscriptionSummary(),
      api.getUsageDashboardTrend(),
      api.getUsageDashboardModels(),
    ]).then(([usageResult, subscriptionResult, usageTrendResult, usageModelsResult]) => {
      if (!active) {
        return
      }
      if (usageResult.status === 'fulfilled') {
        setUsage(usageResult.value)
        setUsageFailed(false)
      } else {
        setUsage(null)
        setUsageFailed(true)
      }
      if (subscriptionResult.status === 'fulfilled') {
        setSubscriptions(subscriptionResult.value.subscriptions)
        setSubscriptionsFailed(false)
      } else {
        setSubscriptions(null)
        setSubscriptionsFailed(true)
      }
      if (usageTrendResult.status === 'fulfilled') {
        setUsageTrend(usageTrendResult.value)
        setUsageTrendFailed(false)
      } else {
        setUsageTrend(null)
        setUsageTrendFailed(true)
      }
      if (usageModelsResult.status === 'fulfilled') {
        setUsageModels(usageModelsResult.value)
        setUsageModelsFailed(false)
      } else {
        setUsageModels(null)
        setUsageModelsFailed(true)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [api])

  return (
    <Stack gap="md">
      <Group gap="sm">
        <ThemeIcon variant="light" radius="sm">
          <IconChartBar size={18} />
        </ThemeIcon>
        <Text fw={600}>{t('Usage overview')}</Text>
        {loading && <Loader size="xs" aria-label={String(t('Loading'))} />}
      </Group>
      {usageFailed && (
        <Alert icon={<IconAlertCircle size={18} />} color="yellow" title={t('Usage unavailable')}>
          {t('Unable to load usage summary.')}
        </Alert>
      )}
      {usage && (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <UsagePeriod
            label={t('All time')}
            requests={usage.total_requests}
            tokens={usage.total_tokens}
            actualCost={usage.total_actual_cost}
          />
          <UsagePeriod
            label={t('Today')}
            requests={usage.today_requests}
            tokens={usage.today_tokens}
            actualCost={usage.today_actual_cost}
          />
        </SimpleGrid>
      )}

      <Group gap="sm" mt="xs">
        <ThemeIcon variant="light" radius="sm" color="violet">
          <IconChartBar size={18} />
        </ThemeIcon>
        <Text fw={600}>{t('Recent usage trend')}</Text>
      </Group>
      {usageTrendFailed && <Alert color="yellow">{t('Unable to load usage trend.')}</Alert>}
      {usageTrend?.trend.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('No usage trend data')}
        </Text>
      )}
      {usageTrend && usageTrend.trend.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {usageTrend.trend.map((item) => (
            <UsageTrendItemView
              key={`${usageTrend.granularity}-${item.date}`}
              item={item}
              maxRequests={Math.max(...usageTrend.trend.map((trendItem) => trendItem.requests))}
            />
          ))}
        </SimpleGrid>
      )}

      <Group gap="sm" mt="xs">
        <ThemeIcon variant="light" radius="sm" color="orange">
          <IconChartBar size={18} />
        </ThemeIcon>
        <Text fw={600}>{t('Usage by model')}</Text>
      </Group>
      {usageModelsFailed && <Alert color="yellow">{t('Unable to load model usage.')}</Alert>}
      {usageModels?.models.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('No model usage data')}
        </Text>
      )}
      {usageModels && usageModels.models.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {usageModels.models.map((item) => (
            <UsageModelItemView key={item.model} item={item} />
          ))}
        </SimpleGrid>
      )}

      <Group gap="sm" mt="xs">
        <ThemeIcon variant="light" radius="sm" color="teal">
          <IconReceipt size={18} />
        </ThemeIcon>
        <Text fw={600}>{t('Active subscriptions')}</Text>
      </Group>
      {subscriptionsFailed && <Alert color="yellow">{t('Unable to load subscription summary.')}</Alert>}
      {subscriptions?.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('No active subscriptions')}
        </Text>
      )}
      {subscriptions && subscriptions.length > 0 && (
        <Stack gap="sm">
          {subscriptions.map((subscription) => (
            <SubscriptionItem key={subscription.id} subscription={subscription} />
          ))}
        </Stack>
      )}
    </Stack>
  )
}
