import { safeStorage } from 'electron'
import { store } from '../store-node'

const AUTO_LOGIN_STORE_KEY = 'sub2apiAutoLogin'

export class Sub2ApiAutoLoginStore {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  load(): string | null {
    if (!this.isAvailable()) {
      return null
    }
    const encrypted = store.get(AUTO_LOGIN_STORE_KEY)
    if (!encrypted) {
      return null
    }
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      this.clear()
      return null
    }
  }

  save(refreshToken: string): boolean {
    if (!this.isAvailable()) {
      return false
    }
    store.set(AUTO_LOGIN_STORE_KEY, safeStorage.encryptString(refreshToken).toString('base64'))
    return true
  }

  clear(): void {
    store.delete(AUTO_LOGIN_STORE_KEY)
  }
}
