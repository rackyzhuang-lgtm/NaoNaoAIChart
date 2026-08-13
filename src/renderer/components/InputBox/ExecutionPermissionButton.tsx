import { Divider, Flex, Popover, Stack, Text, UnstyledButton } from '@mantine/core'
import { type AgentApprovalPolicy, resolveAgentApprovalPolicy } from '@shared/agent-approval-policy'
import { IconCheck, IconShieldLock } from '@tabler/icons-react'
import { type FC, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as chatStore from '@/stores/chatStore'
import { useSessionSettings } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'

interface ExecutionPermissionButtonProps {
  sessionId: string
  iconSize?: number
}

const POLICY_OPTIONS: Array<{
  value: AgentApprovalPolicy
  label: string
  description: string
  danger?: boolean
}> = [
  {
    value: 'ask',
    label: 'Ask for approval',
    description: 'Always ask before external file changes or internet access.',
  },
  {
    value: 'risk',
    label: 'Approve for me',
    description: 'Ask only when a risky operation is detected.',
  },
  {
    value: 'full',
    label: 'Full Access',
    description: 'Skip approval prompts for commands, file changes, and internet access.',
    danger: true,
  },
]

const ExecutionPermissionButton: FC<ExecutionPermissionButtonProps> = ({ sessionId, iconSize = 18 }) => {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)
  const isNewSession = sessionId === 'new'
  const newSessionState = useUIStore((state) => state.newSessionState)
  const setNewSessionState = useUIStore((state) => state.setNewSessionState)
  const { sessionSettings } = useSessionSettings(sessionId)
  const approvalPolicy = resolveAgentApprovalPolicy(isNewSession ? newSessionState : sessionSettings)

  const activeLabel = useMemo(
    () => POLICY_OPTIONS.find((option) => option.value === approvalPolicy)?.label ?? 'Ask for approval',
    [approvalPolicy]
  )

  const updateApprovalPolicy = useCallback(
    async (nextPolicy: AgentApprovalPolicy) => {
      if (nextPolicy === approvalPolicy) return
      if (isNewSession) {
        setNewSessionState((previous) => ({
          ...previous,
          agentApprovalPolicy: nextPolicy,
          agentFullAccess: undefined,
        }))
        return
      }
      try {
        await chatStore.updateSession(sessionId, (session) => {
          if (!session) throw new Error('Session not found')
          return {
            ...session,
            settings: {
              ...session.settings,
              agentApprovalPolicy: nextPolicy,
              agentFullAccess: undefined,
            },
          }
        })
      } catch (error) {
        console.error('Failed to update execution permission:', error)
      }
    },
    [approvalPolicy, isNewSession, sessionId, setNewSessionState]
  )

  const color = approvalPolicy === 'full' ? 'var(--mantine-color-red-6)' : 'var(--chatbox-tint-secondary)'

  return (
    <Popover
      position="top-start"
      withArrow
      shadow="md"
      opened={opened}
      onChange={setOpened}
      transitionProps={{ transition: 'pop', duration: 160 }}
    >
      <Popover.Target>
        <UnstyledButton
          aria-label={t('Execution Permission')}
          title={`${t('Execution Permission')}: ${t(activeLabel)}`}
          onClick={() => setOpened((value) => !value)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg transition-colors hover:bg-[var(--chatbox-background-tertiary)]"
          style={{ color }}
        >
          <IconShieldLock size={iconSize} strokeWidth={1.8} />
          <span className="text-xs font-medium whitespace-nowrap">{t('Execution Permission')}</span>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <Stack gap={0} py="xs" w={280}>
          <Text fw={600} size="sm" px="sm" py="xs">
            {t('Execution Permission')}
          </Text>
          <Divider my={4} />
          {POLICY_OPTIONS.map((option) => {
            const selected = approvalPolicy === option.value
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                className={`w-full border-0 bg-transparent p-0 text-left rounded cursor-pointer ${
                  option.danger
                    ? 'hover:bg-red-50 dark:hover:bg-red-950/30'
                    : 'hover:bg-[var(--mantine-color-gray-0)] dark:hover:bg-[var(--mantine-color-dark-5)]'
                }`}
                onClick={() => void updateApprovalPolicy(option.value)}
              >
                <Flex justify="space-between" align="center" px="sm" py={6} gap="sm">
                  <Stack gap={0} className="min-w-0">
                    <Text size="sm" c={option.danger ? 'red' : selected ? 'chatbox-brand' : undefined} fw={500}>
                      {t(option.label)}
                    </Text>
                    <Text size="xs" c={option.danger ? 'red' : 'chatbox-secondary'} className="leading-snug">
                      {t(option.description)}
                    </Text>
                  </Stack>
                  {selected && (
                    <IconCheck
                      size={14}
                      className={`${option.danger ? 'text-red-600' : 'text-[var(--chatbox-tint-brand)]'} shrink-0`}
                    />
                  )}
                </Flex>
              </button>
            )
          })}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

export default ExecutionPermissionButton
