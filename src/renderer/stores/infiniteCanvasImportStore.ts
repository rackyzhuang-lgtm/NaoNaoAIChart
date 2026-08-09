import type { Sub2ApiInfiniteCanvasImport } from '@shared/sub2api/contracts'

let pendingImport: Sub2ApiInfiniteCanvasImport | null = null

export function setPendingInfiniteCanvasImport(value: Sub2ApiInfiniteCanvasImport): void {
  pendingImport = value
}

export function takePendingInfiniteCanvasImport(): Sub2ApiInfiniteCanvasImport | null {
  const value = pendingImport
  pendingImport = null
  return value
}
