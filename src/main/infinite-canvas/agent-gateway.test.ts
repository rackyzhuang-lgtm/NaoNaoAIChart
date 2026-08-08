import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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
  })
})
