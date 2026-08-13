import { createParser } from 'eventsource-parser'
import type { z } from 'zod'
import {
  areSub2ApiDirectGatewayRequestsEqual,
  SUB2API_ROUTES,
  type Sub2ApiAnnouncement,
  type Sub2ApiApiKeyCreateRequest,
  type Sub2ApiApiKeyPage,
  type Sub2ApiApiKeyUpdateRequest,
  type Sub2ApiAvailableGroup,
  type Sub2ApiChannelMonitorResponse,
  type Sub2ApiDirectGatewayRequest,
  type Sub2ApiDirectGatewayStreamEvent,
  type Sub2ApiInfiniteCanvasImport,
  type Sub2ApiLoginRequest,
  type Sub2ApiLoginResult,
  type Sub2ApiProviderBinding,
  type Sub2ApiPublicSettings,
  type Sub2ApiRedeemCodeRequest,
  type Sub2ApiRedeemHistoryItem,
  type Sub2ApiRedeemResult,
  type Sub2ApiRegistrationRequest,
  type Sub2ApiSendRegistrationCodeRequest,
  type Sub2ApiSendRegistrationCodeResponse,
  type Sub2ApiSubscriptionSummary,
  type Sub2ApiUsageDashboardModels,
  type Sub2ApiUsageDashboardStats,
  type Sub2ApiUsageDashboardTrend,
  type Sub2ApiUser,
  sub2ApiAnnouncementIdSchema,
  sub2ApiAnnouncementReadResponseSchema,
  sub2ApiAnnouncementsSchema,
  sub2ApiApiKeyCreateRequestSchema,
  sub2ApiApiKeyDeleteResponseSchema,
  sub2ApiApiKeyIdSchema,
  sub2ApiApiKeyPageSchema,
  sub2ApiApiKeySchema,
  sub2ApiApiKeyUpdateRequestSchema,
  sub2ApiAuthResponseSchema,
  sub2ApiAvailableGroupsSchema,
  sub2ApiChannelMonitorResponseSchema,
  sub2ApiInfiniteCanvasImportSchema,
  sub2ApiLoginResponseSchema,
  sub2ApiLogoutResponseSchema,
  sub2ApiModelsResponseSchema,
  sub2ApiProviderBindingSchema,
  sub2ApiPublicSettingsSchema,
  sub2ApiRedeemCodeRequestSchema,
  sub2ApiRedeemHistorySchema,
  sub2ApiRedeemResultSchema,
  sub2ApiRefreshResponseSchema,
  sub2ApiRegistrationRequestSchema,
  sub2ApiSendRegistrationCodeRequestSchema,
  sub2ApiSendRegistrationCodeResponseSchema,
  sub2ApiSubscriptionSummarySchema,
  sub2ApiUsageDashboardModelsSchema,
  sub2ApiUsageDashboardStatsSchema,
  sub2ApiUsageDashboardTrendSchema,
  sub2ApiUserSchema,
} from '../../shared/sub2api/contracts'
import { Sub2ApiContractError, Sub2ApiError } from '../../shared/sub2api/errors'
import { buildSub2ApiGatewayUrl, buildSub2ApiPanelUrl, SUB2API_GATEWAY_BASE_URL } from '../../shared/sub2api/url'
import { getLogger } from '../util'
import { classifyInfiniteCanvasModels } from './canvas-model-capability'
import { Sub2ApiSession } from './session'

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface Sub2ApiAutoLoginStore {
  isAvailable(): boolean
  load(): string | null
  save(refreshToken: string): boolean
  clear(): void
}

interface PanelEnvelope {
  code?: number | string
  message?: string
  reason?: string
  data?: unknown
}

const REQUEST_TIMEOUT_MS = 30_000
const log = getLogger('sub2api:gateway')

const RESPONSES_TERMINAL_EVENTS = new Set(['response.completed', 'response.failed', 'response.incomplete'])

interface GatewayRequestEntry {
  requestId: string
  request: Sub2ApiDirectGatewayRequest
  target: URL
  headers: Headers
  emit: (event: Sub2ApiDirectGatewayStreamEvent) => void
  controller: AbortController
  promise: Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
}

function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  )
}

function readRetryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get('Retry-After')
  if (!value) {
    return undefined
  }
  const seconds = Number(value)
  if (Number.isInteger(seconds) && seconds >= 0) {
    return Math.min(seconds, 86_400)
  }
  const retryAt = Date.parse(value)
  if (Number.isNaN(retryAt)) {
    return undefined
  }
  return Math.min(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)), 86_400)
}

function isPanelEnvelope(value: unknown): value is PanelEnvelope {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new Sub2ApiContractError()
  }
}

export class Sub2ApiClient {
  #refreshInFlight: { generation: number; promise: Promise<void> } | null = null
  // A request ID is accepted at most once for the lifetime of this process.
  // Different IDs represent explicit independent generations and may run in
  // parallel; requests are never queued for delayed, automatic dispatch.
  #gatewayAcceptedRequestIds = new Set<string>()
  #gatewayRequestsInFlight = new Map<string, GatewayRequestEntry>()
  #autoLoginStore: Sub2ApiAutoLoginStore | undefined
  #autoLoginEnabled = false
  #autoLoginRequested = false

  constructor(
    private readonly session = new Sub2ApiSession(),
    private readonly fetchImplementation: FetchImplementation = fetch
  ) {}

  configureAutoLogin(store: Sub2ApiAutoLoginStore): void {
    this.#autoLoginStore = store
  }

  getSessionState() {
    return this.session.getState()
  }

  async restoreAutoLogin(): Promise<boolean> {
    const refreshToken = this.#autoLoginStore?.load()
    if (!refreshToken) {
      return false
    }
    try {
      const response = await this.requestPublic(
        SUB2API_ROUTES.refresh,
        { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) },
        sub2ApiRefreshResponseSchema
      )
      this.session.restoreFromRefresh(response)
      this.#autoLoginEnabled = this.#autoLoginStore?.save(response.refresh_token) ?? false
      return true
    } catch {
      this.#autoLoginEnabled = false
      this.session.clear()
      this.#autoLoginStore?.clear()
      return false
    }
  }

  getPublicSettings(): Promise<Sub2ApiPublicSettings> {
    return this.requestPublic(SUB2API_ROUTES.publicSettings, { method: 'GET' }, sub2ApiPublicSettingsSchema)
  }

  async login(request: Sub2ApiLoginRequest): Promise<Sub2ApiLoginResult> {
    const { auto_login: autoLogin, ...loginRequest } = request
    this.session.clear()
    this.#autoLoginEnabled = false
    this.#autoLoginRequested = autoLogin === true
    this.#autoLoginStore?.clear()
    const generation = this.session.getCredentialGeneration()
    const response = await this.requestPublic(
      SUB2API_ROUTES.login,
      { method: 'POST', body: JSON.stringify(loginRequest) },
      sub2ApiLoginResponseSchema
    )
    if (!this.session.isCredentialGeneration(generation)) {
      throw new Sub2ApiError('Session changed during login', 'SESSION_CHANGED')
    }

    if ('requires_2fa' in response) {
      this.session.setPendingTwoFactor(response.temp_token, response.user_email_masked)
      return { status: 'two_factor_required', userEmailMasked: response.user_email_masked }
    }

    this.session.setAuthenticated(response)
    this.persistAutoLogin(this.#autoLoginRequested)
    this.#autoLoginRequested = false
    return { status: 'authenticated', user: response.user }
  }

  sendRegistrationCode(request: Sub2ApiSendRegistrationCodeRequest): Promise<Sub2ApiSendRegistrationCodeResponse> {
    const parsedRequest = sub2ApiSendRegistrationCodeRequestSchema.parse(request)
    return this.requestPublic(
      SUB2API_ROUTES.sendRegistrationCode,
      { method: 'POST', body: JSON.stringify(parsedRequest) },
      sub2ApiSendRegistrationCodeResponseSchema
    )
  }

  async register(request: Sub2ApiRegistrationRequest): Promise<Sub2ApiLoginResult> {
    const parsedRequest = sub2ApiRegistrationRequestSchema.parse(request)
    this.session.clear()
    this.#autoLoginEnabled = false
    this.#autoLoginRequested = false
    this.#autoLoginStore?.clear()
    const response = await this.requestPublic(
      SUB2API_ROUTES.register,
      { method: 'POST', body: JSON.stringify(parsedRequest) },
      sub2ApiAuthResponseSchema
    )
    this.session.setAuthenticated(response)
    return { status: 'authenticated', user: response.user }
  }

  streamDirectGatewayRequest(
    requestId: string,
    request: Sub2ApiDirectGatewayRequest,
    emit: (event: Sub2ApiDirectGatewayStreamEvent) => void
  ): Promise<void> {
    const existing = this.#gatewayRequestsInFlight.get(requestId)
    if (existing) {
      if (!areSub2ApiDirectGatewayRequestsEqual(existing.request, request)) {
        return Promise.reject(new Sub2ApiError('Conflicting sub2api gateway request ID', 'REQUEST_ID_CONFLICT'))
      }
      log.debug(`[gateway-stream] reuse requestId=${requestId}`)
      return existing.promise
    }

    if (this.#gatewayAcceptedRequestIds.has(requestId)) {
      return Promise.reject(new Sub2ApiError('sub2api gateway request ID was already accepted', 'REQUEST_ID_REPLAY'))
    }

    let target: URL
    try {
      target = new URL(request.url)
    } catch {
      return Promise.reject(new Sub2ApiError('Unsupported sub2api gateway URL', 'GATEWAY_ERROR'))
    }
    const gateway = new URL(SUB2API_GATEWAY_BASE_URL)
    if (target.origin !== gateway.origin || !target.pathname.startsWith('/v1/')) {
      return Promise.reject(new Sub2ApiError('Unsupported sub2api gateway URL', 'GATEWAY_ERROR'))
    }
    const headers = new Headers()
    for (const name of ['Accept', 'Authorization', 'Cache-Control', 'Content-Type']) {
      const value = request.headers?.[name] || request.headers?.[name.toLowerCase()]
      if (value) headers.set(name, value)
    }
    headers.set('Cache-Control', 'no-cache, no-store, max-age=0')

    // Consume the ID before dispatch. Completion, failure, or cancellation can
    // never turn this logical action into another network request later.
    this.#gatewayAcceptedRequestIds.add(requestId)

    let resolvePromise!: () => void
    let rejectPromise!: (error: unknown) => void
    const pending = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve
      rejectPromise = reject
    })
    const entry: GatewayRequestEntry = {
      requestId,
      request,
      target,
      headers,
      emit,
      controller: new AbortController(),
      promise: pending,
      resolve: resolvePromise,
      reject: rejectPromise,
    }
    this.#gatewayRequestsInFlight.set(requestId, entry)
    log.debug(`[gateway-stream] start requestId=${entry.requestId}`)

    const finish = () => {
      if (this.#gatewayRequestsInFlight.get(entry.requestId) === entry) {
        this.#gatewayRequestsInFlight.delete(entry.requestId)
      }
      log.debug(`[gateway-stream] finish requestId=${entry.requestId}`)
    }

    void this.performDirectGatewayStream(
      entry.requestId,
      entry.request,
      entry.target,
      entry.headers,
      entry.controller,
      entry.emit
    ).then(
      () => {
        finish()
        entry.resolve()
      },
      (error: unknown) => {
        finish()
        entry.reject(error)
      }
    )
    return pending
  }

  cancelDirectGatewayRequest(requestId: string): void {
    this.#gatewayRequestsInFlight.get(requestId)?.controller.abort()
  }

  private async performDirectGatewayStream(
    requestId: string,
    request: Sub2ApiDirectGatewayRequest,
    target: URL,
    headers: Headers,
    controller: AbortController,
    emit: (event: Sub2ApiDirectGatewayStreamEvent) => void
  ): Promise<void> {
    try {
      const response = await this.fetchImplementation(target, {
        method: request.method,
        headers,
        body: request.method === 'GET' ? undefined : request.body,
        redirect: 'manual',
        signal: controller.signal,
      })

      if (response.status >= 300 && response.status < 400) {
        throw new Sub2ApiError('sub2api gateway redirects are not allowed', 'GATEWAY_ERROR', response.status)
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream'
      const isEventStream = contentType.toLowerCase().includes('text/event-stream')
      if (!response.body && isEventStream) {
        throw new Sub2ApiError('sub2api gateway stream ended before a terminal event', 'NETWORK_ERROR')
      }
      emit({
        requestId,
        type: 'response',
        status: response.status,
        headers: this.getSafeGatewayResponseHeaders(response.headers, contentType),
      })

      if (!response.body) {
        emit({ requestId, type: 'complete' })
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let terminalEventReceived = false
      const parser = isEventStream
        ? createParser({
            onEvent(event) {
              if (event.data.trim() === '[DONE]') {
                terminalEventReceived = true
                return
              }
              try {
                const payload = JSON.parse(event.data) as { type?: unknown }
                if (typeof payload.type === 'string' && RESPONSES_TERMINAL_EVENTS.has(payload.type)) {
                  terminalEventReceived = true
                }
              } catch {
                // The AI SDK remains the authority for validating provider events.
              }
            },
          })
        : null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const data = decoder.decode(value, { stream: true })
        if (data) {
          emit({ requestId, type: 'data', data })
          parser?.feed(data)
        }
        if (terminalEventReceived) {
          await reader.cancel().catch(() => undefined)
          break
        }
      }
      const trailingData = decoder.decode()
      if (trailingData) {
        emit({ requestId, type: 'data', data: trailingData })
        parser?.feed(trailingData)
      }
      if (parser && !terminalEventReceived) {
        throw new Sub2ApiError('sub2api gateway stream ended before a terminal event', 'NETWORK_ERROR')
      }
      emit({ requestId, type: 'complete' })
    } catch (error) {
      if (error instanceof Sub2ApiError) {
        throw error
      }
      if (controller.signal.aborted) {
        throw new Sub2ApiError('sub2api gateway request cancelled', 'REQUEST_CANCELLED')
      }
      throw new Sub2ApiError('Unable to read sub2api gateway response', 'NETWORK_ERROR')
    }
  }

  private getSafeGatewayResponseHeaders(headers: Headers, contentType: string): Record<string, string> {
    const result: Record<string, string> = { 'content-type': contentType }
    for (const name of ['cache-control', 'content-length', 'x-request-id', 'retry-after']) {
      const value = headers.get(name)
      if (value) result[name] = value
    }
    return result
  }

  async completeTwoFactor(code: string): Promise<Sub2ApiLoginResult> {
    const tempToken = this.session.getPendingTwoFactorToken()
    if (!tempToken) {
      throw new Sub2ApiError('No pending two-factor login', 'TWO_FACTOR_NOT_PENDING')
    }
    const generation = this.session.getCredentialGeneration()

    const response = await this.requestPublic(
      SUB2API_ROUTES.login2FA,
      { method: 'POST', body: JSON.stringify({ temp_token: tempToken, totp_code: code }) },
      sub2ApiAuthResponseSchema
    )
    if (!this.session.isCredentialGeneration(generation)) {
      throw new Sub2ApiError('Session changed during two-factor login', 'SESSION_CHANGED')
    }
    this.session.setAuthenticated(response)
    this.persistAutoLogin(this.#autoLoginRequested)
    this.#autoLoginRequested = false
    return { status: 'authenticated', user: response.user }
  }

  async getCurrentUser(): Promise<Sub2ApiUser> {
    const { data: user, generation } = await this.requestAuthenticated(
      SUB2API_ROUTES.currentUser,
      { method: 'GET' },
      sub2ApiUserSchema
    )
    if (!this.session.isCredentialGeneration(generation)) {
      throw new Sub2ApiError('Session changed while reading current user', 'SESSION_CHANGED')
    }
    this.session.setUser(user)
    return user
  }

  async listApiKeys(): Promise<Sub2ApiApiKeyPage> {
    const { data } = await this.requestAuthenticated(
      `${SUB2API_ROUTES.apiKeys}?page=1&page_size=100`,
      { method: 'GET' },
      sub2ApiApiKeyPageSchema
    )
    return data
  }

  async getAvailableGroups(): Promise<Sub2ApiAvailableGroup[]> {
    const { data } = await this.requestAuthenticated(
      SUB2API_ROUTES.availableGroups,
      { method: 'GET' },
      sub2ApiAvailableGroupsSchema
    )
    return data
  }

  async getUsageDashboardStats(): Promise<Sub2ApiUsageDashboardStats> {
    const { data } = await this.requestAuthenticated(
      SUB2API_ROUTES.usageDashboardStats,
      { method: 'GET' },
      sub2ApiUsageDashboardStatsSchema
    )
    return data
  }

  async getSubscriptionSummary(): Promise<Sub2ApiSubscriptionSummary> {
    const { data } = await this.requestAuthenticated(
      SUB2API_ROUTES.subscriptionsSummary,
      { method: 'GET' },
      sub2ApiSubscriptionSummarySchema
    )
    return data
  }

  async getUsageDashboardTrend(): Promise<Sub2ApiUsageDashboardTrend> {
    const { data } = await this.requestAuthenticated(
      SUB2API_ROUTES.usageDashboardTrend,
      { method: 'GET' },
      sub2ApiUsageDashboardTrendSchema
    )
    return data
  }

  async getUsageDashboardModels(): Promise<Sub2ApiUsageDashboardModels> {
    const { data } = await this.requestAuthenticated(
      SUB2API_ROUTES.usageDashboardModels,
      { method: 'GET' },
      sub2ApiUsageDashboardModelsSchema
    )
    return data
  }

  async redeemCode(request: Sub2ApiRedeemCodeRequest): Promise<Sub2ApiRedeemResult> {
    const parsedRequest = sub2ApiRedeemCodeRequestSchema.parse(request)
    const { data } = await this.requestAuthenticated(
      SUB2API_ROUTES.redeem,
      { method: 'POST', body: JSON.stringify(parsedRequest) },
      sub2ApiRedeemResultSchema
    )
    return data
  }

  async getRedeemHistory(): Promise<Sub2ApiRedeemHistoryItem[]> {
    const { data } = await this.requestAuthenticated(
      SUB2API_ROUTES.redeemHistory,
      { method: 'GET' },
      sub2ApiRedeemHistorySchema
    )
    return data
  }

  async getChannelMonitors(): Promise<Sub2ApiChannelMonitorResponse> {
    const { data } = await this.requestAuthenticated(
      SUB2API_ROUTES.channelMonitors,
      { method: 'GET' },
      sub2ApiChannelMonitorResponseSchema
    )
    return data
  }

  async getAnnouncements(): Promise<Sub2ApiAnnouncement[]> {
    const { data } = await this.requestAuthenticated(
      SUB2API_ROUTES.announcements,
      { method: 'GET' },
      sub2ApiAnnouncementsSchema
    )
    return data
  }

  async markAnnouncementRead(id: number): Promise<void> {
    const parsedId = sub2ApiAnnouncementIdSchema.parse(id)
    await this.requestAuthenticated(
      `${SUB2API_ROUTES.announcements}/${parsedId}/read`,
      { method: 'POST' },
      sub2ApiAnnouncementReadResponseSchema
    )
  }

  async createApiKey(request: Sub2ApiApiKeyCreateRequest) {
    const parsedRequest = sub2ApiApiKeyCreateRequestSchema.parse(request)
    const { data } = await this.requestAuthenticated(
      SUB2API_ROUTES.apiKeys,
      { method: 'POST', body: JSON.stringify(parsedRequest) },
      sub2ApiApiKeySchema
    )
    return data
  }

  async updateApiKey(id: number, request: Sub2ApiApiKeyUpdateRequest) {
    const parsedRequest = sub2ApiApiKeyUpdateRequestSchema.parse(request)
    const { data } = await this.requestAuthenticated(
      `${SUB2API_ROUTES.apiKeys}/${id}`,
      { method: 'PUT', body: JSON.stringify(parsedRequest) },
      sub2ApiApiKeySchema
    )
    return data
  }

  async deleteApiKey(id: number): Promise<void> {
    await this.requestAuthenticated(
      `${SUB2API_ROUTES.apiKeys}/${id}`,
      { method: 'DELETE' },
      sub2ApiApiKeyDeleteResponseSchema
    )
  }

  async copyApiKeyToClipboard(id: number, writeText: (text: string) => void): Promise<void> {
    const parsedId = sub2ApiApiKeyIdSchema.parse(id)
    const { data: apiKey } = await this.requestAuthenticated(
      `${SUB2API_ROUTES.apiKeys}/${parsedId}`,
      { method: 'GET' },
      sub2ApiApiKeySchema
    )
    writeText(apiKey.key)
  }

  async prepareProviderBinding(id: number): Promise<Sub2ApiProviderBinding> {
    const { data: apiKey } = await this.requestAuthenticated(
      `${SUB2API_ROUTES.apiKeys}/${id}`,
      { method: 'GET' },
      sub2ApiApiKeySchema
    )
    const modelsResponse = await this.requestGatewayModels(apiKey.key)
    return sub2ApiProviderBindingSchema.parse({
      apiKey: apiKey.key,
      apiHost: SUB2API_GATEWAY_BASE_URL.replace(/\/$/, ''),
      models: modelsResponse.data,
    })
  }

  async prepareInfiniteCanvasImport(id: number): Promise<Sub2ApiInfiniteCanvasImport> {
    const parsedId = sub2ApiApiKeyIdSchema.parse(id)
    const { data: apiKey } = await this.requestAuthenticated(
      `${SUB2API_ROUTES.apiKeys}/${parsedId}`,
      { method: 'GET' },
      sub2ApiApiKeySchema
    )
    const models = await this.requestGatewayModels(apiKey.key)
    const classifiedModels = classifyInfiniteCanvasModels(models.data)
    if (classifiedModels.length === 0) {
      throw new Sub2ApiContractError('The selected API key did not return any importable models')
    }
    return sub2ApiInfiniteCanvasImportSchema.parse({
      keyId: apiKey.id,
      keyName: apiKey.name,
      baseUrl: SUB2API_GATEWAY_BASE_URL.replace(/\/v1\/?$/, ''),
      apiKey: apiKey.key,
      models: classifiedModels,
    })
  }

  async logout(): Promise<void> {
    const refreshToken = this.session.getRefreshToken()
    const generation = this.session.getCredentialGeneration()
    try {
      if (refreshToken) {
        await this.requestPublic(
          SUB2API_ROUTES.logout,
          { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) },
          sub2ApiLogoutResponseSchema
        )
      }
    } catch {
      // Remote logout is best-effort; local credentials must always be discarded.
    } finally {
      this.session.clearIfCredentialGeneration(generation)
      this.#autoLoginEnabled = false
      this.#autoLoginStore?.clear()
    }
  }

  private persistAutoLogin(enabled: boolean): void {
    const refreshToken = this.session.getRefreshToken()
    this.#autoLoginEnabled = enabled && refreshToken ? (this.#autoLoginStore?.save(refreshToken) ?? false) : false
  }

  private async requestPublic<T>(route: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
    const response = await this.fetchPanel(route, init)
    return this.parsePanelResponse(response, schema)
  }

  private async requestAuthenticated<T>(
    route: string,
    init: RequestInit,
    schema: z.ZodType<T>
  ): Promise<{ data: T; generation: number }> {
    let refreshAllowed = true
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const accessToken = this.session.getAccessToken()
      const generation = this.session.getCredentialGeneration()
      if (!accessToken) {
        throw new Sub2ApiError('Authentication required', 'NOT_AUTHENTICATED', 401)
      }

      const response = await this.fetchPanel(route, init, accessToken)
      if (!this.session.isCredentialGeneration(generation)) {
        refreshAllowed = true
        continue
      }
      if (response.status !== 401) {
        const data = await this.parsePanelResponse(response, schema)
        if (!this.session.isCredentialGeneration(generation)) {
          refreshAllowed = true
          continue
        }
        return { data, generation }
      }
      if (!refreshAllowed) {
        this.session.clearIfCredentialGeneration(generation)
        throw new Sub2ApiError('Session expired', 'SESSION_EXPIRED', 401)
      }

      try {
        await this.refreshSession()
        refreshAllowed = false
      } catch {
        const currentAccessToken = this.session.getAccessToken()
        if (!currentAccessToken || this.session.isCredentialGeneration(generation)) {
          throw new Sub2ApiError('Session expired', 'SESSION_EXPIRED', 401)
        }
        refreshAllowed = true
      }
    }
    throw new Sub2ApiError('Session changed during request', 'SESSION_CHANGED')
  }

  private refreshSession(): Promise<void> {
    const refreshToken = this.session.getRefreshToken()
    const generation = this.session.getCredentialGeneration()
    if (!refreshToken) {
      this.session.clear()
      return Promise.reject(new Sub2ApiError('Session expired', 'REFRESH_TOKEN_MISSING', 401))
    }
    if (this.#refreshInFlight?.generation === generation) {
      return this.#refreshInFlight.promise
    }

    const pending = this.requestPublic(
      SUB2API_ROUTES.refresh,
      { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) },
      sub2ApiRefreshResponseSchema
    )
      .then((response) => {
        if (!this.session.isCredentialGeneration(generation)) {
          throw new Sub2ApiError('Session changed during refresh', 'SESSION_CHANGED')
        }
        this.session.rotateTokens(response)
        if (this.#autoLoginEnabled) {
          this.#autoLoginEnabled = this.#autoLoginStore?.save(response.refresh_token) ?? false
        }
      })
      .catch((error: unknown) => {
        this.session.clearIfCredentialGeneration(generation)
        this.#autoLoginEnabled = false
        this.#autoLoginStore?.clear()
        throw error
      })

    this.#refreshInFlight = { generation, promise: pending }
    const clearRefreshPromise = () => {
      if (this.#refreshInFlight?.promise === pending) {
        this.#refreshInFlight = null
      }
    }
    void pending.then(clearRefreshPromise, clearRefreshPromise)
    return pending
  }

  private async fetchPanel(route: string, init: RequestInit, accessToken?: string): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (init.body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }

    try {
      return await this.fetchImplementation(buildSub2ApiPanelUrl(route), {
        ...init,
        headers,
        signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      if (error instanceof Sub2ApiError) {
        throw error
      }
      if (isTimeoutError(error)) {
        throw new Sub2ApiError('sub2api request timed out', 'TIMEOUT_ERROR')
      }
      throw new Sub2ApiError('Unable to reach sub2api', 'NETWORK_ERROR')
    }
  }

  private async requestGatewayModels(apiKey: string) {
    try {
      const response = await this.fetchImplementation(buildSub2ApiGatewayUrl(SUB2API_ROUTES.models), {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache, no-store, max-age=0',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) {
        throw new Sub2ApiError('Unable to load models from sub2api', 'GATEWAY_ERROR', response.status)
      }
      const payload = await readJson(response)
      const parsed = sub2ApiModelsResponseSchema.safeParse(payload)
      if (!parsed.success) {
        throw new Sub2ApiContractError()
      }
      return parsed.data
    } catch (error) {
      if (error instanceof Sub2ApiError || error instanceof Sub2ApiContractError) {
        throw error
      }
      if (isTimeoutError(error)) {
        throw new Sub2ApiError('sub2api model gateway request timed out', 'TIMEOUT_ERROR')
      }
      throw new Sub2ApiError('Unable to reach sub2api model gateway', 'NETWORK_ERROR')
    }
  }

  private async parsePanelResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
    const payload = await readJson(response)
    if (!isPanelEnvelope(payload)) {
      throw new Sub2ApiContractError()
    }

    if (!response.ok || payload.code !== 0) {
      throw new Sub2ApiError(
        typeof payload.message === 'string' && payload.message ? payload.message : 'sub2api request failed',
        payload.code ?? response.status,
        response.status,
        typeof payload.reason === 'string' ? payload.reason : undefined,
        response.status === 429 ? readRetryAfterSeconds(response) : undefined
      )
    }

    const parsed = schema.safeParse(payload.data)
    if (!parsed.success) {
      throw new Sub2ApiContractError()
    }
    return parsed.data
  }
}

export const sub2ApiClient = new Sub2ApiClient()
