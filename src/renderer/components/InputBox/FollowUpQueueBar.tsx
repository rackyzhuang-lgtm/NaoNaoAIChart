import type { DragEndEvent } from '@dnd-kit/core'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ActionIcon, Box, Flex, Menu, Text, Textarea, Tooltip } from '@mantine/core'
import type { FollowUpQueueItem, FollowUpQueueScopeStatus } from '@shared/types'
import {
  IconCornerDownRight,
  IconDeviceFloppy,
  IconDots,
  IconEdit,
  IconGripVertical,
  IconLayoutSidebarRight,
  IconPlayerPlay,
  IconPlayerTrackNext,
  IconRouteOff,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import { type CSSProperties, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScalableIcon } from '../common/ScalableIcon'

export type FollowUpQueueBarProps = {
  items: FollowUpQueueItem[]
  status?: FollowUpQueueScopeStatus
  onEdit?(
    itemId: string,
    message: FollowUpQueueItem['userMessage'],
    intent?: FollowUpQueueItem['intent']
  ): void | Promise<void>
  onDelete?(itemId: string): void | Promise<void>
  onReorder?(orderedItemIds: string[]): void | Promise<void>
  onSendNow?(itemId: string): void | Promise<void>
  onOpenSideChat?(itemId: string): void | Promise<void>
  onCloseQueue?(): void | Promise<void>
  onResumeQueue?(): void | Promise<void>
}

export function getFollowUpMessageText(item: FollowUpQueueItem): string {
  return item.userMessage.contentParts
    .filter(
      (part): part is Extract<(typeof item.userMessage.contentParts)[number], { type: 'text' }> => part.type === 'text'
    )
    .map((part) => part.text)
    .join('\n')
}

export function moveFollowUpItemIds(ids: string[], activeId: string, overId: string): string[] {
  const oldIndex = ids.indexOf(activeId)
  const newIndex = ids.indexOf(overId)
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return ids
  return arrayMove(ids, oldIndex, newIndex)
}

export function updateFollowUpMessageText(
  message: FollowUpQueueItem['userMessage'],
  text: string
): FollowUpQueueItem['userMessage'] {
  let updatedTextPart = false
  const contentParts = message.contentParts.map((part) => {
    if (part.type !== 'text' || updatedTextPart) return part
    updatedTextPart = true
    return { ...part, text }
  })
  return {
    ...message,
    contentParts: updatedTextPart ? contentParts : [{ type: 'text', text }, ...contentParts],
  }
}

export default function FollowUpQueueBar({
  items,
  status = 'active',
  onEdit,
  onDelete,
  onReorder,
  onSendNow,
  onOpenSideChat,
  onCloseQueue,
  onResumeQueue,
}: FollowUpQueueBarProps) {
  const { t } = useTranslation()
  const [pendingAction, setPendingAction] = useState<string>()
  const itemIds = items.map((item) => item.id)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  if (items.length === 0) return null

  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over) return
    const nextIds = moveFollowUpItemIds(itemIds, String(event.active.id), String(event.over.id))
    if (nextIds !== itemIds) void onReorder?.(nextIds)
  }

  return (
    <Box
      role="region"
      aria-label={t('Follow-up queue')}
      className="w-full overflow-hidden rounded-md bg-chatbox-background-secondary"
      style={{ border: '1px solid var(--chatbox-border-primary)' }}
    >
      <Flex align="center" justify="space-between" gap="xs" px="sm" mih={34}>
        <Flex align="center" gap={6} className="min-w-0">
          <Text size="xs" fw={600} truncate>
            {t('Follow-up queue')}
          </Text>
          <Text size="xs" c="chatbox-tertiary" className="shrink-0">
            {items.length}
          </Text>
          {status === 'paused' && (
            <Text size="xs" c="chatbox-warning" className="shrink-0">
              {t('Paused')}
            </Text>
          )}
        </Flex>
        <Flex align="center" gap={0}>
          {status === 'paused' && onResumeQueue && (
            <QueueAction
              label={t('Resume queue')}
              disabled={pendingAction === 'resume'}
              onClick={() => void runQueueAction('resume', onResumeQueue, setPendingAction)}
            >
              <ScalableIcon icon={IconPlayerTrackNext} size={15} />
            </QueueAction>
          )}
          {onCloseQueue && (
            <QueueAction
              label={t('Close queue')}
              disabled={pendingAction === 'close'}
              onClick={() => void runQueueAction('close', onCloseQueue, setPendingAction)}
            >
              <ScalableIcon icon={IconRouteOff} size={15} />
            </QueueAction>
          )}
        </Flex>
      </Flex>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableFollowUpItem
              key={item.id}
              item={item}
              onEdit={onEdit}
              onDelete={onDelete}
              onSendNow={onSendNow}
              onOpenSideChat={onOpenSideChat}
            />
          ))}
        </SortableContext>
      </DndContext>
    </Box>
  )
}

function SortableFollowUpItem({
  item,
  onEdit,
  onDelete,
  onSendNow,
  onOpenSideChat,
}: {
  item: FollowUpQueueItem
  onEdit?: FollowUpQueueBarProps['onEdit']
  onDelete?: FollowUpQueueBarProps['onDelete']
  onSendNow?: FollowUpQueueBarProps['onSendNow']
  onOpenSideChat?: FollowUpQueueBarProps['onOpenSideChat']
}) {
  const { t } = useTranslation()
  const text = getFollowUpMessageText(item)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [pendingAction, setPendingAction] = useState<string>()
  const dispatching = item.status === 'dispatching'
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform, transition } = useSortable({
    id: item.id,
    disabled: dispatching,
  })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
  }

  useEffect(() => {
    if (!editing) setDraft(text)
  }, [editing, text])

  const saveEdit = async () => {
    const nextText = draft.trim()
    if (!nextText || nextText === text) {
      setEditing(false)
      setDraft(text)
      return
    }
    await runQueueAction(
      'edit',
      () => onEdit?.(item.id, updateFollowUpMessageText(item.userMessage, nextText)),
      setPendingAction,
      () => setEditing(false)
    )
  }

  return (
    <Flex
      ref={setNodeRef}
      style={{ ...style, borderTop: '1px solid var(--chatbox-border-primary)' }}
      align="center"
      gap={4}
      px={6}
      py={4}
      mih={38}
      data-testid={`follow-up-item-${item.id}`}
    >
      <Tooltip label={t('Reorder')} withArrow>
        <ActionIcon
          ref={setActivatorNodeRef}
          variant="subtle"
          color="chatbox-gray"
          size={28}
          aria-label={t('Reorder')}
          disabled={dispatching}
          className="shrink-0 touch-none cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <ScalableIcon icon={IconGripVertical} size={15} />
        </ActionIcon>
      </Tooltip>

      {editing ? (
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          aria-label={t('Edit queued follow-up') || undefined}
          autosize
          minRows={1}
          maxRows={3}
          className="min-w-0 flex-1"
          styles={{ input: { fontSize: 12, lineHeight: 1.35, minHeight: 28, padding: '5px 8px' } }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void saveEdit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setDraft(text)
              setEditing(false)
            }
          }}
        />
      ) : (
        <Text size="xs" lineClamp={2} className="min-w-0 flex-1 break-words" title={text}>
          {text || t('Attachment follow-up')}
        </Text>
      )}

      <Flex align="center" gap={0} className="shrink-0">
        {editing ? (
          <>
            <QueueAction
              label={t('Save')}
              disabled={!draft.trim() || pendingAction === 'edit'}
              onClick={() => void saveEdit()}
            >
              <ScalableIcon icon={IconDeviceFloppy} size={15} />
            </QueueAction>
            <QueueAction
              label={t('Cancel')}
              onClick={() => {
                setDraft(text)
                setEditing(false)
              }}
            >
              <ScalableIcon icon={IconX} size={15} />
            </QueueAction>
          </>
        ) : (
          <>
            {onEdit && item.intent === 'queue' && (
              <QueueAction
                label={t('Adjust direction')}
                disabled={dispatching || Boolean(pendingAction)}
                onClick={() =>
                  void runQueueAction('steer', () => onEdit(item.id, item.userMessage, 'steer'), setPendingAction)
                }
              >
                <ScalableIcon icon={IconCornerDownRight} size={15} />
              </QueueAction>
            )}
            {onDelete && (
              <QueueAction
                label={t('Delete')}
                disabled={dispatching || Boolean(pendingAction)}
                onClick={() => void runQueueAction('delete', () => onDelete(item.id), setPendingAction)}
              >
                <ScalableIcon icon={IconTrash} size={15} />
              </QueueAction>
            )}
            {(onEdit || onSendNow || onOpenSideChat) && (
              <Menu position="bottom-end" withinPortal shadow="md" width={190}>
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    color="chatbox-gray"
                    size={28}
                    aria-label={t('More')}
                    disabled={dispatching || Boolean(pendingAction)}
                  >
                    <ScalableIcon icon={IconDots} size={15} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {onEdit && (
                    <Menu.Item
                      leftSection={<ScalableIcon icon={IconEdit} size={15} />}
                      onClick={() => setEditing(true)}
                    >
                      {t('Edit')}
                    </Menu.Item>
                  )}
                  {onOpenSideChat && (
                    <Menu.Item
                      leftSection={<ScalableIcon icon={IconLayoutSidebarRight} size={15} />}
                      onClick={() => void runQueueAction('side-chat', () => onOpenSideChat(item.id), setPendingAction)}
                    >
                      {t('Open in Side Chat')}
                    </Menu.Item>
                  )}
                  {onSendNow && (
                    <Menu.Item
                      leftSection={<ScalableIcon icon={IconPlayerPlay} size={15} />}
                      onClick={() => void runQueueAction('send', () => onSendNow(item.id), setPendingAction)}
                    >
                      {t('Send now')}
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}
          </>
        )}
      </Flex>
    </Flex>
  )
}

async function runQueueAction(
  action: string,
  callback: () => void | Promise<void>,
  setPendingAction: (action: string | undefined) => void,
  onSuccess?: () => void
) {
  setPendingAction(action)
  try {
    await callback()
    onSuccess?.()
  } finally {
    setPendingAction(undefined)
  }
}

function QueueAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick(): void
  children: React.ReactNode
}) {
  return (
    <Tooltip label={label} withArrow>
      <ActionIcon
        variant="subtle"
        color="chatbox-gray"
        size={28}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </ActionIcon>
    </Tooltip>
  )
}
