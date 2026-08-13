import type { Sub2ApiInfiniteCanvasImport } from '@shared/sub2api/contracts'

export interface PendingInfiniteCanvasImport {
  requestId: string
  payload: Sub2ApiInfiniteCanvasImport
}

let pendingImport: PendingInfiniteCanvasImport | null = null
let nextRequestId = 0
const listeners = new Set<() => void>()

function emitChange(): void {
  for (const listener of listeners) listener()
}

export function setPendingInfiniteCanvasImport(value: Sub2ApiInfiniteCanvasImport): string {
  nextRequestId += 1
  const requestId = `canvas-import-${nextRequestId}`
  pendingImport = { requestId, payload: value }
  emitChange()
  return requestId
}

export function getPendingInfiniteCanvasImport(): PendingInfiniteCanvasImport | null {
  return pendingImport
}

export function acknowledgePendingInfiniteCanvasImport(requestId: string): boolean {
  if (pendingImport?.requestId !== requestId) return false
  pendingImport = null
  emitChange()
  return true
}

export function subscribePendingInfiniteCanvasImport(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
