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

export const sub2ApiModelsResponseSchema = z.object({
  object: z.literal('list'),
  data: z.array(
    z
      .object({
        id: z.string().min(1),
        object: z.string().optional(),
        owned_by: z.string().optional(),
      })
      .passthrough()
  ),
})

export type Sub2ApiModelsResponse = z.infer<typeof sub2ApiModelsResponseSchema>

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
  models: 'models',
} as const
