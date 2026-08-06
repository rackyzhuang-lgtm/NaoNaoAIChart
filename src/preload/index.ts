// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { assertRendererInvokeChannel } from 'src/shared/electron-ipc-channels'
import type { ElectronIPC } from 'src/shared/electron-types'
import { SUB2API_IPC_CHANNELS } from 'src/shared/sub2api/ipc'

// export type Channels = 'ipc-example';

function createListener<T extends unknown[]>(channel: string) {
  return (callback: (...args: T) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: T) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

const electronHandler: ElectronIPC = {
  invoke: (channel, ...args) => {
    assertRendererInvokeChannel(channel)
    return ipcRenderer.invoke(channel, ...args)
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
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
    completeTwoFactor: (code) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.completeTwoFactor, code),
    logout: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.logout),
    getSessionState: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getSessionState),
    getCurrentUser: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getCurrentUser),
    getUsageDashboardStats: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getUsageDashboardStats),
    getUsageDashboardTrend: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getUsageDashboardTrend),
    getUsageDashboardModels: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getUsageDashboardModels),
    getSubscriptionSummary: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getSubscriptionSummary),
    getPlatformQuotas: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.getPlatformQuotas),
    listApiKeys: () => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.listApiKeys),
    createApiKey: (request) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.createApiKey, request),
    updateApiKey: (id, request) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.updateApiKey, id, request),
    deleteApiKey: (id) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.deleteApiKey, id),
    prepareProviderBinding: (id) => ipcRenderer.invoke(SUB2API_IPC_CHANNELS.prepareProviderBinding, id),
  },

  // Auto-updater events
  onUpdaterChecking: createListener('updater:checking'),
  onUpdaterAvailable: createListener('updater:available'),
  onUpdaterNotAvailable: createListener('updater:not-available'),
  onUpdaterProgress: createListener('updater:progress'),
  onUpdaterDownloaded: createListener('updater:downloaded'),
  onUpdaterError: createListener('updater:error'),
}

contextBridge.exposeInMainWorld('electronAPI', electronHandler)
