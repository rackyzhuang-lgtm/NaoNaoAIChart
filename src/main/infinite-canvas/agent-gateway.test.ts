import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InfiniteCanvasAgentGateway } from './agent-gateway'
import { type InfiniteCanvasServer, startInfiniteCanvasServer } from './static-server'

const directories: string[] = []
const servers: InfiniteCanvasServer[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('Infinite Canvas Agent gateway', () => {
  it('keeps its upstream key private and rejects unauthenticated loopback requests', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'infinite-canvas-agent-test-'))
    directories.push(directory)
    await mkdir(path.join(directory, 'assets'))
    await writeFile(path.join(directory, 'index.html'), 'canvas')

    const gateway = new InfiniteCanvasAgentGateway()
    const key = 'canvas-test-key-must-not-be-returned'
    gateway.configure({ baseUrl: 'https://naonaoai.shop', apiKey: key, model: 'test-model' })
    expect(() => gateway.configure({ baseUrl: 'https://example.com', apiKey: key, model: 'test-model' })).toThrow(
      'OpenAI API URL is not allowed'
    )

    const server = await startInfiniteCanvasServer(directory, gateway)
    servers.push(server)
    gateway.setUrl(`${server.url}_canvas_agent`)

    expect((await fetch(`${server.url}_canvas_agent/config`)).status).toBe(401)
    const response = await fetch(`${server.url}_canvas_agent/config?token=${gateway.token}`)
    expect(response.status).toBe(200)
    const payload = await response.text()
    expect(payload).toContain('_canvas_agent')
    expect(payload).not.toContain(key)
    const skills = await fetch(`${server.url}_canvas_agent/agent/codex/skills?token=${gateway.token}`)
    expect(await skills.json()).toEqual({ ok: true, data: [], errors: [] })
  })

  it('uses the configured NaoNaoAI Chat model to answer a canvas conversation', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'infinite-canvas-agent-test-'))
    directories.push(directory)
    await writeFile(path.join(directory, 'index.html'), 'canvas')
    const fetchImplementation = vi.fn<typeof fetch>(
      async (_input, _init) =>
        new Response('data: {"choices":[{"delta":{"content":"内置 Agent 已回复"}}]}\n\ndata: [DONE]\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        })
    )
    const gateway = new InfiniteCanvasAgentGateway({ fetchImplementation })
    gateway.configure({ baseUrl: 'https://naonaoai.shop/v1', apiKey: 'canvas-test-key', model: 'naonao-text' })
    const server = await startInfiniteCanvasServer(directory, gateway)
    servers.push(server)
    gateway.setUrl(`${server.url}_canvas_agent`)

    const reset = await fetch(`${server.url}_canvas_agent/agent/codex/threads/reset?token=${gateway.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: 'canvas-client' }),
    })
    const threadId = ((await reset.json()) as { workspace: { activeThreadId: string } }).workspace.activeThreadId
    const turn = await fetch(`${server.url}_canvas_agent/agent/codex/turn?token=${gateway.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: 'canvas-client', threadId, prompt: '你好' }),
    })
    expect(turn.status).toBe(200)

    await vi.waitFor(() => expect(fetchImplementation).toHaveBeenCalledOnce())
    const [requestUrl, request] = fetchImplementation.mock.calls[0]
    expect(String(requestUrl)).toBe('https://naonaoai.shop/v1/chat/completions')
    expect(JSON.parse(String(request?.body))).toMatchObject({ model: 'naonao-text', stream: true })

    await vi.waitFor(async () => {
      const response = await fetch(`${server.url}_canvas_agent/agent/codex/threads/${threadId}?token=${gateway.token}`)
      const payload = (await response.json()) as { messages: Array<{ role: string; text: string }> }
      expect(payload.messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ role: 'assistant', text: '内置 Agent 已回复' })])
      )
    })
  })

  it('initializes an idle conversation and aborts a running turn without a thread id', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'infinite-canvas-agent-stop-test-'))
    directories.push(directory)
    await writeFile(path.join(directory, 'index.html'), 'canvas')
    let requestSignal: AbortSignal | undefined
    const fetchImplementation = vi.fn<typeof fetch>((_input, init) => {
      requestSignal = init?.signal || undefined
      const stream = new ReadableStream<Uint8Array>({})
      return Promise.resolve(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }))
    })
    const gateway = new InfiniteCanvasAgentGateway({ fetchImplementation })
    gateway.configure({ baseUrl: 'https://naonaoai.shop/v1', apiKey: 'canvas-test-key', model: 'naonao-text' })
    const server = await startInfiniteCanvasServer(directory, gateway)
    servers.push(server)
    gateway.setUrl(`${server.url}_canvas_agent`)

    const events = await fetch(`${server.url}_canvas_agent/events?token=${gateway.token}&clientId=stop-client`)
    expect(events.status).toBe(200)
    const turn = await fetch(`${server.url}_canvas_agent/agent/codex/turn?token=${gateway.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: 'stop-client', prompt: '等待' }),
    })
    expect(turn.status).toBe(200)
    await vi.waitFor(() => expect(fetchImplementation).toHaveBeenCalledOnce())
    const interrupt = await fetch(`${server.url}_canvas_agent/agent/codex/interrupt?token=${gateway.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(interrupt.status).toBe(200)
    await vi.waitFor(() => expect(requestSignal?.aborted).toBe(true))
    await events.body?.cancel()
  })
})
