import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { type InfiniteCanvasServer, startInfiniteCanvasServer } from './static-server'

const dirs: string[] = []
const servers: InfiniteCanvasServer[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('infinite canvas static server', () => {
  it('serves assets, falls back to SPA index, and rejects traversal/non-GET', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'infinite-canvas-test-'))
    dirs.push(dir)
    await mkdir(path.join(dir, 'assets'))
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><main>canvas</main>')
    await writeFile(path.join(dir, 'assets', 'app.js'), 'console.log("ok")')
    const server = await startInfiniteCanvasServer(dir)
    servers.push(server)

    const index = await fetch(`${server.url}workspace/123`)
    expect(index.status).toBe(200)
    await expect(index.text()).resolves.toContain('canvas')
    expect(index.headers.get('content-security-policy')).toContain("connect-src 'self'")
    const asset = await fetch(`${server.url}assets/app.js`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get('content-type')).toContain('text/javascript')
    expect((await fetch(`${server.url}%2e%2e%2findex.html`)).status).toBe(403)
    expect((await fetch(server.url, { method: 'POST' })).status).toBe(405)
    expect((await fetch(`${server.url}_naonao_proxy/www.naonaoai.shop/v1/models`)).status).toBe(403)
    expect((await fetch(`${server.url}_naonao_proxy/eazyai.shop/admin/users`)).status).toBe(403)
    expect((await fetch(`${server.url}_naonao_proxy/other.example/v1/models`, { method: 'OPTIONS' })).status).toBe(403)
    expect((await fetch(`${server.url}_naonao_proxy/naonaoai.shop/v1/models`, { method: 'OPTIONS' })).status).toBe(204)
    expect((await fetch(`${server.url}_naonao_proxy/naonaoai.shop/v1/models`, { method: 'LINK' })).status).toBe(405)
  })

  it('binds to loopback only', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'infinite-canvas-test-'))
    dirs.push(dir)
    await writeFile(path.join(dir, 'index.html'), 'ok')
    const server = await startInfiniteCanvasServer(dir)
    servers.push(server)
    expect(new URL(server.url).hostname).toBe('127.0.0.1')
  })
})
