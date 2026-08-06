import { Alert, Badge, Group, Loader, NativeSelect, Paper, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import type { Sub2ApiModelPlazaGroup, Sub2ApiModelPlazaModel } from '@shared/sub2api/contracts'
import type { Sub2ApiRendererApi } from '@shared/sub2api/ipc'
import { IconAlertCircle, IconBuildingStore, IconSearch } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  api: Sub2ApiRendererApi
  enabled?: boolean
}

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-'
  return `$${new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value)}`
}

function priceSummary(model: Sub2ApiModelPlazaModel, t: (key: string) => string): string {
  const pricing = model.pricing
  if (!pricing) return t('Pricing unavailable')
  if (pricing.per_request_price !== null && pricing.per_request_price !== undefined) {
    return `${formatPrice(pricing.per_request_price)} / ${t('request')}`
  }
  if (pricing.input_price !== null && pricing.input_price !== undefined) {
    return `${formatPrice(pricing.input_price)} / 1M ${t('input tokens')}`
  }
  return t('Pricing unavailable')
}

function ModelGroup({ group }: { group: Sub2ApiModelPlazaGroup }) {
  const { t } = useTranslation()
  const rate = group.user_rate_multiplier ?? group.rate_multiplier
  return (
    <Paper withBorder radius="sm" p="md">
      <Group justify="space-between" align="flex-start" gap="sm">
        <div>
          <Text fw={600}>{group.name}</Text>
          <Text size="xs" c="dimmed" mt={2}>
            {group.platform}
          </Text>
        </div>
        <Badge variant="light">{rate}x</Badge>
      </Group>
      {group.description && (
        <Text size="sm" c="dimmed" mt="sm" lineClamp={2}>
          {group.description}
        </Text>
      )}
      <Stack gap="xs" mt="md">
        {group.models.map((model) => (
          <Group key={model.name} justify="space-between" gap="sm" wrap="nowrap">
            <Text size="sm" truncate="end">
              {model.name}
            </Text>
            <Text size="xs" c="dimmed" ff="monospace" style={{ flexShrink: 0 }}>
              {priceSummary(model, t)}
            </Text>
          </Group>
        ))}
      </Stack>
    </Paper>
  )
}

export default function Sub2ApiModelPlaza({ api, enabled = true }: Props) {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<Sub2ApiModelPlazaGroup[]>([])
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(enabled)
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState('')
  const [platform, setPlatform] = useState('all')

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setFailed(false)
    void api
      .getModelPlaza()
      .then((result) => {
        if (!active) return
        setGroups(result.groups)
        setDescription(result.description ?? '')
      })
      .catch(() => {
        if (active) setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [api, enabled])

  const platformOptions = useMemo(
    () => [
      { value: 'all', label: t('All platforms') },
      ...Array.from(new Set(groups.map((group) => group.platform)))
        .sort()
        .map((value) => ({ value, label: value })),
    ],
    [groups, t]
  )
  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase()
    return groups
      .filter((group) => platform === 'all' || group.platform === platform)
      .map((group) => ({
        ...group,
        models: term ? group.models.filter((model) => model.name.toLowerCase().includes(term)) : group.models,
      }))
      .filter((group) => group.models.length > 0)
  }, [groups, platform, search])

  return (
    <Stack gap="md">
      <Group gap="sm">
        <IconBuildingStore size={19} />
        <Text fw={600}>{t('Model plaza')}</Text>
      </Group>
      {!enabled && <Alert color="yellow">{t('The model plaza is not enabled by the service.')}</Alert>}
      {failed && (
        <Alert icon={<IconAlertCircle size={17} />} color="red">
          {t('Unable to load the model plaza.')}
        </Alert>
      )}
      {loading && (
        <Group justify="center" py="md">
          <Loader size="sm" aria-label={String(t('Loading'))} />
        </Group>
      )}
      {!loading && enabled && !failed && (
        <>
          {description && (
            <Text size="sm" c="dimmed" lineClamp={3}>
              {description}
            </Text>
          )}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              leftSection={<IconSearch size={16} />}
              placeholder={String(t('Search models'))}
              aria-label={String(t('Search models'))}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            <NativeSelect
              aria-label={String(t('Filter by platform'))}
              data={platformOptions}
              value={platform}
              onChange={(event) => setPlatform(event.currentTarget.value)}
            />
          </SimpleGrid>
          {filteredGroups.length === 0 ? (
            <Text c="dimmed">{groups.length === 0 ? t('No models available') : t('No matching models')}</Text>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {filteredGroups.map((group) => (
                <ModelGroup group={group} key={String(group.id)} />
              ))}
            </SimpleGrid>
          )}
        </>
      )}
    </Stack>
  )
}
