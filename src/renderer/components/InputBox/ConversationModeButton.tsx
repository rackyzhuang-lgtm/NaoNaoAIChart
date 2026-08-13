import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Popover,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import {
  IconAlertCircle,
  IconCheck,
  IconListCheck,
  IconMessageCircle,
  IconPlayerPause,
  IconPlayerPlay,
  IconTargetArrow,
  IconTrash,
} from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConversationMode, ThreadGoal } from '../../../shared/types'

type Props = {
  mode: ConversationMode
  goal?: ThreadGoal
  pendingGoalObjective?: string
  iconSize: number
  disabled?: boolean
  onModeChange: (mode: ConversationMode) => void
  onCreateGoal: (objective: string) => Promise<void>
  onPauseGoal: () => Promise<void>
  onResumeGoal: () => Promise<void>
  onCompleteGoal: () => Promise<void>
  onClearGoal: () => Promise<void>
}

function ModeIcon({ mode, size }: { mode: ConversationMode; size: number }) {
  if (mode === 'plan') return <IconListCheck size={size} strokeWidth={1.8} />
  if (mode === 'goal') return <IconTargetArrow size={size} strokeWidth={1.8} />
  return <IconMessageCircle size={size} strokeWidth={1.8} />
}

export default function ConversationModeButton({
  mode,
  goal,
  pendingGoalObjective,
  iconSize,
  disabled,
  onModeChange,
  onCreateGoal,
  onPauseGoal,
  onResumeGoal,
  onCompleteGoal,
  onClearGoal,
}: Props) {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)
  const [objective, setObjective] = useState(pendingGoalObjective ?? '')
  const [goalEditorRequested, setGoalEditorRequested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (pendingGoalObjective !== undefined) setObjective(pendingGoalObjective)
  }, [pendingGoalObjective])

  const label = useMemo(() => {
    if (mode === 'plan') return t('Plan Mode')
    if (mode === 'goal') return t('Goal Mode')
    return t('Default Mode')
  }, [mode, t])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(t('Operation failed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="top-start" width={300} shadow="md" withArrow>
      <Popover.Target>
        <Tooltip label={label} position="top" withArrow>
          <UnstyledButton
            type="button"
            aria-label={label}
            aria-haspopup="dialog"
            aria-expanded={opened}
            disabled={disabled}
            onClick={() => setOpened((value) => !value)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50 ${
              mode === 'default'
                ? 'text-[var(--chatbox-tint-secondary)] hover:bg-[var(--chatbox-background-tertiary)]'
                : 'bg-[var(--chatbox-background-tertiary)] text-[var(--chatbox-tint-brand)]'
            }`}
          >
            <ModeIcon mode={mode} size={iconSize} />
          </UnstyledButton>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown className="max-w-[calc(100vw-24px)]">
        <Stack gap="sm">
          <div>
            <Text size="sm" fw={600}>
              {t('Conversation Mode')}
            </Text>
            <Text size="xs" c="dimmed">
              {t('Choose how the next response should be handled.')}
            </Text>
          </div>

          <SegmentedControl
            fullWidth
            size="xs"
            value={mode}
            disabled={busy || disabled}
            data={[
              { value: 'default', label: t('Default') },
              { value: 'plan', label: t('Plan') },
              { value: 'goal', label: t('Goal') },
            ]}
            onChange={(value) => {
              const nextMode = value as ConversationMode
              if (nextMode === 'goal' && !goal && !pendingGoalObjective) {
                setGoalEditorRequested(true)
              } else {
                onModeChange(nextMode)
              }
            }}
          />

          {mode === 'plan' && (
            <Text size="xs" c="dimmed">
              {t('The assistant will inspect context without execution tools and return a complete implementation plan.')}
            </Text>
          )}

          {(mode === 'goal' || goal || pendingGoalObjective || goalEditorRequested) && (
            <Stack gap="xs">
              {goal || pendingGoalObjective ? (
                <>
                  <Text size="xs" fw={600}>
                    {t('Current Goal')}
                  </Text>
                  <Text size="sm" className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words">
                    {goal?.objective ?? pendingGoalObjective}
                  </Text>
                  {goal && (
                    <Group justify="space-between" gap="xs">
                      <Text size="xs" c="dimmed">
                        {t(`Goal status: ${goal.status}`)}
                      </Text>
                      <Group gap={4}>
                        {goal.status === 'active' ? (
                          <Tooltip label={t('Pause Goal')}>
                            <ActionIcon
                              aria-label={t('Pause Goal')}
                              variant="subtle"
                              disabled={busy}
                              onClick={() => void run(onPauseGoal)}
                            >
                              <IconPlayerPause size={16} />
                            </ActionIcon>
                          </Tooltip>
                        ) : goal.status === 'paused' ? (
                          <Tooltip label={t('Resume Goal')}>
                            <ActionIcon
                              aria-label={t('Resume Goal')}
                              variant="subtle"
                              disabled={busy}
                              onClick={() => void run(onResumeGoal)}
                            >
                              <IconPlayerPlay size={16} />
                            </ActionIcon>
                          </Tooltip>
                        ) : null}
                        {goal.status !== 'complete' && (
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            leftSection={<IconCheck size={14} />}
                            disabled={busy}
                            onClick={() => void run(onCompleteGoal)}
                          >
                            {t('Complete')}
                          </Button>
                        )}
                        <Tooltip label={t('Clear Goal')}>
                          <ActionIcon
                            aria-label={t('Clear Goal')}
                            color="red"
                            variant="subtle"
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm(String(t('Clear this goal? This cannot be undone.')))) {
                                void run(onClearGoal)
                              }
                            }}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Group>
                  )}
                </>
              ) : (
                <>
                  <Textarea
                    label={t('Goal')}
                    value={objective}
                    minRows={3}
                    maxRows={6}
                    maxLength={4000}
                    autosize
                    disabled={busy}
                    onChange={(event) => setObjective(event.currentTarget.value)}
                  />
                  <Button
                    size="xs"
                    leftSection={<IconTargetArrow size={15} />}
                    loading={busy}
                    disabled={!objective.trim()}
                    onClick={() =>
                      void run(async () => {
                        await onCreateGoal(objective)
                        setOpened(false)
                      })
                    }
                  >
                    {t('Start Goal')}
                  </Button>
                </>
              )}
            </Stack>
          )}

          {error && (
            <Alert color="red" icon={<IconAlertCircle size={16} />} p="xs">
              {error}
            </Alert>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
