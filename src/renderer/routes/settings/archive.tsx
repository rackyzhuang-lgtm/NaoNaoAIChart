import NiceModal from '@ebay/nice-modal-react'
import {
  ActionIcon,
  Alert,
  Button,
  Flex,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import type { SessionMetaRecord } from '@shared/types'
import { IconArchiveOff, IconInfoCircle, IconTrash } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AssistantAvatar } from '@/components/common/Avatar'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import { runSessionRetentionScan } from '@/services/session-retention'
import { confirmSessionDeletion, deleteSession, restoreSession, useArchivedSessionList } from '@/stores/chatStore'
import { useSettingsStore } from '@/stores/settingsStore'

export const Route = createFileRoute('/settings/archive')({
  component: RouteComponent,
})

export function RouteComponent() {
  const { t } = useTranslation()
  const { archivedSessionMetaList, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useArchivedSessionList()
  const [busySessionIds, setBusySessionIds] = useState<Set<string>>(() => new Set())

  const setSessionBusy = (sessionId: string, busy: boolean) => {
    setBusySessionIds((current) => {
      const next = new Set(current)
      if (busy) {
        next.add(sessionId)
      } else {
        next.delete(sessionId)
      }
      return next
    })
  }

  return (
    <Stack p="md" gap="xl">
      <Stack gap="xxs">
        <Title order={5}>{t('Archived Chats')}</Title>
        <Text size="sm" c="chatbox-tertiary">
          {t('Archived chats are hidden from the chat list. You can restore or permanently delete them here.')}
        </Text>
      </Stack>

      <SessionRetentionSettings />

      {isLoading ? (
        <Flex justify="center" py="xl">
          <Loader size="sm" />
        </Flex>
      ) : archivedSessionMetaList?.length ? (
        <Stack gap={0}>
          {archivedSessionMetaList.map((session) => (
            <ArchivedSessionRow
              key={session.id}
              session={session}
              busy={busySessionIds.has(session.id)}
              setSessionBusy={setSessionBusy}
            />
          ))}
          {hasNextPage && (
            <Flex justify="center" py="md">
              <Button
                variant="subtle"
                color="chatbox-tertiary"
                loading={isFetchingNextPage}
                onClick={() => {
                  void fetchNextPage()
                }}
              >
                {t('Load More')}
              </Button>
            </Flex>
          )}
        </Stack>
      ) : (
        <Stack align="center" gap="sm" py="xl">
          <Text c="chatbox-tertiary">{t('No archived chats')}</Text>
        </Stack>
      )}
    </Stack>
  )
}

type RetentionDiagnostic = Record<string, unknown>

function readDiagnosticCount(result: RetentionDiagnostic, ...keys: string[]) {
  for (const key of keys) {
    const value = result[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }
  return 0
}

function SessionRetentionSettings() {
  const { t } = useTranslation()
  const retention = useSettingsStore((state) => state.sessionRetention)
  const setSettings = useSettingsStore((state) => state.setSettings)
  const [isCleaning, setIsCleaning] = useState(false)
  const [diagnostic, setDiagnostic] = useState<RetentionDiagnostic | null>(null)
  const [cleanupError, setCleanupError] = useState<string>()

  const updateRetention = (patch: Partial<typeof retention>) => {
    setSettings({ sessionRetention: { ...retention, ...patch } })
  }

  const runCleanup = async () => {
    const confirmed = await NiceModal.show('confirm', {
      title: t('Permanently delete expired archived chats?'),
      message: t(
        'This action cannot be undone. Only archived chats that meet the configured deletion rule are removed.'
      ),
      confirmText: t('Delete permanently'),
      danger: true,
    })
    if (confirmed !== true) {
      return
    }

    setIsCleaning(true)
    setDiagnostic(null)
    setCleanupError(undefined)
    try {
      const result = await runSessionRetentionScan({ reason: 'manual', cleanupOnly: true })
      setDiagnostic(result as unknown as RetentionDiagnostic)
    } catch (error) {
      console.error('Failed to run session retention cleanup:', error)
      setCleanupError(String(t('Cleanup could not be completed. No other chats were changed.')))
    } finally {
      setIsCleaning(false)
    }
  }

  const deletedCount = diagnostic ? readDiagnosticCount(diagnostic, 'deleted', 'deletedCount') : 0
  const skippedCount = diagnostic ? readDiagnosticCount(diagnostic, 'skipped', 'skippedCount') : 0

  return (
    <Stack gap="md" className="border-0 border-b border-solid border-chatbox-border-primary" pb="xl">
      <Stack gap="xxs">
        <Title order={5}>{t('Local chat retention')}</Title>
        <Text size="sm" c="chatbox-tertiary">
          {t('Automatically archive and remove chats on this device. Processing runs locally while the app is open.')}
        </Text>
      </Stack>

      <Switch
        label={t('Enable local chat retention')}
        description={t('When disabled, automatic archive and deletion scans do not change chats.')}
        checked={retention.enabled}
        onChange={(event) => updateRetention({ enabled: event.currentTarget.checked })}
      />

      <Stack gap="sm" opacity={retention.enabled ? 1 : 0.6}>
        <Switch
          label={t('Automatically archive inactive chats')}
          checked={retention.autoArchiveEnabled}
          disabled={!retention.enabled}
          onChange={(event) => updateRetention({ autoArchiveEnabled: event.currentTarget.checked })}
        />
        <NumberInput
          label={t('Archive after days of inactivity')}
          value={retention.archiveAfterDays}
          min={1}
          max={3650}
          allowDecimal={false}
          clampBehavior="strict"
          disabled={!retention.enabled || !retention.autoArchiveEnabled}
          onChange={(value) => {
            if (typeof value === 'number') updateRetention({ archiveAfterDays: value })
          }}
        />

        <Switch
          label={t('Automatically delete expired archived chats')}
          checked={retention.autoDeleteEnabled}
          disabled={!retention.enabled}
          onChange={(event) => updateRetention({ autoDeleteEnabled: event.currentTarget.checked })}
        />
        <NumberInput
          label={t('Delete after days')}
          value={retention.deleteAfterDays}
          min={1}
          max={3650}
          allowDecimal={false}
          clampBehavior="strict"
          disabled={!retention.enabled || !retention.autoDeleteEnabled}
          onChange={(value) => {
            if (typeof value === 'number') updateRetention({ deleteAfterDays: value })
          }}
        />
        <Select
          label={t('Calculate deletion age from')}
          value={retention.deleteBasis}
          disabled={!retention.enabled || !retention.autoDeleteEnabled}
          data={[
            { value: 'archivedAt', label: t('Archive date') },
            { value: 'lastActivityAt', label: t('Last activity date') },
          ]}
          onChange={(value) => {
            if (value === 'archivedAt' || value === 'lastActivityAt') updateRetention({ deleteBasis: value })
          }}
        />
      </Stack>

      <Stack gap="xs" align="flex-start">
        <Button
          variant="light"
          color="red"
          loading={isCleaning}
          disabled={!retention.enabled}
          onClick={() => void runCleanup()}
        >
          {t('Clean up expired archived chats now')}
        </Button>
        <Text size="xs" c="chatbox-tertiary">
          {t('This only removes archived chats that meet the current deletion rule.')}
        </Text>
      </Stack>

      {diagnostic && (
        <Alert variant="light" color="green" icon={<IconInfoCircle size={18} />} title={t('Cleanup completed')}>
          {t('{{deleted}} chat(s) deleted; {{skipped}} chat(s) skipped.', {
            deleted: deletedCount,
            skipped: skippedCount,
          })}
        </Alert>
      )}
      {cleanupError && (
        <Alert variant="light" color="red" icon={<IconInfoCircle size={18} />} title={t('Cleanup failed')}>
          {cleanupError}
        </Alert>
      )}
    </Stack>
  )
}

function ArchivedSessionRow({
  session,
  busy,
  setSessionBusy,
}: {
  session: SessionMetaRecord
  busy: boolean
  setSessionBusy: (sessionId: string, busy: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <Flex
      key={session.id}
      align="center"
      gap="sm"
      py="sm"
      className="border-0 border-b border-solid border-chatbox-border-primary"
    >
      <AssistantAvatar
        avatarKey={session.assistantAvatarKey}
        picUrl={session.picUrl}
        sessionType={session.type}
        size="sm"
        type="chat"
        c="chatbox-primary"
      />
      <Text flex={1} lineClamp={1}>
        {session.name}
      </Text>
      <Group gap={4}>
        <Tooltip label={t('Restore')} openDelay={1000} withArrow>
          <ActionIcon
            aria-label={t('Restore')}
            variant="subtle"
            color="chatbox-tertiary"
            loading={busy}
            onClick={async () => {
              setSessionBusy(session.id, true)
              try {
                await restoreSession(session.id)
              } catch (error) {
                console.error('Failed to restore archived session:', error)
                setSessionBusy(session.id, false)
              }
            }}
          >
            <ScalableIcon icon={IconArchiveOff} size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t('Delete')} openDelay={1000} withArrow>
          <ActionIcon
            aria-label={t('Delete')}
            variant="subtle"
            color="red"
            disabled={busy}
            onClick={async () => {
              const confirmed = await NiceModal.show('confirm', {
                title: t('Permanently delete this archived chat?'),
                message: t('This action cannot be undone. The chat and its local data will be permanently deleted.'),
                confirmText: t('Delete permanently'),
                danger: true,
              })
              if (confirmed !== true) {
                return
              }
              if (!(await confirmSessionDeletion(session.id))) {
                return
              }
              setSessionBusy(session.id, true)
              try {
                await deleteSession(session.id)
              } catch (error) {
                console.error('Failed to delete archived session:', error)
                setSessionBusy(session.id, false)
              }
            }}
          >
            <ScalableIcon icon={IconTrash} size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Flex>
  )
}
