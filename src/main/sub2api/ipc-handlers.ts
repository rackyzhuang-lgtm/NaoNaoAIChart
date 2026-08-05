import { ipcMain } from 'electron'
import { sub2ApiLoginRequestSchema, sub2ApiTotpCodeSchema } from '../../shared/sub2api/contracts'
import { SUB2API_IPC_CHANNELS } from '../../shared/sub2api/ipc'
import { type Sub2ApiClient, sub2ApiClient } from './client'

type IpcMainHandler = Parameters<typeof ipcMain.handle>[1]
type IpcSenderGuard = (event: Electron.IpcMainInvokeEvent) => boolean

interface IpcMainRegistrar {
  handle(channel: string, listener: IpcMainHandler): void
}

export function registerSub2ApiHandlers(
  client: Sub2ApiClient = sub2ApiClient,
  registrar: IpcMainRegistrar = ipcMain,
  isTrustedSender: IpcSenderGuard = () => false
): void {
  const requireTrustedSender = (event: Electron.IpcMainInvokeEvent): void => {
    if (!isTrustedSender(event)) {
      throw new Error('Sub2api IPC request rejected from an untrusted renderer')
    }
  }

  registrar.handle(SUB2API_IPC_CHANNELS.getPublicSettings, (event) => {
    requireTrustedSender(event)
    return client.getPublicSettings()
  })
  registrar.handle(SUB2API_IPC_CHANNELS.login, (event, request) => {
    requireTrustedSender(event)
    return client.login(sub2ApiLoginRequestSchema.parse(request))
  })
  registrar.handle(SUB2API_IPC_CHANNELS.completeTwoFactor, (event, code) => {
    requireTrustedSender(event)
    return client.completeTwoFactor(sub2ApiTotpCodeSchema.parse(code))
  })
  registrar.handle(SUB2API_IPC_CHANNELS.logout, (event) => {
    requireTrustedSender(event)
    return client.logout()
  })
  registrar.handle(SUB2API_IPC_CHANNELS.getSessionState, (event) => {
    requireTrustedSender(event)
    return client.getSessionState()
  })
  registrar.handle(SUB2API_IPC_CHANNELS.getCurrentUser, (event) => {
    requireTrustedSender(event)
    return client.getCurrentUser()
  })
}
