import type { Sub2ApiRendererApi } from './sub2api/ipc'

export interface ElectronIPC {
  invoke: (channel: string, ...args: any[]) => Promise<any>
  getPathForFile: (file: File) => string
  getInfiniteCanvasUrl: () => Promise<string>
  getInfiniteCanvasAgentConnection: () => Promise<{ endpoint: string; token: string; configured: boolean }>
  configureInfiniteCanvasAgent: (input: { baseUrl: string; apiKey: string; model: string }) => Promise<{ configured: boolean; model: string }>
  setInfiniteCanvasHostTools: (tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>) => Promise<{ ok: boolean }>
  completeInfiniteCanvasHostTool: (input: { requestId: string; result?: unknown; error?: string }) => Promise<{ ok: boolean }>
  onInfiniteCanvasHostToolCall: (
    callback: (input: { requestId: string; name: string; input: Record<string, unknown> }) => void
  ) => () => void
  onSystemThemeChange: (callback: () => void) => () => void
  onWindowMaximizedChanged: (callback: (_: Electron.IpcRendererEvent, windowMaximized: boolean) => void) => () => void
  onWindowShow: (callback: () => void) => () => void
  onWindowFocused: (callback: () => void) => () => void
  onUpdateDownloaded: (callback: () => void) => () => void
  addMcpStdioTransportEventListener: (transportId: string, event: string, callback?: (...args: any[]) => void) => void
  onNavigate: (callback: (path: string) => void) => () => void
  // 内置 skill 后台同步完成（有更新）时由 main 推送，renderer 据此刷新 skill 列表与工具缓存
  onSkillsBuiltinUpdated: (callback: () => void) => () => void
  sub2api: Sub2ApiRendererApi

  // Auto-updater events
  onUpdaterChecking: (callback: () => void) => () => void
  onUpdaterAvailable: (callback: (data: { version: string }) => void) => () => void
  onUpdaterNotAvailable: (callback: () => void) => () => void
  onUpdaterProgress: (
    callback: (data: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void
  ) => () => void
  onUpdaterDownloaded: (callback: (data: { version: string }) => void) => () => void
  onUpdaterError: (callback: (data: { message: string }) => void) => () => void
}
