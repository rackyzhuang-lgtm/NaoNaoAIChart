import { ipcMain } from 'electron'
import {
  sub2ApiAnnouncementIdSchema,
  sub2ApiApiKeyCreateRequestSchema,
  sub2ApiApiKeyIdSchema,
  sub2ApiApiKeySummarySchema,
  sub2ApiApiKeyUpdateRequestSchema,
  sub2ApiLoginRequestSchema,
  sub2ApiRedeemCodeRequestSchema,
  sub2ApiRedeemHistorySummarySchema,
  sub2ApiTotpCodeSchema,
  sub2ApiUsageErrorIdSchema,
  sub2ApiUsagePageRequestSchema,
} from '../../shared/sub2api/contracts'
import { SUB2API_IPC_CHANNELS } from '../../shared/sub2api/ipc'
import { type Sub2ApiClient, sub2ApiClient } from './client'

type IpcMainHandler = Parameters<typeof ipcMain.handle>[1]
type IpcSenderGuard = (event: Electron.IpcMainInvokeEvent) => boolean

interface IpcMainRegistrar {
  handle(channel: string, listener: IpcMainHandler): void
}

function toApiKeySummary(apiKey: Awaited<ReturnType<Sub2ApiClient['listApiKeys']>>['items'][number]) {
  const { key, ...summary } = apiKey
  return sub2ApiApiKeySummarySchema.parse({
    ...summary,
    key_hint: key.length > 10 ? `${key.slice(0, 6)}...${key.slice(-4)}` : '****',
  })
}

function toRedeemHistorySummary(item: Awaited<ReturnType<Sub2ApiClient['getRedeemHistory']>>[number]) {
  const codeHint = item.code.length > 8 ? `${item.code.slice(0, 4)}...${item.code.slice(-4)}` : '****'
  return sub2ApiRedeemHistorySummarySchema.parse({
    id: item.id,
    code_hint: codeHint,
    type: item.type,
    value: item.value,
    status: item.status,
    used_at: item.used_at,
    created_at: item.created_at,
    expires_at: item.expires_at,
    validity_days: item.validity_days,
    group_name: item.group?.name,
  })
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
  registrar.handle(SUB2API_IPC_CHANNELS.getUsageDashboardStats, (event) => {
    requireTrustedSender(event)
    return client.getUsageDashboardStats()
  })
  registrar.handle(SUB2API_IPC_CHANNELS.getUsageDashboardTrend, (event) => {
    requireTrustedSender(event)
    return client.getUsageDashboardTrend()
  })
  registrar.handle(SUB2API_IPC_CHANNELS.getUsageDashboardModels, (event) => {
    requireTrustedSender(event)
    return client.getUsageDashboardModels()
  })
  registrar.handle(SUB2API_IPC_CHANNELS.getUsageRecords, (event, page) => {
    requireTrustedSender(event)
    return client.getUsageRecords(sub2ApiUsagePageRequestSchema.parse(page))
  })
  registrar.handle(SUB2API_IPC_CHANNELS.getUsageErrors, (event, page) => {
    requireTrustedSender(event)
    return client.getUsageErrors(sub2ApiUsagePageRequestSchema.parse(page))
  })
  registrar.handle(SUB2API_IPC_CHANNELS.getUsageErrorDetail, (event, id) => {
    requireTrustedSender(event)
    return client.getUsageErrorDetail(sub2ApiUsageErrorIdSchema.parse(id))
  })
  registrar.handle(SUB2API_IPC_CHANNELS.redeemCode, (event, request) => {
    requireTrustedSender(event)
    return client.redeemCode(sub2ApiRedeemCodeRequestSchema.parse(request))
  })
  registrar.handle(SUB2API_IPC_CHANNELS.getRedeemHistory, async (event) => {
    requireTrustedSender(event)
    const history = await client.getRedeemHistory()
    return history.map(toRedeemHistorySummary)
  })
  registrar.handle(SUB2API_IPC_CHANNELS.getSubscriptionSummary, (event) => {
    requireTrustedSender(event)
    return client.getSubscriptionSummary()
  })
  registrar.handle(SUB2API_IPC_CHANNELS.getPlatformQuotas, (event) => {
    requireTrustedSender(event)
    return client.getPlatformQuotas()
  })
  registrar.handle(SUB2API_IPC_CHANNELS.getChannelMonitors, (event) => {
    requireTrustedSender(event)
    return client.getChannelMonitors()
  })
  registrar.handle(SUB2API_IPC_CHANNELS.getModelPlaza, (event) => {
    requireTrustedSender(event)
    return client.getModelPlaza()
  })
  registrar.handle(SUB2API_IPC_CHANNELS.getAnnouncements, (event) => {
    requireTrustedSender(event)
    return client.getAnnouncements()
  })
  registrar.handle(SUB2API_IPC_CHANNELS.markAnnouncementRead, (event, id) => {
    requireTrustedSender(event)
    return client.markAnnouncementRead(sub2ApiAnnouncementIdSchema.parse(id))
  })
  registrar.handle(SUB2API_IPC_CHANNELS.listApiKeys, async (event) => {
    requireTrustedSender(event)
    const page = await client.listApiKeys()
    return {
      ...page,
      items: page.items.map(toApiKeySummary),
    }
  })
  registrar.handle(SUB2API_IPC_CHANNELS.createApiKey, async (event, request) => {
    requireTrustedSender(event)
    const apiKey = await client.createApiKey(sub2ApiApiKeyCreateRequestSchema.parse(request))
    return toApiKeySummary(apiKey)
  })
  registrar.handle(SUB2API_IPC_CHANNELS.updateApiKey, async (event, id, request) => {
    requireTrustedSender(event)
    const apiKey = await client.updateApiKey(
      sub2ApiApiKeyIdSchema.parse(id),
      sub2ApiApiKeyUpdateRequestSchema.parse(request)
    )
    return toApiKeySummary(apiKey)
  })
  registrar.handle(SUB2API_IPC_CHANNELS.deleteApiKey, async (event, id) => {
    requireTrustedSender(event)
    await client.deleteApiKey(sub2ApiApiKeyIdSchema.parse(id))
  })
  registrar.handle(SUB2API_IPC_CHANNELS.prepareProviderBinding, (event, id) => {
    requireTrustedSender(event)
    return client.prepareProviderBinding(sub2ApiApiKeyIdSchema.parse(id))
  })
}
