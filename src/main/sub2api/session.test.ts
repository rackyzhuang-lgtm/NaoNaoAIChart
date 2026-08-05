import { describe, expect, it } from 'vitest'
import { Sub2ApiSession } from './session'

const authResponse = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 900,
  token_type: 'Bearer',
  user: {
    id: 1,
    username: 'test-user',
    email: 'user@example.test',
    role: 'user' as const,
    balance: 10,
    concurrency: 2,
    status: 'active' as const,
  },
}

describe('Sub2ApiSession', () => {
  it('keeps credentials private while exposing safe session state', () => {
    const session = new Sub2ApiSession()
    session.setAuthenticated(authResponse)

    expect(session.getState()).toEqual({
      authenticated: true,
      user: authResponse.user,
      twoFactorRequired: false,
      userEmailMasked: undefined,
    })
    expect(JSON.stringify(session.getState())).not.toContain('access-token')
    expect(JSON.stringify(session.getState())).not.toContain('refresh-token')
  })

  it('clears authenticated and pending two-factor state', () => {
    const session = new Sub2ApiSession()
    session.setPendingTwoFactor('temporary-token', 'u***@example.test')
    expect(session.getState()).toMatchObject({ authenticated: false, twoFactorRequired: true })

    session.clear()
    expect(session.getState()).toEqual({
      authenticated: false,
      user: null,
      twoFactorRequired: false,
      userEmailMasked: undefined,
    })
  })
})
