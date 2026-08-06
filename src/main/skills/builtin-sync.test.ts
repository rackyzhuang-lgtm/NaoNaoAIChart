import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const userDataRoot = vi.hoisted(() => ({ current: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataRoot.current),
  },
}))

vi.mock('../util', () => ({
  getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

vi.mock('./builtin', () => ({
  builtinSkills: [],
}))

import { syncBuiltinSkills } from './builtin-sync'

describe('syncBuiltinSkills', () => {
  beforeEach(() => {
    userDataRoot.current = fs.mkdtempSync(path.join(os.tmpdir(), 'naonao-builtin-skills-'))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fs.rmSync(userDataRoot.current, { recursive: true, force: true })
  })

  it('uses packaged seeds without a hosted network request', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network must not be called')))
    vi.stubGlobal('fetch', fetchSpy)

    await expect(syncBuiltinSkills('zh-Hans')).resolves.toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
