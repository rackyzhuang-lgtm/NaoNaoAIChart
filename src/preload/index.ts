// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { assertRendererInvokeChannel } from 'src/shared/electron-ipc-channels'
import type { ElectronIPC } from 'src/shared/electron-types'
import { type Sub2ApiDirectGatewayStreamEvent, sub2ApiDirectGatewayStreamAckSchema } from 'src/shared/sub2api/contracts'
import { SUB2API_IPC_CHANNELS, SUB2API_IPC_EVENTS } from 'src/shared/sub2api/ipc'

// export type Channels = 'ipc-example';

function createListener<T extends unknown[]>(channel: string) {
  return (callback: (...args: T) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: T) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

const directGatewayStreamListeners = new Map<string, (event: Sub2ApiDirectGatewayStreamEvent) => void>()

ipcRenderer.on(SUB2API_IPC_EVENTS.directGatewayStream, (_event, streamEvent: Sub2ApiDirectGatewayStreamEvent) => {
  const listener = directGatewayStreamListeners.get(streamEvent.requestId)
  if (!listener) return
  listener(streamEvent)
  if (streamEvent.type === 'complete' || streamEvent.type === 'error') {
    directGatewayStreamListeners.delete(streamEvent.requestId)
  }
})

const electronHandler: ElectronIPC = {
  invoke: (channel, ...args) => {
    assertRendererInvokeChannel(channel)
    return ipcRenderer.invoke(channel, ...args)
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getInfiniteCanvasUrl: () => ipcRenderer.invoke('infinite-canvas:get-url'),
  getInfiniteCanvasAgentConnection: () => ipcRenderer.invoke('infinite-canvas:get-agent-connection'),
  configureInfiniteCanvasAgent: (input) => ipcRenderer.invoke('infinite-canvas:configure-agent', input),
  getInfiniteCanvasStoragePath: () => ipcRenderer.invoke('infinite-canvas:get-storage-path'),
  chooseInfiniteCanvasStoragePath: () => ipcRenderer.invoke('infinite-canvas:choose-storage-path'),
  setInfiniteCanvasHostTools: (tools) => ipcRenderer.invoke('infinite-canvas:set-host-tools', tools),
  completeInfiniteCanvasHostTool: (input) => ipcRenderer.invoke('infinite-canvas:host-tool-result', input),
  onInfiniteCanvasHostToolCall: createListener('infinite-canvas:host-tool-call'),
  onSystemThemeChange: (callback: () => void) => {
    ipcRenderer.on('system-theme-updated', callback)
    return () => ipcRenderer.off('system-theme-updated', callback)
  },
  onWindowMaximizedChanged: (callback: (_: Electron.IpcRendererEvent, windowMaximized: boolean) => void) => {
    ipcRenderer.on('window:maximized-changed', callback)
    return () => ipcRenderer.off('window:maximized-changed', callback)
  },
  onWindowFocused: (callback: (_: Electron.IpcRendererEvent) => void) => {
    ipcRenderer.on('window:focused', callback)
    return () => ipcRenderer.off('window:focused', callback)
  },
  onWindowShow: (callback: () => void) => {
    ipcRenderer.on('window-show', callback)
    return () => ipcRenderer.off('window-show', callback)
  },
  onUpdateDownloaded: (callback: () => void) => {
    ipcRenderer.on('update-downloaded', callback)
    return () => ipcRenderer.off('update-downloaded', callback)
  },
  addMcpStdioTransportEventListener: (transportId: string, event: string, callback?: (...args: any[]) => void) => {
    ipcRenderer.on(`mcp:stdio-transport:${transportId}:${event}`, (_event, ...args) => {
      callback?.(...args)
    })
  },
  onNavigate: (callback: (path: string) => void) => {
    const listener = (_event: unknown, path: string) => {
      callback(path)
    }
    ipcRenderer.on('navigate-to', listener)
    return () => ipcRenderer.off('navigate-to', listener)
  },
  onSkillsBuiltinUpdated: createListener('skills:builtin-updated'),
  sub2api: {
    getPublicSettings: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getPublicSettings),
    login: (request) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.login, request),
    register: (request) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.register, request),
    sendRegistrationCode: (request) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.sendRegistrationCode, request),
    completeTwoFactor: (code) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.completeTwoFactor, code),
    logout: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.logout),
    getSessionState: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getSessionState),
    getCurrentUser: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getCurrentUser),
    getUsageDashboardStats: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getUsageDashboardStats),
    getUsageDashboardTrend: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getUsageDashboardTrend),
    getUsageDashboardModels: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getUsageDashboardModels),
    redeemCode: (request) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.redeemCode, request),
    getRedeemHistory: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getRedeemHistory),
    getSubscriptionSummary: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getSubscriptionSummary),
    getChannelMonitors: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getChannelMonitors),
    getAnnouncements: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getAnnouncements),
    markAnnouncementRead: (id) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.markAnnouncementRead, id),
    getAvailableGroups: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getAvailableGroups),
    listApiKeys: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.listApiKeys),
    createApiKey: (request) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.createApiKey, request),
    updateApiKey: (id, request) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.updateApiKey, id, request),
    deleteApiKey: (id) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.deleteApiKey, id),
    copyApiKey: (id) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.copyApiKey, id),
    prepareProviderBinding: (id) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.prepareProviderBinding, id),
    prepareInfiniteCanvasImport: (id) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.prepareInfiniteCanvasImport, id),
    openDirectGatewayStream: async (requestId, request, onEvent) => {
      if (directGatewayStreamListeners.has(requestId)) {
        throw new Error('A direct gateway stream with this request ID is already registered')
      }
      directGatewayStreamListeners.set(requestId, onEvent)
      try {
        return sub2ApiDirectGatewayStreamAckSchema.parse(
          await ipcRenderer.invoke(SUB2API_IPC_CHANNELS.startDirectGatewayStream, { requestId, request })
        )
      } catch (error) {
        directGatewayStreamListeners.delete(requestId)
        throw error
      }
    },
    cancelDirectGatewayStream: (requestId) =>
      ipcRenderer.invoke(SUB2API_IPC_CHANNELS.cancelDirectGatewayStream, requestId),
    releaseDirectGatewayStream: (requestId) => {
      directGatewayStreamListeners.delete(requestId)
    },
  },

  // Auto-updater events
  onUpdaterChecking: createListener('updater:checking'),
  onUpdaterAvailable: createListener('updater:available'),
  onUpdaterNotAvailable: createListener('updater:not-available'),
  onUpdaterProgress: createListener('updater:progress'),
  onUpdaterDownloaded: createListener('updater:downloaded'),
  onUpdaterError: createListener('updater:error'),
}

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('electronAPI', electronHandler)
}
