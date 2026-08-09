import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateInfiniteCanvasStoragePath } from './storage-path'

describe('validateInfiniteCanvasStoragePath', () => {
  it('accepts and normalizes an absolute directory', () => {
    const value = path.join(path.parse(process.cwd()).root, 'canvas-storage', '..', 'canvas-storage')
    expect(validateInfiniteCanvasStoragePath(value)).toBe(path.normalize(value))
  })

  it('rejects relative, empty, and oversized paths', () => {
    expect(() => validateInfiniteCanvasStoragePath('canvas-storage')).toThrow('Invalid local storage directory')
    expect(() => validateInfiniteCanvasStoragePath('')).toThrow('Invalid local storage directory')
    expect(() => validateInfiniteCanvasStoragePath('x'.repeat(2_001))).toThrow('Invalid local storage directory')
  })
})
