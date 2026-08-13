import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Vitest discovery boundaries', () => {
  it('excludes nested dependency and release directories', () => {
    const configSource = fs.readFileSync(path.resolve(process.cwd(), 'vitest.config.ts'), 'utf8')

    expect(configSource).toContain("'**/node_modules/**'")
    expect(configSource).toContain("'**/release/**'")
  })
})
