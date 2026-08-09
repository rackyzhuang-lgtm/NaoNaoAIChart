export interface InfiniteCanvasStoragePathApi {
  getInfiniteCanvasStoragePath: () => Promise<string>
  chooseInfiniteCanvasStoragePath: () => Promise<{
    canceled: boolean
    path?: string
    requiresRestart?: boolean
  }>
}

export function getInfiniteCanvasStoragePathApi(api: unknown): InfiniteCanvasStoragePathApi | null {
  if (
    !api ||
    typeof api !== 'object' ||
    typeof (api as InfiniteCanvasStoragePathApi).getInfiniteCanvasStoragePath !== 'function' ||
    typeof (api as InfiniteCanvasStoragePathApi).chooseInfiniteCanvasStoragePath !== 'function'
  ) {
    return null
  }
  return api as InfiniteCanvasStoragePathApi
}
