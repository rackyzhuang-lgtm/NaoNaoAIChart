import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import path from 'node:path'
import type { InfiniteCanvasAgentGateway } from './agent-gateway'
import type { ProxyTargetValidation } from './policy'
import { type InfiniteCanvasDnsResolver, validateInfiniteCanvasProxyTarget } from './policy'

export interface InfiniteCanvasServer {
  port: number
  url: string
  close: () => Promise<void>
}

export interface InfiniteCanvasServerDependencies {
  resolveDns?: InfiniteCanvasDnsResolver
}

const PROXY_PREFIX = '/_naonao_proxy/'
const ALLOWED_PROXY_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const FORWARDED_REQUEST_HEADERS = ['accept', 'authorization', 'content-type'] as const
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'content-disposition'] as const
export const INFINITE_CANVAS_PROXY_TIMEOUT_MS = 5 * 60_000
const CANVAS_CONTENT_SECURITY_POLICY =
  "default-src 'self'; connect-src 'self' data: blob:; img-src 'self' data: blob:; media-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:"

export function proxyResponseHeaders(headers: NodeJS.Dict<string | string[]>): Record<string, string> {
  const forwarded: Record<string, string> = {}
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = headers[name]
    if (typeof value === 'string') forwarded[name] = value
  }
  return forwarded
}

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

function proxyHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers[name]
    if (typeof value === 'string') headers[name] = value
  }
  return headers
}

function proxyCorsHeaders(req: IncomingMessage): Record<string, string> {
  const origin = req.headers.origin
  const isLocalRendererOrigin =
    origin === 'null' ||
    origin === 'file://' ||
    (typeof origin === 'string' && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin))
  if (!isLocalRendererOrigin || typeof origin !== 'string') return {}
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  }
}

export function createPinnedHttpsRequestOptions(
  validation: Extract<ProxyTargetValidation, { ok: true }>,
  method: string,
  headers: Record<string, string>
) {
  const pinnedAddress = validation.addresses[0]
  const targetHostname = validation.url.hostname.startsWith('[')
    ? validation.url.hostname.slice(1, -1)
    : validation.url.hostname
  return {
    protocol: 'https:' as const,
    hostname: targetHostname,
    port: validation.url.port || 443,
    path: `${validation.url.pathname}${validation.url.search}`,
    method,
    headers,
    servername: isIP(targetHostname) ? undefined : targetHostname,
    autoSelectFamily: false,
    family: pinnedAddress.family,
    lookup: (_hostname: string, _options: unknown, callback: (error: null, address: string, family: 4 | 6) => void) =>
      callback(null, pinnedAddress.address, pinnedAddress.family),
    timeout: INFINITE_CANVAS_PROXY_TIMEOUT_MS,
  }
}

async function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  requestUrl: URL,
  dependencies: InfiniteCanvasServerDependencies
): Promise<void> {
  const method = req.method ?? 'GET'
  if (!ALLOWED_PROXY_METHODS.has(method)) {
    reject(res, 405, 'Method Not Allowed')
    return
  }
  const encodedTarget = requestUrl.pathname.slice(PROXY_PREFIX.length)
  const validation = await validateInfiniteCanvasProxyTarget(encodedTarget, dependencies.resolveDns)
  if (!validation.ok) {
    reject(res, 403, validation.reason)
    return
  }
  if (method === 'OPTIONS') {
    res
      .writeHead(204, {
        ...proxyCorsHeaders(req),
        Allow: [...ALLOWED_PROXY_METHODS].join(', '),
        'Access-Control-Allow-Methods': [...ALLOWED_PROXY_METHODS].join(', '),
        'Access-Control-Allow-Headers': 'Accept, Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
        'Cache-Control': 'no-store',
      })
      .end()
    return
  }

  await new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    const upstream = httpsRequest(
      createPinnedHttpsRequestOptions(validation, method, proxyHeaders(req)),
      (response) => {
        const status = response.statusCode ?? 502
        if (status >= 300 && status < 400) {
          response.resume()
          reject(res, 502, 'Upstream redirects are not allowed')
          finish()
          return
        }
        for (const [name, value] of Object.entries(proxyResponseHeaders(response.headers))) {
          res.setHeader(name, value)
        }
        res.setHeader('Cache-Control', 'no-store')
        res.writeHead(status, proxyCorsHeaders(req))
        response.pipe(res)
        response.once('end', finish)
      }
    )
    upstream.once('timeout', () => upstream.destroy(new Error('timeout')))
    upstream.once('error', (error) => {
      if (!res.headersSent) reject(res, error.message === 'timeout' ? 504 : 502, 'Upstream request failed')
      else res.destroy(error)
      finish()
    })
    req.once('aborted', () => upstream.destroy())
    if (method === 'GET') upstream.end()
    else req.pipe(upstream)
  })
}

async function handleRequest(
  root: string,
  index: string,
  req: IncomingMessage,
  res: ServerResponse,
  agentGateway: InfiniteCanvasAgentGateway | undefined,
  dependencies: InfiniteCanvasServerDependencies
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
    await proxyRequest(req, res, requestUrl, dependencies)
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
  dependencies: InfiniteCanvasServerDependencies = {}
): Promise<InfiniteCanvasServer> {
  const root = await realpath(assetsDirectory)
  const index = path.join(root, 'index.html')
  if (!(await stat(index)).isFile()) throw new Error('Infinite canvas index.html is missing')
  const server: Server = createServer((req, res) => {
    void handleRequest(root, index, req, res, agentGateway, dependencies)
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
