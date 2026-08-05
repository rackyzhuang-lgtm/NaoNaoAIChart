import type {
  Sub2ApiLoginRequest,
  Sub2ApiLoginResult,
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
} as const

export interface Sub2ApiRendererApi {
  getPublicSettings(): Promise<Sub2ApiPublicSettings>
  login(request: Sub2ApiLoginRequest): Promise<Sub2ApiLoginResult>
  completeTwoFactor(code: string): Promise<Sub2ApiLoginResult>
  logout(): Promise<void>
  getSessionState(): Promise<Sub2ApiSessionState>
  getCurrentUser(): Promise<Sub2ApiUser>
}
