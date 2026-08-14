import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

type StorageState = Record<string, string>

async function loadBridge(initialStorage: StorageState = {}) {
  const storage = { ...initialStorage }
  const listeners = new Map<string, (event: unknown) => void>()
  const postMessage = vi.fn()
  const reload = vi.fn()
  const originalFetch = vi.fn(
    async (_input: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 204 })
  )
  class StorageMock {
    getItem(key: string) {
      return storage[key] ?? null
    }
    setItem(key: string, value: string) {
      storage[key] = String(value)
    }
  }
  class XMLHttpRequestMock {
    open() {}
  }
  const parent = { postMessage }
  const window = {
    parent,
    location: {
      search: '',
      href: 'http://127.0.0.1:43123/canvas',
      origin: 'http://127.0.0.1:43123',
      reload,
    },
    fetch: originalFetch,
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
  }
  const context = vm.createContext({
    window,
    document: { documentElement: { classList: { toggle: vi.fn() }, style: {} } },
    localStorage: new StorageMock(),
    Storage: StorageMock,
    XMLHttpRequest: XMLHttpRequestMock,
    URL,
    URLSearchParams,
    TextEncoder,
    Request,
    Response,
    DOMException,
    btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
    setTimeout,
    clearTimeout,
  })
  const script = await readFile(path.join(process.cwd(), 'assets/infinite-canvas/naonao-embed-bridge.js'), 'utf8')
  vm.runInContext(script, context)
  return { storage, listeners, parent, postMessage, reload, window, originalFetch }
}

function importMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: 'naonao-import-ai-config',
    requestId: 'canvas-import-7',
    payload: {
      keyId: 7,
      keyName: 'mixed-key',
      baseUrl: 'https://models.example',
      apiKey: 'synthetic-key',
      models: [
        { id: 'gpt-image-2', capability: 'image', apiFormat: 'openai' },
        { id: 'gemini-2.5-flash-image', capability: 'image', apiFormat: 'gemini' },
        { id: 'gpt-5.5', capability: 'text', apiFormat: 'openai' },
        { id: 'seedance-video', capability: 'video', apiFormat: 'openai' },
        { id: 'gpt-4o-mini-tts', capability: 'audio', apiFormat: 'openai' },
      ],
      ...overrides,
    },
  }
}

describe('Infinite Canvas embed bridge', () => {
  it('announces readiness and responds to parent readiness probes', async () => {
    const bridge = await loadBridge()
    expect(bridge.postMessage).toHaveBeenCalledWith({ type: 'naonao-embed-bridge-ready' }, '*')

    bridge.postMessage.mockClear()
    bridge.listeners.get('message')?.({ source: bridge.parent, data: { type: 'naonao-embed-bridge-ping' } })
    expect(bridge.postMessage).toHaveBeenCalledWith({ type: 'naonao-embed-bridge-ready' }, '*')
  })

  it('imports per-model capabilities, assigns defaults, and preserves unrelated settings/channels', async () => {
    const existing = {
      state: {
        webdav: { url: 'https://storage.example/dav', directory: 'canvas' },
        config: {
          quality: 'high',
          channels: [{ id: 'other', name: 'Other', models: [{ name: 'other-text', capability: 'text' }] }],
          models: ['other::other-text'],
        },
      },
      version: 3,
    }
    const bridge = await loadBridge({ 'infinite-canvas:ai_config_store': JSON.stringify(existing) })
    bridge.listeners.get('message')?.({ source: bridge.parent, data: importMessage() })

    const stored = JSON.parse(bridge.storage['infinite-canvas:ai_config_store'])
    expect(stored.version).toBe(3)
    expect(stored.state.config.quality).toBe('high')
    expect(stored.state.webdav).toEqual({ url: 'https://storage.example/dav', directory: 'canvas' })
    expect(stored.state.config.channels.map((channel: { id: string }) => channel.id)).toEqual([
      'other',
      'naonao-key-7-openai',
      'naonao-key-7-gemini',
    ])
    expect(stored.state.config.channels[1]).toMatchObject({
      apiFormat: 'openai',
      models: [
        { name: 'gpt-image-2', capability: 'image' },
        { name: 'gpt-5.5', capability: 'text' },
        { name: 'seedance-video', capability: 'video' },
        { name: 'gpt-4o-mini-tts', capability: 'audio' },
      ],
    })
    expect(stored.state.config.channels[2]).toMatchObject({
      apiFormat: 'gemini',
      models: [{ name: 'gemini-2.5-flash-image', capability: 'image' }],
    })
    expect(stored.state.config).toMatchObject({
      model: 'naonao-key-7-openai::gpt-image-2',
      imageModel: 'naonao-key-7-openai::gpt-image-2',
      textModel: 'naonao-key-7-openai::gpt-5.5',
      videoModel: 'naonao-key-7-openai::seedance-video',
      audioModel: 'naonao-key-7-openai::gpt-4o-mini-tts',
    })
    expect(bridge.postMessage).toHaveBeenCalledWith(
      {
        type: 'naonao-import-ai-config-result',
        requestId: 'canvas-import-7',
        ok: true,
        error: undefined,
      },
      '*'
    )
    expect(bridge.reload).toHaveBeenCalledOnce()
  })

  it('updates the stable key channel when the credential changes and does not duplicate it', async () => {
    const bridge = await loadBridge()
    bridge.listeners.get('message')?.({ source: bridge.parent, data: importMessage() })
    bridge.reload.mockClear()
    bridge.listeners.get('message')?.({
      source: bridge.parent,
      data: importMessage({ apiKey: 'rotated-key' }),
    })

    const stored = JSON.parse(bridge.storage['infinite-canvas:ai_config_store'])
    expect(
      stored.state.config.channels.filter((channel: { id: string }) => channel.id === 'naonao-key-7-openai')
    ).toHaveLength(1)
    expect(
      stored.state.config.channels.find((channel: { id: string }) => channel.id === 'naonao-key-7-openai').apiKey
    ).toBe('rotated-key')
    expect(bridge.reload).toHaveBeenCalledOnce()
  })

  it('defaults legacy imports without apiFormat to an OpenAI channel', async () => {
    const bridge = await loadBridge()
    bridge.listeners.get('message')?.({
      source: bridge.parent,
      data: importMessage({
        models: [{ id: 'gpt-image-2', capability: 'image' }],
      }),
    })

    const stored = JSON.parse(bridge.storage['infinite-canvas:ai_config_store'])
    expect(stored.state.config.channels).toContainEqual(
      expect.objectContaining({
        id: 'naonao-key-7-openai',
        apiFormat: 'openai',
        models: [{ name: 'gpt-image-2', capability: 'image' }],
      })
    )
  })

  it('removes the legacy unsuffixed channel during protocol migration', async () => {
    const existing = {
      state: {
        config: {
          channels: [{ id: 'naonao-key-7', name: 'old', apiFormat: 'openai', models: [] }],
          models: ['naonao-key-7::gpt-image-2'],
        },
      },
      version: 3,
    }
    const bridge = await loadBridge({ 'infinite-canvas:ai_config_store': JSON.stringify(existing) })
    bridge.listeners.get('message')?.({ source: bridge.parent, data: importMessage() })

    const stored = JSON.parse(bridge.storage['infinite-canvas:ai_config_store'])
    expect(stored.state.config.channels.map((channel: { id: string }) => channel.id)).not.toContain('naonao-key-7')
    expect(stored.state.config.models).not.toContain('naonao-key-7::gpt-image-2')
  })

  it('rejects invalid model payloads without changing configuration', async () => {
    const original = JSON.stringify({ state: { config: { quality: 'high' } }, version: 1 })
    const bridge = await loadBridge({ 'infinite-canvas:ai_config_store': original })
    bridge.listeners.get('message')?.({ source: bridge.parent, data: importMessage({ models: [{ id: 'bad' }] }) })

    expect(bridge.storage['infinite-canvas:ai_config_store']).toBe(original)
    expect(bridge.postMessage).toHaveBeenCalledWith(
      {
        type: 'naonao-import-ai-config-result',
        requestId: 'canvas-import-7',
        ok: false,
        error: 'No importable models were returned',
      },
      '*'
    )
    expect(bridge.reload).not.toHaveBeenCalled()
  })

  it('rewrites any HTTPS request to a structured loopback proxy target and blocks HTTP', async () => {
    const bridge = await loadBridge()
    await bridge.window.fetch('https://third-party.example/v1/models?limit=2')
    const proxied = String(bridge.originalFetch.mock.calls[0][0])
    const encoded = proxied.split('/_naonao_proxy/')[1]
    expect(Buffer.from(encoded, 'base64url').toString('utf8')).toBe('https://third-party.example/v1/models?limit=2')
    await expect(bridge.window.fetch('http://third-party.example/v1/models')).rejects.toThrow(
      'External canvas requests are not permitted'
    )
  })

  it('keeps local data URLs out of the HTTPS loopback proxy', async () => {
    const bridge = await loadBridge()
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='

    await bridge.window.fetch(dataUrl)

    expect(bridge.originalFetch).toHaveBeenCalledWith(dataUrl, undefined)
  })
})
