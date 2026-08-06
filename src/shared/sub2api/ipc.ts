import type {
  Sub2ApiApiKeyCreateRequest,
  Sub2ApiApiKeyPageSummary,
  Sub2ApiApiKeySummary,
  Sub2ApiApiKeyUpdateRequest,
  Sub2ApiLoginRequest,
  Sub2ApiLoginResult,
  Sub2ApiProviderBinding,
  Sub2ApiPublicSettings,
  Sub2ApiSessionState,
  Sub2ApiUser,
} from './contracts'

export const SUB2API_IPC_CHANNELS = {
  getPublicSettings: 'sub2api:get-public-settings',
  login: 'sub2api:login',
  completeTwoFactor: 'sub2api:complete-two-factor',
  logout: 'sub2api:logout',
  getSessionState: 'sub2api:get-session-state',
  getCurrentUser: 'sub2api:get-current-user',
  listApiKeys: 'sub2api:list-api-keys',
  createApiKey: 'sub2api:create-api-key',
  updateApiKey: 'sub2api:update-api-key',
  deleteApiKey: 'sub2api:delete-api-key',
  prepareProviderBinding: 'sub2api:prepare-provider-binding',
} as const

export interface Sub2ApiRendererApi {
  getPublicSettings(): Promise<Sub2ApiPublicSettings>
  login(request: Sub2ApiLoginRequest): Promise<Sub2ApiLoginResult>
  completeTwoFactor(code: string): Promise<Sub2ApiLoginResult>
  logout(): Promise<void>
  getSessionState(): Promise<Sub2ApiSessionState>
  getCurrentUser(): Promise<Sub2ApiUser>
  listApiKeys(): Promise<Sub2ApiApiKeyPageSummary>
  createApiKey(request: Sub2ApiApiKeyCreateRequest): Promise<Sub2ApiApiKeySummary>
  updateApiKey(id: number, request: Sub2ApiApiKeyUpdateRequest): Promise<Sub2ApiApiKeySummary>
  deleteApiKey(id: number): Promise<void>
  prepareProviderBinding(id: number): Promise<Sub2ApiProviderBinding>
}
