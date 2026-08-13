// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import type { Sub2ApiInfiniteCanvasImport } from '@shared/sub2api/contracts'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acknowledgePendingInfiniteCanvasImport,
  getPendingInfiniteCanvasImport,
  setPendingInfiniteCanvasImport,
} from '@/stores/infiniteCanvasImportStore'

const mocks = vi.hoisted(() => ({
  getInfiniteCanvasUrl: vi.fn().mockResolvedValue('http://127.0.0.1:57006/'),
  getInfiniteCanvasAgentConnection: vi.fn().mockResolvedValue({ configured: false, endpoint: '', token: '' }),
  configureInfiniteCanvasAgent: vi.fn(),
  invoke: vi.fn().mockResolvedValue(undefined),
  getSettings: vi.fn().mockReturnValue({}),
}))

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })),
})

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => options }))
vi.mock('@/components/infinite-canvas/CanvasAgentBroker', () => ({ CanvasAgentBroker: () => null }))
vi.mock('@/components/layout/Page', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/stores/settingsStore', () => ({ settingsStore: { getState: () => ({ getSettings: mocks.getSettings }) } }))
vi.mock('@/variables', () => ({ CHATBOX_BUILD_TARGET: 'desktop' }))
vi.mock('@/utils/infinite-canvas-agent-config', () => ({ resolveInfiniteCanvasAgentConfig: () => null }))
vi.mock('@/utils/infinite-canvas-storage-path-api', () => ({ getInfiniteCanvasStoragePathApi: () => null }))

import { InfiniteCanvasPage } from '@/routes/infinite-canvas/index'

const payload: Sub2ApiInfiniteCanvasImport = {
  keyId: 7,
  keyName: 'desktop-key',
  baseUrl: 'https://models.example',
  apiKey: 'synthetic-key',
  models: [{ id: 'gpt-image-2', capability: 'image' }],
}

describe('Infinite Canvas import delivery', () => {
  beforeEach(() => {
    const current = getPendingInfiniteCanvasImport()
    if (current) acknowledgePendingInfiniteCanvasImport(current.requestId)
    mocks.getInfiniteCanvasUrl.mockClear().mockResolvedValue('http://127.0.0.1:57006/')
    mocks.getInfiniteCanvasAgentConnection.mockClear().mockResolvedValue({ configured: false, endpoint: '', token: '' })
    mocks.configureInfiniteCanvasAgent.mockClear()
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: mocks })
  })

  it('delivers an import queued after the Canvas route has mounted', async () => {
    const view = render(
      <MantineProvider>
        <InfiniteCanvasPage />
      </MantineProvider>
    )
    const iframe = await screen.findByTitle('Infinite Canvas')
    const postMessage = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { configurable: true, value: { postMessage } })
    fireEvent.load(iframe)

    const requestId = setPendingInfiniteCanvasImport(payload)
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith({ type: 'naonao-embed-bridge-ping' }, 'http://127.0.0.1:57006')
    )

    window.dispatchEvent(
      new MessageEvent('message', {
        source: (iframe as HTMLIFrameElement).contentWindow,
        origin: 'http://127.0.0.1:57006',
        data: { type: 'naonao-embed-bridge-ready' },
      })
    )
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        { type: 'naonao-import-ai-config', requestId, payload },
        'http://127.0.0.1:57006'
      )
    )

    window.dispatchEvent(
      new MessageEvent('message', {
        source: (iframe as HTMLIFrameElement).contentWindow,
        origin: 'http://127.0.0.1:57006',
        data: { type: 'naonao-import-ai-config-result', requestId, ok: true },
      })
    )
    await waitFor(() => expect(getPendingInfiniteCanvasImport()).toBeNull())
    view.unmount()
  })
})
