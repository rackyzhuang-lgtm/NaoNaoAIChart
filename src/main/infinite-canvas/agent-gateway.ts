import crypto from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { type OpenAIStreamToolCall, readOpenAIResponsesStream } from './openai-stream'

const ALLOWED_AGENT_API_ORIGINS = new Set(['https://naonaoai.shop', 'https://eazyai.shop'])

const PROTOCOL_VERSION = 6
const TURN_TIMEOUT_MS = 90_000
const MAX_TOOL_ROUNDS = 8
const MAX_REQUEST_BYTES = 1_000_000

export type CanvasAgentHostTool = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type OpenAIAgentConfiguration = { baseUrl: string; apiKey: string; model: string }
export type CanvasAgentGatewayOptions = {
  executeHostTool?: (name: string, input: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>
  fetchImplementation?: typeof fetch
}

type CanvasAgentMessage = {
  id: string
  threadId: string
  turnId: string
  role: 'user' | 'assistant' | 'tool' | 'error'
  text: string
}
type Thread = {
  id: string
  createdAt: number
  updatedAt: number
  messages: CanvasAgentMessage[]
  modelMessages: OpenAIMessage[]
}
type OpenAIMessage = Record<string, unknown>
type Client = { response: ServerResponse; clientId: string }
type PendingCanvasTool = { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout }

export class InfiniteCanvasAgentGateway {
  readonly token = crypto.randomBytes(24).toString('hex')
  #config: OpenAIAgentConfiguration | null = null
  #clients = new Map<string, Client>()
  #threads = new Map<string, Thread>()
  #snapshots = new Map<string, unknown>()
  #pendingCanvasTools = new Map<string, PendingCanvasTool>()
  #hostTools: CanvasAgentHostTool[] = []
  #turnControllers = new Map<string, AbortController>()
  #url = ''
  #conversationRevision = 1

  constructor(private readonly options: CanvasAgentGatewayOptions = {}) {}

  setUrl(url: string) {
    this.#url = url.replace(/\/$/, '')
  }

  configure(config: OpenAIAgentConfiguration) {
    const baseUrl = validateOpenAIBaseUrl(config.baseUrl)
    if (!config.apiKey.trim() || !config.model.trim()) throw new Error('请先配置文本模型和 API Key')
    this.#config = { baseUrl, apiKey: config.apiKey.trim(), model: config.model.trim() }
  }

  clearConfiguration() {
    this.#config = null
  }

  setHostTools(tools: CanvasAgentHostTool[]) {
    const unique = new Map<string, CanvasAgentHostTool>()
    for (const tool of tools) {
      if (
        /^[A-Za-z0-9_]{1,128}$/.test(tool.name) &&
        typeof tool.description === 'string' &&
        tool.description.length <= 8_000 &&
        tool.parameters &&
        typeof tool.parameters === 'object' &&
        !Array.isArray(tool.parameters)
      ) {
        unique.set(tool.name, tool)
      }
    }
    this.#hostTools = [...unique.values()]
  }

  isConfigured() {
    return this.#config !== null
  }

  handle(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
    if (!url.pathname.startsWith('/_canvas_agent/')) return false
    if (!validToken(req, url, this.token)) {
      sendJson(res, 401, { ok: false, error: 'invalid token' })
      return true
    }
    const path = url.pathname.slice('/_canvas_agent'.length)
    if (path === '/config' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, protocolVersion: PROTOCOL_VERSION, url: this.#url, hasToken: true })
      return true
    }
    if (path === '/events' && req.method === 'GET') {
      this.#openEvents(res, url.searchParams.get('clientId') || '')
      return true
    }
    if (path === '/canvas/state' && req.method === 'POST') {
      void this.#saveCanvasState(req, res, url.searchParams.get('clientId') || '').catch((error) =>
        sendRequestError(res, error)
      )
      return true
    }
    if (path === '/canvas/result' && req.method === 'POST') {
      void this.#resolveCanvasTool(req, res).catch((error) => sendRequestError(res, error))
      return true
    }
    if (path === '/canvas/activate' && req.method === 'POST') {
      sendJson(res, 200, { ok: true })
      return true
    }
    if (path === '/agent/codex/models' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, data: this.#models() })
      return true
    }
    if (path === '/agent/codex/skills' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, data: [], errors: [] })
      return true
    }
    if (path === '/agent/codex/threads' && req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        data: [...this.#threads.values()].map(threadSummary),
        workspace: { workspacePath: 'NaoNaoAI Canvas Agent' },
      })
      return true
    }
    if (path === '/agent/codex/threads/reset' && req.method === 'POST') {
      void this.#resetThread(req, res).catch((error) => sendRequestError(res, error))
      return true
    }
    if (path === '/agent/codex/turn' && req.method === 'POST') {
      void this.#startTurn(req, res).catch((error) => sendRequestError(res, error))
      return true
    }
    if (path === '/agent/codex/interrupt' && req.method === 'POST') {
      void this.#interruptTurn(req, res).catch((error) => sendRequestError(res, error))
      return true
    }
    const thread = /^\/agent\/codex\/threads\/([^/]+)$/.exec(path)
    if (thread && req.method === 'GET') {
      sendJson(res, 200, this.#threadResponse(decodeURIComponent(thread[1])))
      return true
    }
    sendJson(res, 404, { ok: false, error: 'not found' })
    return true
  }

  close() {
    for (const controller of this.#turnControllers.values()) controller.abort()
    this.#turnControllers.clear()
    for (const { response } of this.#clients.values()) response.end()
    this.#clients.clear()
    for (const pending of this.#pendingCanvasTools.values()) clearTimeout(pending.timer)
    this.#pendingCanvasTools.clear()
  }

  #openEvents(res: ServerResponse, clientId: string) {
    if (!clientId) return sendJson(res, 400, { ok: false, error: 'clientId is required' })
    const latestThread = [...this.#threads.values()].at(-1)
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
    res.write(': connected\n\n')
    const client = { response: res, clientId }
    this.#clients.set(clientId, client)
    this.#emit(clientId, 'hello', {
      ok: true,
      protocolVersion: PROTOCOL_VERSION,
      clientId,
      conversation: {
        revision: this.#conversationRevision,
        conversationId: clientId,
        threadId: latestThread?.id || '',
        status: this.#config ? (latestThread ? 'ready' : 'idle') : 'failed',
        mcpStatuses: {},
        ...(this.#config ? {} : { error: '未检测到可用的文本模型，请先在 NaoNaoAI Chat 中配置聊天模型。' }),
      },
      codex: { busy: false },
    })
    res.once('close', () => this.#clients.delete(clientId))
  }

  async #saveCanvasState(req: IncomingMessage, res: ServerResponse, clientId: string) {
    this.#snapshots.set(clientId, await readJson(req))
    sendJson(res, 200, { ok: true })
  }

  async #resolveCanvasTool(req: IncomingMessage, res: ServerResponse) {
    const body = (await readJson(req)) as { requestId?: string; result?: unknown; error?: string }
    const requestId = body.requestId
    const pending = requestId ? this.#pendingCanvasTools.get(requestId) : undefined
    if (!requestId || !pending) return sendJson(res, 404, { ok: false, error: 'tool request not found' })
    this.#pendingCanvasTools.delete(requestId)
    clearTimeout(pending.timer)
    if (body.error) pending.reject(new Error(body.error))
    else pending.resolve(body.result)
    sendJson(res, 200, { ok: true })
  }

  async #resetThread(req: IncomingMessage, res: ServerResponse) {
    const body = (await readJson(req)) as { clientId?: string }
    const thread = this.#newThread()
    const nextConversation = conversation(thread.id, ++this.#conversationRevision)
    this.#emit(body.clientId || '', 'workspace_changed', {
      activeThreadId: thread.id,
      emptyThread: true,
      conversation: nextConversation,
    })
    sendJson(res, 200, {
      ok: true,
      workspace: { workspacePath: 'NaoNaoAI Canvas Agent', activeThreadId: thread.id },
      conversation: nextConversation,
    })
  }

  async #startTurn(req: IncomingMessage, res: ServerResponse) {
    if (!this.#config)
      return sendJson(res, 409, { ok: false, error: '未检测到可用的文本模型，请先在 NaoNaoAI Chat 中配置聊天模型。' })
    const body = (await readJson(req)) as { prompt?: string; threadId?: string; clientId?: string }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt) return sendJson(res, 400, { ok: false, error: 'prompt is required' })
    const thread = (body.threadId && this.#threads.get(body.threadId)) || this.#newThread()
    const turnId = crypto.randomUUID()
    const userMessage: CanvasAgentMessage = {
      id: crypto.randomUUID(),
      threadId: thread.id,
      turnId,
      role: 'user',
      text: prompt,
    }
    thread.messages.push(userMessage)
    thread.modelMessages.push({ role: 'user', content: [{ type: 'input_text', text: prompt }] })
    thread.updatedAt = Date.now()
    this.#emit(body.clientId || '', 'chat_message', { threadId: thread.id, turnId, message: userMessage })
    this.#emit(body.clientId || '', 'codex_state', { busy: true, threadId: thread.id, turnId })
    sendJson(res, 200, { ok: true, threadId: thread.id })
    void this.#runTurn(body.clientId || '', thread, turnId)
  }

  async #interruptTurn(req: IncomingMessage, res: ServerResponse) {
    const body = (await readJson(req)) as { threadId?: string }
    if (body.threadId) this.#turnControllers.get(body.threadId)?.abort()
    else for (const controller of this.#turnControllers.values()) controller.abort()
    sendJson(res, 200, { ok: true })
  }

  async #runTurn(clientId: string, thread: Thread, turnId: string) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS)
    this.#turnControllers.set(thread.id, controller)
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const calls = await this.#streamCompletion(clientId, thread, turnId, controller.signal)
        if (!calls.length) break
        for (const call of calls)
          thread.modelMessages.push({
            type: 'function_call',
            call_id: call.id,
            name: call.name,
            arguments: call.arguments,
          })
        for (const call of calls) {
          const result = await this.#executeTool(clientId, call, controller.signal)
          thread.modelMessages.push({ type: 'function_call_output', call_id: call.id, output: JSON.stringify(result) })
        }
      }
    } catch (error) {
      const text = controller.signal.aborted
        ? '生成已停止。'
        : error instanceof Error
          ? error.message
          : 'NaoNaoAI Agent 请求失败，请稍后重试。'
      const message: CanvasAgentMessage = { id: crypto.randomUUID(), threadId: thread.id, turnId, role: 'error', text }
      thread.messages.push(message)
      this.#emit(clientId, 'chat_message', { threadId: thread.id, turnId, message })
    } finally {
      clearTimeout(timeout)
      this.#turnControllers.delete(thread.id)
      this.#emit(clientId, 'codex_state', { busy: false, threadId: thread.id, turnId })
    }
  }

  async #streamCompletion(clientId: string, thread: Thread, turnId: string, signal: AbortSignal) {
    const config = this.#config
    if (!config) throw new Error('未检测到可用的文本模型，请先在 NaoNaoAI Chat 中配置聊天模型。')
    const response = await (this.options.fetchImplementation || fetch)(openAIResponsesUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: config.model,
        stream: true,
        store: false,
        instructions:
          'You are NaoNaoAI Canvas Agent. Use tools when needed and never claim a tool action succeeded without its result.',
        input: thread.modelMessages,
        tools: this.#tools(),
      }),
      redirect: 'manual',
      signal,
    })
    if (!response.ok || !response.body) throw new Error(`OpenAI request failed (${response.status})`)
    const messageId = crypto.randomUUID()
    let text = ''
    const calls: OpenAIStreamToolCall[] = []
    await readOpenAIResponsesStream(response.body, (event) => {
      if (event.type === 'text') {
        text += event.text
        const message: CanvasAgentMessage = { id: messageId, threadId: thread.id, turnId, role: 'assistant', text }
        const previous = thread.messages.findIndex((item) => item.id === messageId)
        if (previous < 0) thread.messages.push(message)
        else thread.messages[previous] = message
        this.#emit(clientId, 'chat_message', { threadId: thread.id, turnId, message })
      }
      if (event.type === 'tool-call') calls.push(event.call)
      if (event.type === 'usage')
        this.#emit(clientId, 'agent_event', {
          type: 'usage.updated',
          threadId: thread.id,
          turnId,
          usage: { input_tokens: event.inputTokens || 0, output_tokens: event.outputTokens || 0 },
        })
    })
    if (text) thread.modelMessages.push({ role: 'assistant', content: [{ type: 'output_text', text }] })
    return calls
  }

  async #executeTool(clientId: string, call: OpenAIStreamToolCall, signal: AbortSignal): Promise<unknown> {
    const input = parseToolInput(call.arguments)
    if (call.name === 'canvas_get_state') return this.#snapshots.get(clientId) || { hasCanvas: false }
    if (call.name === 'canvas_apply_ops') return await this.#requestCanvasTool(clientId, call.name, input, signal)
    if (this.#hostTools.some((tool) => tool.name === call.name)) {
      if (!this.options.executeHostTool) return { error: 'Host tools are unavailable.' }
      return await this.options.executeHostTool(call.name, input, signal)
    }
    return { error: `Tool "${call.name}" is not available.` }
  }

  #requestCanvasTool(clientId: string, name: string, input: Record<string, unknown>, signal: AbortSignal) {
    const requestId = crypto.randomUUID()
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pendingCanvasTools.delete(requestId)
        reject(new Error('Canvas tool timed out.'))
      }, 60_000)
      const abort = () => {
        clearTimeout(timer)
        this.#pendingCanvasTools.delete(requestId)
        reject(new Error('Canvas tool cancelled.'))
      }
      signal.addEventListener('abort', abort, { once: true })
      this.#pendingCanvasTools.set(requestId, {
        resolve: (value) => {
          signal.removeEventListener('abort', abort)
          resolve(value)
        },
        reject: (error) => {
          signal.removeEventListener('abort', abort)
          reject(error)
        },
        timer,
      })
      this.#emit(clientId, 'tool_call', { requestId, name, input })
    })
  }

  #tools() {
    return [
      {
        type: 'function',
        name: 'canvas_get_state',
        description: 'Read the current canvas snapshot.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
      {
        type: 'function',
        name: 'canvas_apply_ops',
        description: 'Propose canvas operations. The user approves canvas writes before they are applied.',
        parameters: {
          type: 'object',
          properties: { ops: { type: 'array', items: { type: 'object' } } },
          required: ['ops'],
          additionalProperties: false,
        },
      },
      ...this.#hostTools.map((tool) => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    ]
  }

  #models() {
    return this.#config
      ? [
          {
            id: this.#config.model,
            model: this.#config.model,
            displayName: this.#config.model,
            defaultReasoningEffort: 'medium',
            supportedReasoningEfforts: [
              { reasoningEffort: 'low' },
              { reasoningEffort: 'medium' },
              { reasoningEffort: 'high' },
            ],
            isDefault: true,
          },
        ]
      : []
  }

  #newThread() {
    const thread: Thread = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      modelMessages: [],
    }
    this.#threads.set(thread.id, thread)
    return thread
  }

  #threadResponse(id: string) {
    const thread = this.#threads.get(id)
    return thread
      ? { ok: true, thread: threadSummary(thread), messages: thread.messages, settledTurnIds: [], historyReady: true }
      : { ok: false, error: 'thread not found' }
  }

  #emit(clientId: string, type: string, data: unknown) {
    const client = this.#clients.get(clientId)
    if (client && !client.response.writableEnded)
      client.response.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
  }
}

function threadSummary(thread: Thread) {
  const text = thread.messages.at(-1)?.text || ''
  return {
    id: thread.id,
    preview: text.slice(0, 160),
    name: text.slice(0, 80) || 'New canvas conversation',
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  }
}

function conversation(threadId: string, revision: number) {
  return { revision, conversationId: threadId, threadId, status: 'ready', mcpStatuses: {} }
}

function validToken(req: IncomingMessage, url: URL, token: string) {
  return url.searchParams.get('token') === token || req.headers['x-canvas-agent-token'] === token
}

function validateOpenAIBaseUrl(value: string) {
  const url = new URL(value.trim())
  if (
    url.protocol !== 'https:' ||
    !ALLOWED_AGENT_API_ORIGINS.has(url.origin) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error('OpenAI API URL is not allowed')
  return url.toString().replace(/\/$/, '')
}

function openAIResponsesUrl(baseUrl: string) {
  const url = new URL(baseUrl)
  url.pathname = url.pathname.replace(/\/+$/, '').endsWith('/v1')
    ? `${url.pathname.replace(/\/+$/, '')}/responses`
    : `${url.pathname.replace(/\/+$/, '')}/v1/responses`
  url.search = ''
  return url
}

function parseToolInput(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const decoder = new TextDecoder()
  let text = ''
  let total = 0
  for await (const chunk of req) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
    total += bytes.byteLength
    if (total > MAX_REQUEST_BYTES) throw new Error('Request body is too large')
    text += decoder.decode(bytes, { stream: true })
  }
  text += decoder.decode()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Request body must be valid JSON')
  }
}

function sendJson(res: ServerResponse, status: number, value: unknown) {
  res
    .writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    .end(JSON.stringify(value))
}

function sendRequestError(res: ServerResponse, error: unknown) {
  if (res.writableEnded) return
  const message = error instanceof Error ? error.message : 'Invalid request'
  sendJson(res, message === 'Request body is too large' ? 413 : 400, { ok: false, error: message })
}
