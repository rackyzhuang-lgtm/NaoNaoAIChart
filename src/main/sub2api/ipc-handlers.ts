import { clipboard, ipcMain } from 'electron'
import {
  type Sub2ApiDirectGatewayStreamEvent,
  sub2ApiAnnouncementIdSchema,
  sub2ApiApiKeyCreateRequestSchema,
  sub2ApiApiKeyIdSchema,
  sub2ApiApiKeySummarySchema,
  sub2ApiApiKeyUpdateRequestSchema,
  sub2ApiDirectGatewayRequestIdSchema,
  sub2ApiDirectGatewayStreamStartSchema,
  sub2ApiLoginRequestSchema,
  sub2ApiRedeemCodeRequestSchema,
  sub2ApiRedeemHistorySummarySchema,
  sub2ApiRegistrationRequestSchema,
  sub2ApiSendRegistrationCodeRequestSchema,
  sub2ApiTotpCodeSchema,
} from '../../shared/sub2api/contracts'
import { Sub2ApiError, serializeSub2ApiError } from '../../shared/sub2api/errors'
import { SUB2API_IPC_CHANNELS, SUB2API_IPC_EVENTS } from '../../shared/sub2api/ipc'
import { getLogger } from '../util'
import { type Sub2ApiClient, sub2ApiClient } from './client'

type IpcMainHandler = Parameters<typeof ipcMain.handle>[1]
type IpcSenderGuard = (event: Electron.IpcMainInvokeEvent) => boolean

const log = getLogger('sub2api:ipc')

function logGatewayStreamError(requestId: string, error: Sub2ApiError): void {
  log.warn(`[gateway-stream] error requestId=${requestId} code=${String(error.code)} status=${error.status ?? 'none'}`)
}

interface IpcMainRegistrar {
  handle(channel: string, listener: IpcMainHandler): void
}

type NavigationEvent = Electron.Event & {
  isMainFrame?: boolean
  isSameDocument?: boolean
}

function shouldCancelForNavigation(
  navigationEvent: NavigationEvent,
  legacyIsInPlace: boolean,
  legacyIsMainFrame: boolean
): boolean {
  const isMainFrame = navigationEvent.isMainFrame ?? legacyIsMainFrame
  const isSameDocument = navigationEvent.isSameDocument ?? legacyIsInPlace
  return isMainFrame && !isSameDocument
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
  const directGatewayOwners = new Map<string, number>()

  const requireTrustedSender = (event: Electron.IpcMainInvokeEvent): void => {
    if (!isTrustedSender(event)) {
      throw new Error('Sub2api IPC request rejected from an untrusted renderer')
    }
  }

  const registerHandler = (channel: string, listener: IpcMainHandler): void => {
    registrar.handle(channel, async (event, ...args) => {
      try {
        return await listener(event, ...args)
      } catch (error) {
        if (error instanceof Sub2ApiError) {
          throw new Error(serializeSub2ApiError(error))
        }
        throw error
      }
    })
  }

  registerHandler(SUB2API_IPC_CHANNELS.getPublicSettings, (event) => {
    requireTrustedSender(event)
    return client.getPublicSettings()
  })
  registerHandler(SUB2API_IPC_CHANNELS.login, (event, request) => {
    requireTrustedSender(event)
    return client.login(sub2ApiLoginRequestSchema.parse(request))
  })
  registerHandler(SUB2API_IPC_CHANNELS.register, (event, request) => {
    requireTrustedSender(event)
    return client.register(sub2ApiRegistrationRequestSchema.parse(request))
  })
  registerHandler(SUB2API_IPC_CHANNELS.sendRegistrationCode, (event, request) => {
    requireTrustedSender(event)
    return client.sendRegistrationCode(sub2ApiSendRegistrationCodeRequestSchema.parse(request))
  })
  registerHandler(SUB2API_IPC_CHANNELS.startDirectGatewayStream, (event, input) => {
    requireTrustedSender(event)
    const { requestId, request } = sub2ApiDirectGatewayStreamStartSchema.parse(input)
    const sender = event.sender
    const existingOwner = directGatewayOwners.get(requestId)
    if (existingOwner !== undefined && existingOwner !== sender.id) {
      throw new Sub2ApiError('sub2api gateway request ID belongs to another renderer', 'REQUEST_ID_CONFLICT')
    }
    directGatewayOwners.set(requestId, sender.id)

    const emit = (streamEvent: Sub2ApiDirectGatewayStreamEvent) => {
      try {
        if (!sender.isDestroyed()) {
          sender.send(SUB2API_IPC_EVENTS.directGatewayStream, streamEvent)
        }
      } catch {
        // The renderer may close between isDestroyed() and send().
      }
    }

    const cancelForRendererExit = () => client.cancelDirectGatewayRequest(requestId)
    const cancelForMainFrameNavigation = (
      navigationEvent: NavigationEvent,
      _url: string,
      isInPlace: boolean,
      isMainFrame: boolean
    ) => {
      if (shouldCancelForNavigation(navigationEvent, isInPlace, isMainFrame)) {
        cancelForRendererExit()
      }
    }
    const cleanupRendererLifecycle = () => {
      sender.removeListener('destroyed', cancelForRendererExit)
      sender.removeListener('render-process-gone', cancelForRendererExit)
      sender.removeListener('did-start-navigation', cancelForMainFrameNavigation)
      if (directGatewayOwners.get(requestId) === sender.id) {
        directGatewayOwners.delete(requestId)
      }
    }
    sender.once('destroyed', cancelForRendererExit)
    sender.once('render-process-gone', cancelForRendererExit)
    sender.on('did-start-navigation', cancelForMainFrameNavigation)

    let streamPromise: Promise<void>
    try {
      streamPromise = client.streamDirectGatewayRequest(requestId, request, emit)
    } catch (error) {
      cleanupRendererLifecycle()
      throw error
    }

    void streamPromise
      .catch((error: unknown) => {
        const safeError =
          error instanceof Sub2ApiError
            ? error
            : new Sub2ApiError('Unable to complete sub2api gateway request', 'GATEWAY_ERROR')
        logGatewayStreamError(requestId, safeError)
        emit({ requestId, type: 'error', error: serializeSub2ApiError(safeError) })
      })
      .finally(cleanupRendererLifecycle)
    return { requestId }
  })
  registerHandler(SUB2API_IPC_CHANNELS.cancelDirectGatewayStream, (event, requestId) => {
    requireTrustedSender(event)
    const parsedRequestId = sub2ApiDirectGatewayRequestIdSchema.parse(requestId)
    if (directGatewayOwners.get(parsedRequestId) !== event.sender.id) {
      throw new Sub2ApiError('sub2api gateway request belongs to another renderer', 'REQUEST_ID_CONFLICT')
    }
    client.cancelDirectGatewayRequest(parsedRequestId)
  })
  registerHandler(SUB2API_IPC_CHANNELS.completeTwoFactor, (event, code) => {
    requireTrustedSender(event)
    return client.completeTwoFactor(sub2ApiTotpCodeSchema.parse(code))
  })
  registerHandler(SUB2API_IPC_CHANNELS.logout, (event) => {
    requireTrustedSender(event)
    return client.logout()
  })
  registerHandler(SUB2API_IPC_CHANNELS.getSessionState, (event) => {
    requireTrustedSender(event)
    return client.getSessionState()
  })
  registerHandler(SUB2API_IPC_CHANNELS.getCurrentUser, (event) => {
    requireTrustedSender(event)
    return client.getCurrentUser()
  })
  registerHandler(SUB2API_IPC_CHANNELS.getUsageDashboardStats, (event) => {
    requireTrustedSender(event)
    return client.getUsageDashboardStats()
  })
  registerHandler(SUB2API_IPC_CHANNELS.getUsageDashboardTrend, (event) => {
    requireTrustedSender(event)
    return client.getUsageDashboardTrend()
  })
  registerHandler(SUB2API_IPC_CHANNELS.getUsageDashboardModels, (event) => {
    requireTrustedSender(event)
    return client.getUsageDashboardModels()
  })
  registerHandler(SUB2API_IPC_CHANNELS.redeemCode, (event, request) => {
    requireTrustedSender(event)
    return client.redeemCode(sub2ApiRedeemCodeRequestSchema.parse(request))
  })
  registerHandler(SUB2API_IPC_CHANNELS.getRedeemHistory, async (event) => {
    requireTrustedSender(event)
    const history = await client.getRedeemHistory()
    return history.map(toRedeemHistorySummary)
  })
  registerHandler(SUB2API_IPC_CHANNELS.getSubscriptionSummary, (event) => {
    requireTrustedSender(event)
    return client.getSubscriptionSummary()
  })
  registerHandler(SUB2API_IPC_CHANNELS.getChannelMonitors, (event) => {
    requireTrustedSender(event)
    return client.getChannelMonitors()
  })
  registerHandler(SUB2API_IPC_CHANNELS.getAnnouncements, (event) => {
    requireTrustedSender(event)
    return client.getAnnouncements()
  })
  registerHandler(SUB2API_IPC_CHANNELS.markAnnouncementRead, (event, id) => {
    requireTrustedSender(event)
    return client.markAnnouncementRead(sub2ApiAnnouncementIdSchema.parse(id))
  })
  registerHandler(SUB2API_IPC_CHANNELS.getAvailableGroups, (event) => {
    requireTrustedSender(event)
    return client.getAvailableGroups()
  })
  registerHandler(SUB2API_IPC_CHANNELS.listApiKeys, async (event) => {
    requireTrustedSender(event)
    const page = await client.listApiKeys()
    return {
      ...page,
      items: page.items.map(toApiKeySummary),
    }
  })
  registerHandler(SUB2API_IPC_CHANNELS.createApiKey, async (event, request) => {
    requireTrustedSender(event)
    const apiKey = await client.createApiKey(sub2ApiApiKeyCreateRequestSchema.parse(request))
    return toApiKeySummary(apiKey)
  })
  registerHandler(SUB2API_IPC_CHANNELS.updateApiKey, async (event, id, request) => {
    requireTrustedSender(event)
    const apiKey = await client.updateApiKey(
      sub2ApiApiKeyIdSchema.parse(id),
      sub2ApiApiKeyUpdateRequestSchema.parse(request)
    )
    return toApiKeySummary(apiKey)
  })
  registerHandler(SUB2API_IPC_CHANNELS.deleteApiKey, async (event, id) => {
    requireTrustedSender(event)
    await client.deleteApiKey(sub2ApiApiKeyIdSchema.parse(id))
  })
  registerHandler(SUB2API_IPC_CHANNELS.copyApiKey, async (event, id) => {
    requireTrustedSender(event)
    await client.copyApiKeyToClipboard(sub2ApiApiKeyIdSchema.parse(id), clipboard.writeText)
  })
  registerHandler(SUB2API_IPC_CHANNELS.prepareProviderBinding, (event, id) => {
    requireTrustedSender(event)
    return client.prepareProviderBinding(sub2ApiApiKeyIdSchema.parse(id))
  })
  registerHandler(SUB2API_IPC_CHANNELS.prepareInfiniteCanvasImport, (event, id) => {
    requireTrustedSender(event)
    return client.prepareInfiniteCanvasImport(sub2ApiApiKeyIdSchema.parse(id))
  })
}
