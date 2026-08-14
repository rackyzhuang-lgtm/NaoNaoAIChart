import type { Sub2ApiInfiniteCanvasImport } from '@shared/sub2api/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acknowledgePendingInfiniteCanvasImport,
  getPendingInfiniteCanvasImport,
  setPendingInfiniteCanvasImport,
  subscribePendingInfiniteCanvasImport,
} from './infiniteCanvasImportStore'

function payload(keyId: number): Sub2ApiInfiniteCanvasImport {
  return {
    keyId,
    keyName: `key-${keyId}`,
    baseUrl: 'https://models.example',
    apiKey: 'synthetic-key',
    models: [{ id: 'gpt-image-2', capability: 'image', apiFormat: 'openai' }],
  }
}

describe('Infinite Canvas import store', () => {
  beforeEach(() => {
    const current = getPendingInfiniteCanvasImport()
    if (current) acknowledgePendingInfiniteCanvasImport(current.requestId)
  })

  it('notifies an already-mounted subscriber when an import is queued', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePendingInfiniteCanvasImport(listener)

    const requestId = setPendingInfiniteCanvasImport(payload(7))

    expect(listener).toHaveBeenCalledOnce()
    expect(getPendingInfiniteCanvasImport()).toEqual({ requestId, payload: payload(7) })
    unsubscribe()
  })

  it('keeps an import pending until its matching acknowledgement arrives', () => {
    const firstRequestId = setPendingInfiniteCanvasImport(payload(7))
    const secondRequestId = setPendingInfiniteCanvasImport(payload(8))

    expect(acknowledgePendingInfiniteCanvasImport(firstRequestId)).toBe(false)
    expect(getPendingInfiniteCanvasImport()?.requestId).toBe(secondRequestId)
    expect(acknowledgePendingInfiniteCanvasImport(secondRequestId)).toBe(true)
    expect(getPendingInfiniteCanvasImport()).toBeNull()
  })
})
