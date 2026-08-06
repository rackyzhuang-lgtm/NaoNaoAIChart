import { v4 as uuidv4 } from 'uuid'
import platform from '@/platform'

export async function parseTextFile(file: File, options: { maxLength?: number } = {}) {
  let text = await file.text()
  if (options.maxLength) {
    text = text.trim().slice(0, options.maxLength)
  }
  const key = `parseFile-${uuidv4()}`
  await platform.setStoreBlob(key, text)
  return { key }
}

export function parseUrl(url: string): Promise<{ key: string; title: string }> {
  return Promise.reject(new Error(`Local URL parsing is unavailable: ${url}`))
}
