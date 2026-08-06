import type { ModelDependencies } from 'src/shared/types/adapters'
import type { ProviderModelInfo } from 'src/shared/types/settings'
import type { SentryScope } from 'src/shared/utils/sentry_adapter'
import { describe, expect, it, vi } from 'vitest'
import OpenAI from './openai'

function createDependencies(): ModelDependencies {
  return {
    request: {
      apiRequest: async (options) =>
        fetch(options.url, {
          method: options.method,
          headers: options.headers as HeadersInit,
          body: options.body as BodyInit,
        }),
      fetchWithOptions: async (url, options) => fetch(url, options as RequestInit),
    },
    storage: {
      saveImage: vi.fn().mockResolvedValue('mock-storage-key'),
      getImage: vi.fn().mockResolvedValue('https://example.com/image.png'),
    },
    sentry: {
      withScope: vi.fn((callback: (scope: SentryScope) => void) => callback({ setTag: vi.fn(), setExtra: vi.fn() })),
      captureException: vi.fn(),
    },
    getRemoteConfig: vi.fn().mockReturnValue({ setting_chatboxai_first: false }),
  }
}

describe('Sub2API OpenAI-compatible streaming', () => {
  it('posts the expected request and assembles SSE text deltas', async () => {
    let request: Request | undefined
    const customFetch: typeof globalThis.fetch = (input, init) => {
      request = new Request(input, init)
      const body = [
        'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"sub2api"},"finish_reason":null}]}',
        'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" works"},"finish_reason":null}]}',
        'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
        'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}',
        'data: [DONE]',
        '',
      ].join('\n\n')
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    }

    const model: ProviderModelInfo = {
      modelId: 'codex-auto-review',
      type: 'chat',
    }
    const openai = new OpenAI(
      {
        apiKey: 'synthetic-sub2api-key',
        apiHost: 'https://naonaoai.shop/v1',
        model,
        dalleStyle: 'vivid',
        injectDefaultMetadata: true,
        useProxy: false,
        stream: true,
        customFetch,
      },
      createDependencies()
    )

    const result = await openai.chat([{ role: 'user', content: 'Say hello' }], {})

    expect(request?.url).toBe('https://naonaoai.shop/v1/chat/completions')
    expect(request?.method).toBe('POST')
    expect(request?.headers.get('authorization')).toBe('Bearer synthetic-sub2api-key')
    if (!request) throw new Error('customFetch was not called')
    const requestBody = JSON.parse(await request.text()) as { model: string; stream: boolean }
    expect(requestBody).toMatchObject({ model: 'codex-auto-review', stream: true })
    expect(result.contentParts).toEqual([{ type: 'text', text: 'sub2api works' }])
    expect(result.finishReason).toBe('stop')
    expect(result.usage).toMatchObject({ inputTokens: 3, outputTokens: 2, totalTokens: 5 })
  })
})
