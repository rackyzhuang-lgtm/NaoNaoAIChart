import type {
  Sub2ApiAuthResponse,
  Sub2ApiRefreshResponse,
  Sub2ApiSessionState,
  Sub2ApiUser,
} from '../../shared/sub2api/contracts'

interface SessionCredentials {
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
}

interface PendingTwoFactor {
  tempToken: string
  userEmailMasked?: string
}

export class Sub2ApiSession {
  #credentials: SessionCredentials | null = null
  #user: Sub2ApiUser | null = null
  #pendingTwoFactor: PendingTwoFactor | null = null
  #credentialGeneration = 0

  setAuthenticated(response: Sub2ApiAuthResponse): void {
    this.#credentials = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token ?? null,
      expiresAt: response.expires_in ? Date.now() + response.expires_in * 1000 : null,
    }
    this.#user = response.user
    this.#pendingTwoFactor = null
    this.#credentialGeneration += 1
  }

  rotateTokens(response: Sub2ApiRefreshResponse): void {
    if (!this.#credentials) {
      throw new Error('Cannot refresh an empty sub2api session')
    }
    this.#credentials = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000,
    }
    this.#credentialGeneration += 1
  }

  restoreFromRefresh(response: Sub2ApiRefreshResponse): void {
    this.#credentials = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000,
    }
    this.#user = null
    this.#pendingTwoFactor = null
    this.#credentialGeneration += 1
  }

  setUser(user: Sub2ApiUser): void {
    if (!this.#credentials) {
      throw new Error('Cannot update user for an empty sub2api session')
    }
    this.#user = user
  }

  setPendingTwoFactor(tempToken: string, userEmailMasked?: string): void {
    this.#credentials = null
    this.#user = null
    this.#pendingTwoFactor = { tempToken, userEmailMasked }
    this.#credentialGeneration += 1
  }

  getAccessToken(): string | null {
    return this.#credentials?.accessToken ?? null
  }

  getRefreshToken(): string | null {
    return this.#credentials?.refreshToken ?? null
  }

  getPendingTwoFactorToken(): string | null {
    return this.#pendingTwoFactor?.tempToken ?? null
  }

  getCredentialGeneration(): number {
    return this.#credentialGeneration
  }

  isCredentialGeneration(generation: number): boolean {
    return this.#credentialGeneration === generation
  }

  getState(): Sub2ApiSessionState {
    return {
      authenticated: this.#credentials !== null,
      user: this.#user,
      twoFactorRequired: this.#pendingTwoFactor !== null,
      userEmailMasked: this.#pendingTwoFactor?.userEmailMasked,
    }
  }

  clear(): void {
    this.#credentials = null
    this.#user = null
    this.#pendingTwoFactor = null
    this.#credentialGeneration += 1
  }

  clearIfCredentialGeneration(generation: number): boolean {
    if (!this.isCredentialGeneration(generation)) {
      return false
    }
    this.clear()
    return true
  }
}
