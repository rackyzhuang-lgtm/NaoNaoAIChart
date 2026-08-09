import path from 'node:path'

export function validateInfiniteCanvasStoragePath(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 2_000 || !path.isAbsolute(trimmed)) {
    throw new Error('Invalid local storage directory')
  }
  return path.normalize(trimmed)
}
