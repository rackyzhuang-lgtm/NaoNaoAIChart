import type { z } from 'zod'
import {
  SUB2API_ROUTES,
  type Sub2ApiApiKeyCreateRequest,
  type Sub2ApiApiKeyPage,
  type Sub2ApiApiKeyUpdateRequest,
  type Sub2ApiLoginRequest,
  type Sub2ApiLoginResult,
  type Sub2ApiPlatformQuotasResponse,
  type Sub2ApiProviderBinding,
  type Sub2ApiPublicSettings,
  type Sub2ApiSubscriptionSummary,
  type Sub2ApiUsageDashboardModels,
  type Sub2ApiUsageDashboardStats,
  type Sub2ApiUsageDashboardTrend,
  type Sub2ApiUsageRecordPage,
  type Sub2ApiUser,
  sub2ApiApiKeyCreateRequestSchema,
  sub2ApiApiKeyDeleteResponseSchema,
  sub2ApiApiKeyPageSchema,
  sub2ApiApiKeySchema,
  sub2ApiApiKeyUpdateRequestSchema,
  sub2ApiAuthResponseSchema,
  sub2ApiLoginResponseSchema,
  sub2ApiLogoutResponseSchema,
  sub2ApiModelsResponseSchema,
  sub2ApiPlatformQuotasResponseSchema,
  sub2ApiProviderBindingSchema,
  sub2ApiPublicSettingsSchema,
  sub2ApiRefreshResponseSchema,
  sub2ApiSubscriptionSummarySchema,
  sub2ApiUsageDashboardModelsSchema,
  sub2ApiUsageDashboardStatsSchema,
  sub2ApiUsageDashboardTrendSchema,
  sub2ApiUsagePageRequestSchema,
  sub2ApiUsageRecordPageSchema,
  sub2ApiUserSchema,
} from '../../shared/sub2api/contracts'
import { Sub2ApiContractError, Sub2ApiError } from '../../shared/sub2api/errors'
import { buildSub2ApiGatewayUrl, buildSub2ApiPanelUrl, SUB2API_GATEWAY_BASE_URL } from '../../shared/sub2api/url'
import { Sub2ApiSession } from './session'

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

interface PanelEnvelope {
  code?: number | string
  message?: string
  reason?: string
  data?: unknown
}

const REQUEST_TIMEOUT_MS = 30_000

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

  constructor(
    private readonly session = new Sub2ApiSession(),
    private readonly fetchImplementation: FetchImplementation = fetch
  ) {}

  getSessionState() {
    return this.session.getState()
  }

  getPublicSettings(): Promise<Sub2ApiPublicSettings> {
    return this.requestPublic(SUB2API_ROUTES.publicSettings, { method: 'GET' }, sub2ApiPublicSettingsSchema)
  }

  async login(request: Sub2ApiLoginRequest): Promise<Sub2ApiLoginResult> {
    this.session.clear()
    const generation = this.session.getCredentialGeneration()
    const response = await this.requestPublic(
      SUB2API_ROUTES.login,
      { method: 'POST', body: JSON.stringify(request) },
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
    return { status: 'authenticated', user: response.user }
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

  async getUsageRecords(page: number): Promise<Sub2ApiUsageRecordPage> {
    const parsedPage = sub2ApiUsagePageRequestSchema.parse(page)
    const { data } = await this.requestAuthenticated(
      `${SUB2API_ROUTES.usageRecords}?page=${parsedPage}&page_size=20`,
      { method: 'GET' },
      sub2ApiUsageRecordPageSchema
    )
    return data
  }

  async getPlatformQuotas(): Promise<Sub2ApiPlatformQuotasResponse> {
    const { data } = await this.requestAuthenticated(
      SUB2API_ROUTES.platformQuotas,
      { method: 'GET' },
      sub2ApiPlatformQuotasResponseSchema
    )
    return data
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
    }
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
        await this.parsePanelResponse(response, schema)
        throw new Sub2ApiContractError()
      }

      try {
        await this.refreshSession()
        refreshAllowed = false
      } catch (error) {
        const currentAccessToken = this.session.getAccessToken()
        if (!currentAccessToken || this.session.isCredentialGeneration(generation)) {
          throw error
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
      })
      .catch((error: unknown) => {
        this.session.clearIfCredentialGeneration(generation)
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
      throw new Sub2ApiError('Unable to reach sub2api', 'NETWORK_ERROR')
    }
  }

  private async requestGatewayModels(apiKey: string) {
    try {
      const response = await this.fetchImplementation(buildSub2ApiGatewayUrl(SUB2API_ROUTES.models), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
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
        typeof payload.reason === 'string' ? payload.reason : undefined
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
