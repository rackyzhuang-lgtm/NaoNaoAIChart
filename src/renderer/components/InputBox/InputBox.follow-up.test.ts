// @vitest-environment jsdom

import type { Message } from '@shared/types'
import { describe, expect, it, vi } from 'vitest'
import { dispatchInputBoxPayload, type InputBoxPayload } from './InputBox'

function payload(): InputBoxPayload {
  const message: Message = {
    id: 'user-follow-up',
    role: 'user',
    contentParts: [{ type: 'text', text: 'Change the implementation direction' }],
    timestamp: 1,
  }
  return {
    constructedMessage: message,
    needGenerating: true,
    settingsPatch: { followUpBehavior: 'steer' },
    onUserMessageReady: vi.fn(),
  }
}

describe('InputBox follow-up submission', () => {
  it('queues a generating submission without invoking the normal send callback', async () => {
    const onSubmit = vi.fn()
    const onQueueFollowUp = vi.fn().mockResolvedValue(undefined)
    const input = payload()

    await expect(
      dispatchInputBoxPayload({
        generating: true,
        payload: input,
        intent: 'steer',
        webBrowsing: true,
        onSubmit,
        onQueueFollowUp,
      })
    ).resolves.toBe('queued')

    expect(onSubmit).not.toHaveBeenCalled()
    expect(onQueueFollowUp).toHaveBeenCalledTimes(1)
    expect(onQueueFollowUp).toHaveBeenCalledWith({
      constructedMessage: input.constructedMessage,
      needGenerating: true,
      settingsPatch: { followUpBehavior: 'steer' },
      intent: 'steer',
      webBrowsing: true,
    })
    expect(input.onUserMessageReady).toHaveBeenCalledTimes(1)
  })

  it('does not clear the draft if queue persistence fails', async () => {
    const onQueueFollowUp = vi.fn().mockRejectedValue(new Error('queue write failed'))
    const input = payload()

    await expect(
      dispatchInputBoxPayload({
        generating: true,
        payload: input,
        intent: 'queue',
        webBrowsing: false,
        onQueueFollowUp,
      })
    ).rejects.toThrow('queue write failed')
    expect(input.onUserMessageReady).not.toHaveBeenCalled()
  })

  it('does not clear the draft when a generating chat has no queue handler', async () => {
    const input = payload()

    await expect(
      dispatchInputBoxPayload({
        generating: true,
        payload: input,
        intent: 'queue',
        webBrowsing: false,
      })
    ).rejects.toThrow('Follow-up queue is unavailable')
    expect(input.onUserMessageReady).not.toHaveBeenCalled()
  })

  it('uses only the normal callback outside generation', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onQueueFollowUp = vi.fn()
    const input = payload()

    await expect(
      dispatchInputBoxPayload({
        generating: false,
        payload: input,
        intent: 'queue',
        webBrowsing: true,
        onSubmit,
        onQueueFollowUp,
      })
    ).resolves.toBe('sent')

    expect(onSubmit).toHaveBeenCalledWith(input)
    expect(onQueueFollowUp).not.toHaveBeenCalled()
    expect(input.onUserMessageReady).not.toHaveBeenCalled()
  })
})
