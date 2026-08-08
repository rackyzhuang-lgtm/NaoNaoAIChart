import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import type { InfiniteCanvasAgentGateway } from './agent-gateway'
import { validateInfiniteCanvasProxyTarget } from './policy'

export interface InfiniteCanvasServer {
  port: number
  url: string
  close: () => Promise<void>
}

const PROXY_PREFIX = '/_naonao_proxy/'
const ALLOWED_PROXY_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const FORWARDED_REQUEST_HEADERS = ['accept', 'authorization', 'content-type'] as const
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'content-length', 'content-disposition'] as const
const CANVAS_CONTENT_SECURITY_POLICY =
  "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:"

function mimeType(file: string): string {
  const ext = path.extname(file).toLowerCase()
  return (
    (
      {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
      } as Record<string, string>
    )[ext] ?? 'application/octet-stream'
  )
}

function inside(root: string, file: string): boolean {
  return file === root || file.startsWith(`${root}${path.sep}`)
}

function reject(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end(message)
}

async function serveStatic(root: string, index: string, pathname: string, res: ServerResponse): Promise<void> {
  if (pathname.includes('\0') || pathname.split('/').some((part) => part === '..')) {
    reject(res, 403, 'Forbidden')
    return
  }
  const requested = path.resolve(root, `.${pathname}`)
  let candidate = requested
  try {
    if (!(await stat(candidate)).isFile()) {
      if (path.extname(path.basename(pathname)) !== '') throw new Error('missing asset')
      candidate = index
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'missing asset') {
      reject(res, 404, 'Not Found')
      return
    }
    if (path.extname(path.basename(pathname)) !== '') {
      reject(res, 404, 'Not Found')
      return
    }
    candidate = index
  }
  try {
    const resolved = await realpath(candidate)
    if (!inside(root, resolved) || !(await stat(resolved)).isFile()) throw new Error('outside')
    res.setHeader('Content-Type', mimeType(resolved))
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Security-Policy', CANVAS_CONTENT_SECURITY_POLICY)
    createReadStream(resolved).pipe(res)
  } catch {
    reject(res, 404, 'Not Found')
  }
}

function proxyHeaders(req: IncomingMessage): Headers {
  const headers = new Headers()
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers[name]
    if (typeof value === 'string') headers.set(name, value)
  }
  return headers
}

async function proxyRequest(req: IncomingMessage, res: ServerResponse, requestUrl: URL): Promise<void> {
  const method = req.method ?? 'GET'
  if (!ALLOWED_PROXY_METHODS.has(method)) {
    reject(res, 405, 'Method Not Allowed')
    return
  }
  const relative = requestUrl.pathname.slice(PROXY_PREFIX.length)
  const slash = relative.indexOf('/')
  const alias = slash === -1 ? relative : relative.slice(0, slash)
  const targetPath = slash === -1 ? '/' : relative.slice(slash)
  const validation = validateInfiniteCanvasProxyTarget(alias, targetPath, requestUrl.search)
  if (!validation.ok) {
    reject(res, 403, validation.reason)
    return
  }
  if (method === 'OPTIONS') {
    res
      .writeHead(204, {
        Allow: [...ALLOWED_PROXY_METHODS].join(', '),
        'Access-Control-Allow-Methods': [...ALLOWED_PROXY_METHODS].join(', '),
        'Access-Control-Allow-Headers': 'Accept, Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
        'Cache-Control': 'no-store',
      })
      .end()
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  try {
    const requestInit: RequestInit & { duplex?: 'half' } = {
      method,
      headers: proxyHeaders(req),
      body: method === 'GET' ? undefined : (Readable.toWeb(req) as unknown as BodyInit),
      duplex: method === 'GET' ? undefined : 'half',
      redirect: 'manual',
      signal: controller.signal,
    }
    const response = await fetch(validation.url, requestInit)
    if (response.status >= 300 && response.status < 400) {
      reject(res, 502, 'Upstream redirects are not allowed')
      return
    }
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = response.headers.get(name)
      if (value) res.setHeader(name, value)
    }
    res.setHeader('Cache-Control', 'no-store')
    res.writeHead(response.status)
    if (response.body) Readable.fromWeb(response.body as unknown as NodeReadableStream).pipe(res)
    else res.end()
  } catch (error) {
    reject(res, error instanceof Error && error.name === 'AbortError' ? 504 : 502, 'Upstream request failed')
  } finally {
    clearTimeout(timeout)
  }
}

async function handleRequest(
  root: string,
  index: string,
  req: IncomingMessage,
  res: ServerResponse,
  agentGateway?: InfiniteCanvasAgentGateway,
): Promise<void> {
  const rawPathname = (req.url || '/').split('?', 1)[0]
  try {
    const decodedRawPathname = decodeURIComponent(rawPathname)
    if (decodedRawPathname.includes('\0') || decodedRawPathname.split('/').some((part) => part === '..')) {
      reject(res, 403, 'Forbidden')
      return
    }
  } catch {
    reject(res, 400, 'Bad Request')
    return
  }
  let requestUrl: URL
  try {
    requestUrl = new URL(req.url || '/', 'http://127.0.0.1')
  } catch {
    reject(res, 400, 'Bad Request')
    return
  }
  if (agentGateway?.handle(req, res, requestUrl)) {
    return
  }
  if (requestUrl.pathname.startsWith(PROXY_PREFIX)) {
    await proxyRequest(req, res, requestUrl)
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    reject(res, 405, 'Method Not Allowed')
    return
  }
  await serveStatic(root, index, decodeURIComponent(requestUrl.pathname), res)
}

export async function startInfiniteCanvasServer(
  assetsDirectory: string,
  agentGateway?: InfiniteCanvasAgentGateway,
): Promise<InfiniteCanvasServer> {
  const root = await realpath(assetsDirectory)
  const index = path.join(root, 'index.html')
  if (!(await stat(index)).isFile()) throw new Error('Infinite canvas index.html is missing')
  const server: Server = createServer((req, res) => {
    void handleRequest(root, index, req, res, agentGateway)
  })
  await new Promise<void>((resolve, rejectStart) => {
    server.once('error', rejectStart)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    throw new Error('Failed to determine server port')
  }
  return {
    port: address.port,
    url: `http://127.0.0.1:${address.port}/`,
    close: () =>
      new Promise<void>((resolve, rejectClose) => server.close((error) => (error ? rejectClose(error) : resolve()))),
  }
}
