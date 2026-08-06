import { z } from 'zod'

export const sub2ApiUserSchema = z
  .object({
    id: z.number().int().positive(),
    username: z.string(),
    email: z.string(),
    role: z.enum(['admin', 'user']),
    balance: z.number(),
    concurrency: z.number().int(),
    status: z.enum(['active', 'disabled']),
    run_mode: z.enum(['standard', 'simple']).optional(),
  })
  .strip()

export type Sub2ApiUser = z.infer<typeof sub2ApiUserSchema>

export const sub2ApiAuthTokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  token_type: z.string().min(1),
})

export const sub2ApiAuthResponseSchema = sub2ApiAuthTokensSchema.extend({
  user: sub2ApiUserSchema,
})

export type Sub2ApiAuthResponse = z.infer<typeof sub2ApiAuthResponseSchema>

export const sub2ApiTotpLoginResponseSchema = z.object({
  requires_2fa: z.literal(true),
  temp_token: z.string().min(1),
  user_email_masked: z.string().optional(),
})

export const sub2ApiLoginResponseSchema = z.union([sub2ApiTotpLoginResponseSchema, sub2ApiAuthResponseSchema])

export type Sub2ApiLoginResponse = z.infer<typeof sub2ApiLoginResponseSchema>

export const sub2ApiRefreshResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string().min(1),
})

export type Sub2ApiRefreshResponse = z.infer<typeof sub2ApiRefreshResponseSchema>

export const sub2ApiLogoutResponseSchema = z.object({
  message: z.string(),
})

export const sub2ApiPublicSettingsSchema = z
  .object({
    registration_enabled: z.boolean().optional(),
    turnstile_enabled: z.boolean().optional(),
    tencent_captcha_enabled: z.boolean().optional(),
    totp_enabled: z.boolean().optional(),
    backend_mode_enabled: z.boolean().optional(),
    available_channels_enabled: z.boolean().optional(),
    channel_monitor_enabled: z.boolean().optional(),
    model_plaza_enabled: z.boolean().optional(),
    model_plaza_require_auth: z.boolean().optional(),
    version: z.string().optional(),
  })
  .passthrough()

export type Sub2ApiPublicSettings = z.infer<typeof sub2ApiPublicSettingsSchema>

export const sub2ApiApiKeySchema = z
  .object({
    id: z.number().int().positive(),
    user_id: z.number().int().positive(),
    key: z.string(),
    name: z.string(),
    group_id: z.number().int().positive().nullable(),
    status: z.enum(['active', 'inactive', 'quota_exhausted', 'expired']),
    quota: z.number(),
    quota_used: z.number(),
    expires_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough()

export type Sub2ApiApiKey = z.infer<typeof sub2ApiApiKeySchema>

export const sub2ApiApiKeyPageSchema = z.object({
  items: z.array(sub2ApiApiKeySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().positive(),
  pages: z.number().int().positive(),
})

export type Sub2ApiApiKeyPage = z.infer<typeof sub2ApiApiKeyPageSchema>

export const sub2ApiApiKeySummarySchema = sub2ApiApiKeySchema
  .omit({ key: true })
  .strip()
  .extend({
    key_hint: z.string().min(1),
  })

export type Sub2ApiApiKeySummary = z.infer<typeof sub2ApiApiKeySummarySchema>

export const sub2ApiApiKeyIdSchema = z.number().int().positive()

export const sub2ApiApiKeyPageSummarySchema = sub2ApiApiKeyPageSchema.extend({
  items: z.array(sub2ApiApiKeySummarySchema),
})

export type Sub2ApiApiKeyPageSummary = z.infer<typeof sub2ApiApiKeyPageSummarySchema>

export const sub2ApiApiKeyCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  quota: z.number().nonnegative().optional(),
  expires_in_days: z.number().int().positive().optional(),
})

export type Sub2ApiApiKeyCreateRequest = z.infer<typeof sub2ApiApiKeyCreateRequestSchema>

export const sub2ApiApiKeyUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .refine((value) => value.name !== undefined || value.status !== undefined, {
    message: 'At least one API key field must be updated',
  })

export type Sub2ApiApiKeyUpdateRequest = z.infer<typeof sub2ApiApiKeyUpdateRequestSchema>

export const sub2ApiApiKeyDeleteResponseSchema = z.object({
  message: z.string(),
})

export const sub2ApiModelSchema = z
  .object({
    id: z.string().min(1),
    object: z.string().optional(),
    owned_by: z.string().optional(),
  })
  .passthrough()

export type Sub2ApiModel = z.infer<typeof sub2ApiModelSchema>

export const sub2ApiModelsResponseSchema = z.object({
  object: z.literal('list'),
  data: z.array(sub2ApiModelSchema),
})

export type Sub2ApiModelsResponse = z.infer<typeof sub2ApiModelsResponseSchema>

export const sub2ApiProviderBindingSchema = z.object({
  apiKey: z.string().min(1),
  apiHost: z.string().url(),
  models: z.array(sub2ApiModelSchema),
})

export type Sub2ApiProviderBinding = z.infer<typeof sub2ApiProviderBindingSchema>

export const sub2ApiPlatformUsageStatsSchema = z
  .object({
    platform: z.string().min(1),
    total_requests: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
    total_actual_cost: z.number().nonnegative(),
    today_requests: z.number().int().nonnegative(),
    today_tokens: z.number().int().nonnegative(),
    today_actual_cost: z.number().nonnegative(),
  })
  .strip()

export const sub2ApiUsageDashboardStatsSchema = z
  .object({
    total_api_keys: z.number().int().nonnegative(),
    active_api_keys: z.number().int().nonnegative(),
    total_requests: z.number().int().nonnegative(),
    total_input_tokens: z.number().int().nonnegative(),
    total_output_tokens: z.number().int().nonnegative(),
    total_cache_creation_tokens: z.number().int().nonnegative(),
    total_cache_read_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
    total_cost: z.number().nonnegative(),
    total_actual_cost: z.number().nonnegative(),
    today_requests: z.number().int().nonnegative(),
    today_input_tokens: z.number().int().nonnegative(),
    today_output_tokens: z.number().int().nonnegative(),
    today_cache_creation_tokens: z.number().int().nonnegative(),
    today_cache_read_tokens: z.number().int().nonnegative(),
    today_tokens: z.number().int().nonnegative(),
    today_cost: z.number().nonnegative(),
    today_actual_cost: z.number().nonnegative(),
    average_duration_ms: z.number().nonnegative(),
    rpm: z.number().nonnegative(),
    tpm: z.number().nonnegative(),
    by_platform: z.array(sub2ApiPlatformUsageStatsSchema).optional(),
  })
  .strip()

export type Sub2ApiUsageDashboardStats = z.infer<typeof sub2ApiUsageDashboardStatsSchema>

export const sub2ApiUsageTrendItemSchema = z
  .object({
    date: z.string().min(1),
    requests: z.number().int().nonnegative(),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_creation_tokens: z.number().int().nonnegative(),
    cache_read_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
    cost: z.number().nonnegative(),
    actual_cost: z.number().nonnegative(),
  })
  .strip()

export type Sub2ApiUsageTrendItem = z.infer<typeof sub2ApiUsageTrendItemSchema>

export const sub2ApiUsageDashboardTrendSchema = z
  .object({
    trend: z.array(sub2ApiUsageTrendItemSchema),
    start_date: z.string().min(1),
    end_date: z.string().min(1),
    granularity: z.string().min(1),
  })
  .strip()

export type Sub2ApiUsageDashboardTrend = z.infer<typeof sub2ApiUsageDashboardTrendSchema>

export const sub2ApiUsageModelItemSchema = z
  .object({
    model: z.string().min(1),
    requests: z.number().int().nonnegative(),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_creation_tokens: z.number().int().nonnegative(),
    cache_read_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
    cost: z.number().nonnegative(),
    actual_cost: z.number().nonnegative(),
  })
  .strip()

export type Sub2ApiUsageModelItem = z.infer<typeof sub2ApiUsageModelItemSchema>

export const sub2ApiUsageDashboardModelsSchema = z
  .object({
    models: z.array(sub2ApiUsageModelItemSchema),
    start_date: z.string().min(1),
    end_date: z.string().min(1),
  })
  .strip()

export type Sub2ApiUsageDashboardModels = z.infer<typeof sub2ApiUsageDashboardModelsSchema>

export const sub2ApiUsageRecordSchema = z
  .object({
    id: z.number().int().positive(),
    api_key_id: z.number().int().nonnegative(),
    model: z.string().min(1),
    request_type: z.string().min(1),
    billing_mode: z.string().min(1).nullable().optional(),
    stream: z.boolean(),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_creation_tokens: z.number().int().nonnegative(),
    cache_read_tokens: z.number().int().nonnegative(),
    total_cost: z.number().nonnegative(),
    actual_cost: z.number().nonnegative(),
    duration_ms: z.number().int().nonnegative().nullable(),
    created_at: z.string().min(1),
  })
  .strip()

export type Sub2ApiUsageRecord = z.infer<typeof sub2ApiUsageRecordSchema>

export const sub2ApiUsageRecordPageSchema = z
  .object({
    items: z.array(sub2ApiUsageRecordSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    page_size: z.number().int().positive(),
    pages: z.number().int().positive(),
  })
  .strip()

export type Sub2ApiUsageRecordPage = z.infer<typeof sub2ApiUsageRecordPageSchema>

export const sub2ApiUsagePageRequestSchema = z.number().int().positive().max(1000)

export const sub2ApiUsageErrorRequestSchema = z
  .object({
    id: z.number().int().positive(),
    created_at: z.string().min(1),
    model: z.string().min(1),
    inbound_endpoint: z.string().min(1),
    status_code: z.number().int().nonnegative(),
    category: z.string().min(1),
    platform: z.string().min(1),
    message: z.string(),
    key_name: z.string(),
    key_deleted: z.boolean(),
    client_ip: z.string().optional(),
    group_name: z.string().optional(),
    request_type: z.number().int().nullable().optional(),
    stream: z.boolean(),
    user_agent: z.string().optional(),
  })
  .strip()

export type Sub2ApiUsageErrorRequest = z.infer<typeof sub2ApiUsageErrorRequestSchema>

export const sub2ApiUsageErrorRequestPageSchema = z
  .object({
    items: z.array(sub2ApiUsageErrorRequestSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    page_size: z.number().int().positive(),
    pages: z.number().int().positive(),
  })
  .strip()

export type Sub2ApiUsageErrorRequestPage = z.infer<typeof sub2ApiUsageErrorRequestPageSchema>

export const sub2ApiUsageErrorRequestDetailSchema = sub2ApiUsageErrorRequestSchema
  .extend({
    error_body: z.string(),
    upstream_status_code: z.number().int().nonnegative().nullable().optional(),
  })
  .strip()

export type Sub2ApiUsageErrorRequestDetail = z.infer<typeof sub2ApiUsageErrorRequestDetailSchema>

export const sub2ApiUsageErrorIdSchema = z.number().int().positive()

export const sub2ApiRedeemCodeRequestSchema = z.object({
  code: z.string().trim().min(1).max(256),
})

export type Sub2ApiRedeemCodeRequest = z.infer<typeof sub2ApiRedeemCodeRequestSchema>

export const sub2ApiRedeemResultSchema = z
  .object({
    message: z.string(),
    type: z.string().min(1),
    value: z.number(),
    new_balance: z.number().nonnegative().optional(),
    new_concurrency: z.number().int().nonnegative().optional(),
  })
  .strip()

export type Sub2ApiRedeemResult = z.infer<typeof sub2ApiRedeemResultSchema>

export const sub2ApiRedeemHistoryItemSchema = z
  .object({
    id: z.number().int().positive(),
    code: z.string().min(1),
    type: z.string().min(1),
    value: z.number(),
    status: z.string().min(1),
    used_at: z.string().nullable().optional(),
    created_at: z.string().min(1),
    expires_at: z.string().nullable().optional(),
    group_id: z.number().int().positive().nullable().optional(),
    validity_days: z.number().int().nonnegative().optional(),
    group: z
      .object({
        id: z.number().int().positive(),
        name: z.string(),
      })
      .strip()
      .nullable()
      .optional(),
  })
  .strip()

export type Sub2ApiRedeemHistoryItem = z.infer<typeof sub2ApiRedeemHistoryItemSchema>

export const sub2ApiRedeemHistorySchema = z.array(sub2ApiRedeemHistoryItemSchema)

export const sub2ApiRedeemHistorySummarySchema = z
  .object({
    id: z.number().int().positive(),
    code_hint: z.string().min(1),
    type: z.string().min(1),
    value: z.number(),
    status: z.string().min(1),
    used_at: z.string().nullable().optional(),
    created_at: z.string().min(1),
    expires_at: z.string().nullable().optional(),
    validity_days: z.number().int().nonnegative().optional(),
    group_name: z.string().optional(),
  })
  .strip()

export type Sub2ApiRedeemHistorySummary = z.infer<typeof sub2ApiRedeemHistorySummarySchema>

export const sub2ApiPlatformQuotaItemSchema = z
  .object({
    platform: z.string().min(1),
    daily_limit_usd: z.number().nonnegative().nullable(),
    weekly_limit_usd: z.number().nonnegative().nullable(),
    monthly_limit_usd: z.number().nonnegative().nullable(),
    daily_usage_usd: z.number().nonnegative(),
    weekly_usage_usd: z.number().nonnegative(),
    monthly_usage_usd: z.number().nonnegative(),
    daily_window_start: z.string().nullable().optional(),
    weekly_window_start: z.string().nullable().optional(),
    monthly_window_start: z.string().nullable().optional(),
    daily_window_resets_at: z.string().nullable().optional(),
    weekly_window_resets_at: z.string().nullable().optional(),
    monthly_window_resets_at: z.string().nullable().optional(),
  })
  .strip()

export type Sub2ApiPlatformQuotaItem = z.infer<typeof sub2ApiPlatformQuotaItemSchema>

export const sub2ApiPlatformQuotasResponseSchema = z
  .object({
    platform_quotas: z.array(sub2ApiPlatformQuotaItemSchema),
  })
  .strip()

export type Sub2ApiPlatformQuotasResponse = z.infer<typeof sub2ApiPlatformQuotasResponseSchema>

export const sub2ApiChannelMonitorTimelineItemSchema = z
  .object({
    status: z.enum(['operational', 'degraded', 'error', 'unknown']),
    latency_ms: z.number().nonnegative().nullable().optional(),
    ping_latency_ms: z.number().nonnegative().nullable().optional(),
    checked_at: z.string().min(1),
  })
  .strip()

export type Sub2ApiChannelMonitorTimelineItem = z.infer<typeof sub2ApiChannelMonitorTimelineItemSchema>

export const sub2ApiChannelMonitorSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    provider: z.string().min(1),
    group_name: z.string(),
    primary_model: z.string().min(1),
    primary_status: z.enum(['operational', 'degraded', 'error', 'unknown']),
    primary_latency_ms: z.number().nonnegative().nullable().optional(),
    primary_ping_latency_ms: z.number().nonnegative().nullable().optional(),
    availability_7d: z.number().min(0).max(100).nullable().optional(),
    extra_models: z.array(z.unknown()).optional(),
    timeline: z.array(sub2ApiChannelMonitorTimelineItemSchema).optional(),
  })
  .strip()

export type Sub2ApiChannelMonitor = z.infer<typeof sub2ApiChannelMonitorSchema>

export const sub2ApiChannelMonitorResponseSchema = z
  .object({
    items: z.array(sub2ApiChannelMonitorSchema),
  })
  .strip()

export type Sub2ApiChannelMonitorResponse = z.infer<typeof sub2ApiChannelMonitorResponseSchema>

export const sub2ApiModelPlazaPricingSchema = z
  .object({
    billing_mode: z.string().optional(),
    input_price: z.number().nonnegative().nullable().optional(),
    output_price: z.number().nonnegative().nullable().optional(),
    cache_write_price: z.number().nonnegative().nullable().optional(),
    cache_read_price: z.number().nonnegative().nullable().optional(),
    per_request_price: z.number().nonnegative().nullable().optional(),
  })
  .strip()

export const sub2ApiModelPlazaModelSchema = z
  .object({
    name: z.string().min(1),
    pricing: sub2ApiModelPlazaPricingSchema.nullable().optional(),
    official_pricing: sub2ApiModelPlazaPricingSchema.nullable().optional(),
  })
  .strip()

export type Sub2ApiModelPlazaModel = z.infer<typeof sub2ApiModelPlazaModelSchema>

export const sub2ApiModelPlazaGroupSchema = z
  .object({
    id: z.union([z.number().int().positive(), z.string().min(1)]),
    name: z.string().min(1),
    description: z.string().optional(),
    platform: z.string().min(1),
    rate_multiplier: z.number().nonnegative(),
    user_rate_multiplier: z.number().nonnegative().nullable().optional(),
    subscription_type: z.string().optional(),
    is_exclusive: z.boolean().optional(),
    models: z.array(sub2ApiModelPlazaModelSchema),
  })
  .strip()

export type Sub2ApiModelPlazaGroup = z.infer<typeof sub2ApiModelPlazaGroupSchema>

export const sub2ApiModelPlazaResponseSchema = z
  .object({
    description: z.string().optional(),
    groups: z.array(sub2ApiModelPlazaGroupSchema),
  })
  .strip()

export type Sub2ApiModelPlazaResponse = z.infer<typeof sub2ApiModelPlazaResponseSchema>

export const sub2ApiSubscriptionSummaryItemSchema = z
  .object({
    id: z.number().int().positive(),
    group_id: z.number().int().positive(),
    group_name: z.string(),
    status: z.string().min(1),
    daily_used_usd: z.number().nonnegative().optional(),
    daily_limit_usd: z.number().nonnegative().optional(),
    weekly_used_usd: z.number().nonnegative().optional(),
    weekly_limit_usd: z.number().nonnegative().optional(),
    monthly_used_usd: z.number().nonnegative().optional(),
    monthly_limit_usd: z.number().nonnegative().optional(),
    expires_at: z.string().nullable().optional(),
  })
  .strip()

export type Sub2ApiSubscriptionSummaryItem = z.infer<typeof sub2ApiSubscriptionSummaryItemSchema>

export const sub2ApiSubscriptionSummarySchema = z
  .object({
    active_count: z.number().int().nonnegative(),
    total_used_usd: z.number().nonnegative(),
    subscriptions: z.array(sub2ApiSubscriptionSummaryItemSchema),
  })
  .strip()

export type Sub2ApiSubscriptionSummary = z.infer<typeof sub2ApiSubscriptionSummarySchema>

export const sub2ApiLoginRequestSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  turnstile_token: z.string().min(1).optional(),
  tencent_captcha_ticket: z.string().min(1).optional(),
  tencent_captcha_randstr: z.string().min(1).optional(),
})

export type Sub2ApiLoginRequest = z.infer<typeof sub2ApiLoginRequestSchema>

export const sub2ApiTotpCodeSchema = z.string().regex(/^\d{6}$/)

export interface Sub2ApiSessionState {
  authenticated: boolean
  user: Sub2ApiUser | null
  twoFactorRequired: boolean
  userEmailMasked?: string
}

export type Sub2ApiLoginResult =
  | { status: 'authenticated'; user: Sub2ApiUser }
  | { status: 'two_factor_required'; userEmailMasked?: string }

export const SUB2API_ROUTES = {
  publicSettings: 'settings/public',
  login: 'auth/login',
  login2FA: 'auth/login/2fa',
  refresh: 'auth/refresh',
  logout: 'auth/logout',
  currentUser: 'auth/me',
  apiKeys: 'keys',
  usageDashboardStats: 'usage/dashboard/stats',
  usageDashboardTrend: 'usage/dashboard/trend?period=week',
  usageDashboardModels: 'usage/dashboard/models?period=week',
  usageRecords: 'usage',
  usageErrors: 'usage/errors',
  redeem: 'redeem',
  redeemHistory: 'redeem/history',
  subscriptionsSummary: 'subscriptions/summary',
  platformQuotas: 'user/platform-quotas',
  channelMonitors: 'channel-monitors',
  modelPlaza: 'model-plaza',
  models: 'models',
} as const
