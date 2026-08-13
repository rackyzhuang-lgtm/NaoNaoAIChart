// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import type { FollowUpQueueItem } from '@shared/types'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FollowUpQueueBar, {
  getFollowUpMessageText,
  moveFollowUpItemIds,
  updateFollowUpMessageText,
} from './FollowUpQueueBar'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn(() => ({
    matches: false,
    media: '',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
})

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function queueItem(id: string, text: string, status: FollowUpQueueItem['status'] = 'ready'): FollowUpQueueItem {
  return {
    id,
    threadId: 'thread-1',
    userMessage: {
      id: `message-${id}`,
      role: 'user',
      contentParts: [{ type: 'text', text }],
      timestamp: 1,
    },
    reservedAssistantMessageId: `assistant-${id}`,
    intent: 'queue',
    status,
    createdAt: 1,
    updatedAt: 1,
  }
}

function renderBar(overrides: Partial<React.ComponentProps<typeof FollowUpQueueBar>> = {}) {
  const props: React.ComponentProps<typeof FollowUpQueueBar> = {
    items: [queueItem('first', 'First follow-up'), queueItem('second', 'Second follow-up')],
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onReorder: vi.fn(),
    onSendNow: vi.fn(),
    onOpenSideChat: vi.fn(),
    onCloseQueue: vi.fn(),
    ...overrides,
  }
  render(
    <MantineProvider>
      <FollowUpQueueBar {...props} />
    </MantineProvider>
  )
  return props
}

describe('FollowUpQueueBar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exposes every queue action through callbacks', async () => {
    const props = renderBar()

    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'More' })[0])
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit queued follow-up' }), {
      target: { value: 'Revised follow-up' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(props.onEdit).toHaveBeenCalledTimes(1))
    expect(props.onEdit).toHaveBeenCalledWith(
      'first',
      expect.objectContaining({ contentParts: [{ type: 'text', text: 'Revised follow-up' }] })
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'More' })[0])
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Open in Side Chat' }))
    await waitFor(() => expect(props.onOpenSideChat).toHaveBeenCalledWith('first'))
    fireEvent.click(screen.getAllByRole('button', { name: 'More' })[0])
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Send now' }))
    await waitFor(() => expect(props.onSendNow).toHaveBeenCalledWith('first'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Adjust direction' })[0])
    await waitFor(() => expect(props.onEdit).toHaveBeenCalledWith('first', expect.any(Object), 'steer'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith('first'))
    fireEvent.click(screen.getByRole('button', { name: 'Close queue' }))

    await waitFor(() => expect(props.onCloseQueue).toHaveBeenCalledTimes(1))
  })

  it('preserves attachments while exposing only editable text', () => {
    const item = queueItem('file', 'Review this')
    item.userMessage.contentParts.push({ type: 'image', storageKey: 'local-picture-key' })
    expect(getFollowUpMessageText(item)).toBe('Review this')
    expect(updateFollowUpMessageText(item.userMessage, 'Review this revision').contentParts).toEqual([
      { type: 'text', text: 'Review this revision' },
      { type: 'image', storageKey: 'local-picture-key' },
    ])
  })

  it('calculates a stable reordered id list without mutating the source', () => {
    const ids = ['first', 'second', 'third']
    expect(moveFollowUpItemIds(ids, 'third', 'first')).toEqual(['third', 'first', 'second'])
    expect(ids).toEqual(['first', 'second', 'third'])
  })

  it('disables mutating actions for an item already dispatching', () => {
    renderBar({ items: [queueItem('active', 'In flight', 'dispatching')] })
    expect((screen.getByRole('button', { name: 'More' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Adjust direction' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('offers an explicit resume action for paused queues', async () => {
    const onResumeQueue = vi.fn()
    renderBar({ status: 'paused', onResumeQueue })

    fireEvent.click(screen.getByRole('button', { name: 'Resume queue' }))
    await waitFor(() => expect(onResumeQueue).toHaveBeenCalledTimes(1))
  })
})
