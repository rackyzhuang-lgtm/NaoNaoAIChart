import { Alert, Badge, Group, Loader, Paper, Progress, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core'
import type {
  Sub2ApiPlatformQuotaItem,
  Sub2ApiSubscriptionSummaryItem,
  Sub2ApiUsageDashboardStats,
} from '@shared/sub2api/contracts'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { IconAlertCircle, IconChartBar, IconGauge, IconReceipt } from '@tabler/icons-react'
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

const platformLabels: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  grok: 'Grok',
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
            <Text size="xs" c="dimmed" mt={2}>
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
                    {limit && limit > 0 ? `${formatCost(used)} / ${formatCost(limit)}` : formatCost(used)}
                  </Text>
                </Group>
                {limit !== undefined && limit > 0 && <Progress value={percentage} size="sm" radius="sm" />}
              </div>
            )
          })}
        </Stack>
      )}
    </Paper>
  )
}

function PlatformQuotaItemView({ quota }: { quota: Sub2ApiPlatformQuotaItem }) {
  const { t } = useTranslation()
  const windows = [
    {
      label: t('Daily'),
      used: quota.daily_usage_usd,
      limit: quota.daily_limit_usd,
      resetsAt: quota.daily_window_resets_at,
    },
    {
      label: t('Weekly'),
      used: quota.weekly_usage_usd,
      limit: quota.weekly_limit_usd,
      resetsAt: quota.weekly_window_resets_at,
    },
    {
      label: t('Monthly'),
      used: quota.monthly_usage_usd,
      limit: quota.monthly_limit_usd,
      resetsAt: quota.monthly_window_resets_at,
    },
  ]
  const name = platformLabels[quota.platform] ?? quota.platform

  return (
    <Paper withBorder radius="sm" p="md">
      <Text fw={600}>{name}</Text>
      <Stack gap="sm" mt="md">
        {windows.map(({ label, used, limit, resetsAt }) => {
          const disabled = limit === 0
          const percentage = limit && limit > 0 ? Math.min(100, (used / limit) * 100) : 0
          return (
            <div key={label}>
              <Group justify="space-between" gap="sm" mb={4}>
                <Text size="xs" c="dimmed">
                  {label}
                </Text>
                <Text size="xs" ff="monospace">
                  {disabled
                    ? t('Quota disabled')
                    : limit === null
                      ? `${formatCost(used)} / ${t('No limit')}`
                      : `${formatCost(used)} / ${formatCost(limit)}`}
                </Text>
              </Group>
              {!disabled && limit !== null && limit > 0 && <Progress value={percentage} size="sm" radius="sm" />}
              {resetsAt && (
                <Text size="xs" c="dimmed" mt={3}>
                  {t('Resets')}: {formatDate(resetsAt)}
                </Text>
              )}
            </div>
          )
        })}
      </Stack>
    </Paper>
  )
}

export default function Sub2ApiUsageSummary({ api }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [usage, setUsage] = useState<Sub2ApiUsageDashboardStats | null>(null)
  const [subscriptions, setSubscriptions] = useState<Sub2ApiSubscriptionSummaryItem[] | null>(null)
  const [platformQuotas, setPlatformQuotas] = useState<Sub2ApiPlatformQuotaItem[] | null>(null)
  const [usageFailed, setUsageFailed] = useState(false)
  const [subscriptionsFailed, setSubscriptionsFailed] = useState(false)
  const [platformQuotasFailed, setPlatformQuotasFailed] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    void Promise.allSettled([api.getUsageDashboardStats(), api.getSubscriptionSummary(), api.getPlatformQuotas()]).then(
      ([usageResult, subscriptionResult, platformQuotasResult]) => {
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
        if (platformQuotasResult.status === 'fulfilled') {
          setPlatformQuotas(platformQuotasResult.value.platform_quotas)
          setPlatformQuotasFailed(false)
        } else {
          setPlatformQuotas(null)
          setPlatformQuotasFailed(true)
        }
        setLoading(false)
      }
    )
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
        <ThemeIcon variant="light" radius="sm" color="teal">
          <IconReceipt size={18} />
        </ThemeIcon>
        <Text fw={600}>{t('Active subscriptions')}</Text>
      </Group>
      {subscriptionsFailed && (
        <Alert icon={<IconAlertCircle size={18} />} color="yellow">
          {t('Unable to load subscription summary.')}
        </Alert>
      )}
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

      <Group gap="sm" mt="xs">
        <ThemeIcon variant="light" radius="sm" color="blue">
          <IconGauge size={18} />
        </ThemeIcon>
        <Text fw={600}>{t('Platform quotas')}</Text>
      </Group>
      {platformQuotasFailed && (
        <Alert icon={<IconAlertCircle size={18} />} color="yellow">
          {t('Unable to load platform quotas.')}
        </Alert>
      )}
      {platformQuotas?.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('No platform quotas configured')}
        </Text>
      )}
      {platformQuotas && platformQuotas.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {platformQuotas.map((quota) => (
            <PlatformQuotaItemView key={quota.platform} quota={quota} />
          ))}
        </SimpleGrid>
      )}
    </Stack>
  )
}
