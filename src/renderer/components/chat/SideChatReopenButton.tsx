import { ActionIcon, Menu, Tooltip } from '@mantine/core'
import { IconLayoutSidebarRight } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { ScalableIcon } from '@/components/common/ScalableIcon'

export type ReopenableSideChat = { sessionId: string; label: string }

export default function SideChatReopenButton({
  sideChats,
  selectedSessionId,
  onOpen,
}: {
  sideChats: ReopenableSideChat[]
  selectedSessionId?: string
  onOpen(sessionId: string): void
}) {
  const { t } = useTranslation()
  const label = t('Open Side Chat')
  const button = (
    <ActionIcon className="controls" variant="subtle" color="chatbox-tertiary" aria-label={label}>
      <ScalableIcon icon={IconLayoutSidebarRight} size={18} />
    </ActionIcon>
  )

  if (sideChats.length === 1) {
    return (
      <Tooltip label={label}>
        <ActionIcon
          className="controls"
          variant="subtle"
          color="chatbox-tertiary"
          aria-label={label}
          onClick={() => onOpen(sideChats[0].sessionId)}
        >
          <ScalableIcon icon={IconLayoutSidebarRight} size={18} />
        </ActionIcon>
      </Tooltip>
    )
  }

  return (
    <Menu position="bottom-end" withinPortal shadow="md" width={220}>
      <Menu.Target>{button}</Menu.Target>
      <Menu.Dropdown>
        {sideChats.map((sideChat) => (
          <Menu.Item
            key={sideChat.sessionId}
            disabled={sideChat.sessionId === selectedSessionId}
            onClick={() => onOpen(sideChat.sessionId)}
          >
            {sideChat.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}
