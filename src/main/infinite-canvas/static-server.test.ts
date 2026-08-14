import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPinnedHttpsRequestOptions,
  INFINITE_CANVAS_PROXY_TIMEOUT_MS,
  proxyRequestHeaders,
  type InfiniteCanvasServer,
  proxyResponseHeaders,
  startInfiniteCanvasServer,
} from './static-server'

const dirs: string[] = []
const servers: InfiniteCanvasServer[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('infinite canvas static server', () => {
  const publicDns = async () => [{ address: '93.184.216.34', family: 4 }]
  const proxyUrl = (server: InfiniteCanvasServer, target: string) =>
    `${server.url}_naonao_proxy/${Buffer.from(target).toString('base64url')}`

  it('serves assets, falls back to SPA index, and rejects traversal/non-GET', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'infinite-canvas-test-'))
    dirs.push(dir)
    await mkdir(path.join(dir, 'assets'))
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><main>canvas</main>')
    await writeFile(path.join(dir, 'assets', 'app.js'), 'console.log("ok")')
    const server = await startInfiniteCanvasServer(dir, undefined, { resolveDns: publicDns })
    servers.push(server)

    const index = await fetch(`${server.url}workspace/123`)
    expect(index.status).toBe(200)
    await expect(index.text()).resolves.toContain('canvas')
    expect(index.headers.get('content-security-policy')).toContain("connect-src 'self' data: blob:")
    const asset = await fetch(`${server.url}assets/app.js`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get('content-type')).toContain('text/javascript')
    expect((await fetch(`${server.url}%2e%2e%2findex.html`)).status).toBe(403)
    expect((await fetch(server.url, { method: 'POST' })).status).toBe(405)
    expect((await fetch(proxyUrl(server, 'http://models.example/v1/models'))).status).toBe(403)
    expect((await fetch(proxyUrl(server, 'https://eazyai.shop/admin/users'))).status).toBe(403)
    const preflight = await fetch(proxyUrl(server, 'https://other.example/v1/models'), {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:1212' },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:1212')
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization')
    expect(preflight.headers.get('access-control-allow-headers')).toContain('X-Goog-Api-Key')
    expect((await fetch(proxyUrl(server, 'https://other.example/v1/models'), { method: 'LINK' })).status).toBe(405)
  })

  it('binds to loopback only', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'infinite-canvas-test-'))
    dirs.push(dir)
    await writeFile(path.join(dir, 'index.html'), 'ok')
    const server = await startInfiniteCanvasServer(dir)
    servers.push(server)
    expect(new URL(server.url).hostname).toBe('127.0.0.1')
  })

  it('pins HTTPS dispatch to a DNS address that passed public-address validation', () => {
    const options = createPinnedHttpsRequestOptions(
      {
        ok: true,
        url: new URL('https://models.example/v1/images/generations?count=1'),
        addresses: [{ address: '93.184.216.34', family: 4 }],
      },
      'POST',
      { authorization: 'Bearer redacted' }
    )
    expect(options).toMatchObject({
      hostname: 'models.example',
      servername: 'models.example',
      path: '/v1/images/generations?count=1',
      method: 'POST',
      autoSelectFamily: false,
      family: 4,
      timeout: INFINITE_CANVAS_PROXY_TIMEOUT_MS,
    })
    expect(INFINITE_CANVAS_PROXY_TIMEOUT_MS).toBe(300_000)
    const callback = vi.fn()
    options.lookup('models.example', {}, callback)
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4)
  })

  it('forwards the Gemini API key header but not unrelated request headers', () => {
    expect(
      proxyRequestHeaders({
        headers: {
          accept: 'application/json',
          authorization: 'Bearer synthetic-openai-key',
          'content-type': 'application/json',
          'x-goog-api-key': 'synthetic-gemini-key',
          cookie: 'session=must-not-forward',
          'x-untrusted-header': 'must-not-forward',
        },
      })
    ).toEqual({
      accept: 'application/json',
      authorization: 'Bearer synthetic-openai-key',
      'content-type': 'application/json',
      'x-goog-api-key': 'synthetic-gemini-key',
    })
  })

  it('does not forward an upstream content length onto the loopback response stream', () => {
    expect(
      proxyResponseHeaders({
        'content-type': 'application/json',
        'content-length': '123456',
        'content-disposition': 'inline',
        'set-cookie': ['secret=value'],
      })
    ).toEqual({
      'content-type': 'application/json',
      'content-disposition': 'inline',
    })
  })
})
