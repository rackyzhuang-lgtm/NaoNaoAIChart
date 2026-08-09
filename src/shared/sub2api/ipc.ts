import type {
  Sub2ApiAnnouncement,
  Sub2ApiApiKeyCreateRequest,
  Sub2ApiApiKeyPageSummary,
  Sub2ApiApiKeySummary,
  Sub2ApiApiKeyUpdateRequest,
  Sub2ApiAvailableGroup,
  Sub2ApiChannelMonitorResponse,
  Sub2ApiInfiniteCanvasCapability,
  Sub2ApiInfiniteCanvasImport,
  Sub2ApiLoginRequest,
  Sub2ApiLoginResult,
  Sub2ApiProviderBinding,
  Sub2ApiPublicSettings,
  Sub2ApiRedeemCodeRequest,
  Sub2ApiRedeemHistorySummary,
  Sub2ApiRedeemResult,
  Sub2ApiSessionState,
  Sub2ApiSubscriptionSummary,
  Sub2ApiUsageDashboardModels,
  Sub2ApiUsageDashboardStats,
  Sub2ApiUsageDashboardTrend,
  Sub2ApiUser,
} from './contracts'

export const SUB2API_IPC_CHANNELS = {
  getPublicSettings: 'sub2api:get-public-settings',
  login: 'sub2api:login',
  completeTwoFactor: 'sub2api:complete-two-factor',
  logout: 'sub2api:logout',
  getSessionState: 'sub2api:get-session-state',
  getCurrentUser: 'sub2api:get-current-user',
  getUsageDashboardStats: 'sub2api:get-usage-dashboard-stats',
  getUsageDashboardTrend: 'sub2api:get-usage-dashboard-trend',
  getUsageDashboardModels: 'sub2api:get-usage-dashboard-models',
  redeemCode: 'sub2api:redeem-code',
  getRedeemHistory: 'sub2api:get-redeem-history',
  getSubscriptionSummary: 'sub2api:get-subscription-summary',
  getChannelMonitors: 'sub2api:get-channel-monitors',
  getAnnouncements: 'sub2api:get-announcements',
  markAnnouncementRead: 'sub2api:mark-announcement-read',
  getAvailableGroups: 'sub2api:get-available-groups',
  listApiKeys: 'sub2api:list-api-keys',
  createApiKey: 'sub2api:create-api-key',
  updateApiKey: 'sub2api:update-api-key',
  deleteApiKey: 'sub2api:delete-api-key',
  copyApiKey: 'sub2api:copy-api-key',
  prepareProviderBinding: 'sub2api:prepare-provider-binding',
  prepareInfiniteCanvasImport: 'sub2api:prepare-infinite-canvas-import',
} as const

export interface Sub2ApiRendererApi {
  getPublicSettings(): Promise<Sub2ApiPublicSettings>
  login(request: Sub2ApiLoginRequest): Promise<Sub2ApiLoginResult>
  completeTwoFactor(code: string): Promise<Sub2ApiLoginResult>
  logout(): Promise<void>
  getSessionState(): Promise<Sub2ApiSessionState>
  getCurrentUser(): Promise<Sub2ApiUser>
  getUsageDashboardStats(): Promise<Sub2ApiUsageDashboardStats>
  getUsageDashboardTrend(): Promise<Sub2ApiUsageDashboardTrend>
  getUsageDashboardModels(): Promise<Sub2ApiUsageDashboardModels>
  redeemCode(request: Sub2ApiRedeemCodeRequest): Promise<Sub2ApiRedeemResult>
  getRedeemHistory(): Promise<Sub2ApiRedeemHistorySummary[]>
  getSubscriptionSummary(): Promise<Sub2ApiSubscriptionSummary>
  getChannelMonitors(): Promise<Sub2ApiChannelMonitorResponse>
  getAnnouncements(): Promise<Sub2ApiAnnouncement[]>
  markAnnouncementRead(id: number): Promise<void>
  getAvailableGroups(): Promise<Sub2ApiAvailableGroup[]>
  listApiKeys(): Promise<Sub2ApiApiKeyPageSummary>
  createApiKey(request: Sub2ApiApiKeyCreateRequest): Promise<Sub2ApiApiKeySummary>
  updateApiKey(id: number, request: Sub2ApiApiKeyUpdateRequest): Promise<Sub2ApiApiKeySummary>
  deleteApiKey(id: number): Promise<void>
  copyApiKey(id: number): Promise<void>
  prepareProviderBinding(id: number): Promise<Sub2ApiProviderBinding>
  prepareInfiniteCanvasImport(
    id: number,
    capability: Sub2ApiInfiniteCanvasCapability
  ): Promise<Sub2ApiInfiniteCanvasImport>
}
