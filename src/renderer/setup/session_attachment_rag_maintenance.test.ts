import type { Message, Session } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAllIncludingHidden: vi.fn(),
  getSession: vi.fn(),
  runMaintenance: vi.fn(),
}))

vi.mock('@/platform', () => ({
  default: {
    type: 'desktop',
    getSessionAttachmentRagController: () => ({ runMaintenance: mocks.runMaintenance }),
  },
}))

vi.mock('@/stores/chatStore', () => ({
  getMetaStorage: () => Promise.resolve({ getAllIncludingHidden: mocks.getAllIncludingHidden }),
  getSession: mocks.getSession,
}))

import { runSessionAttachmentRagMaintenancePass } from './session_attachment_rag_maintenance'

describe('session attachment RAG maintenance scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runMaintenance.mockResolvedValue({
      interruptedFailedCount: 0,
      canceledPurgedCount: 0,
      orphanDeletedIds: [],
    })
  })

  it('keeps hidden Side Chats and queued follow-up message attachments in scope', async () => {
    mocks.getAllIncludingHidden.mockResolvedValue([
      { id: 'visible-session', name: 'Visible' },
      { id: 'hidden-side-chat', name: 'Side Chat', hidden: true },
    ])
    mocks.getSession.mockImplementation((sessionId: string) =>
      Promise.resolve(sessionId === 'visible-session' ? sourceSession() : hiddenSideChat())
    )

    await runSessionAttachmentRagMaintenancePass()

    expect(mocks.runMaintenance).toHaveBeenCalledWith({
      sessionIds: ['visible-session', 'hidden-side-chat'],
      messageIds: expect.arrayContaining(['visible-message', 'queued-message', 'side-chat-message']),
    })
  })
})

function sourceSession(): Session {
  return {
    id: 'visible-session',
    name: 'Visible',
    messages: [message('visible-message')],
    followUpState: {
      version: 1,
      scopes: {
        'visible-session': {
          threadId: 'visible-session',
          status: 'paused',
          items: [
            {
              id: 'queue-item',
              threadId: 'visible-session',
              userMessage: message('queued-message'),
              reservedAssistantMessageId: 'queued-assistant',
              intent: 'queue',
              status: 'paused',
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
      },
    },
  }
}

function hiddenSideChat(): Session {
  return {
    id: 'hidden-side-chat',
    name: 'Side Chat',
    hidden: true,
    messages: [message('side-chat-message')],
  }
}

function message(id: string): Message {
  return { id, role: 'user', contentParts: [] }
}
