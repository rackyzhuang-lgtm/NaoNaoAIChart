import { describe, expect, it } from 'vitest'
import { sub2ApiAuthResponseSchema, sub2ApiLoginResponseSchema, sub2ApiRefreshResponseSchema } from './contracts'

const user = {
  id: 1,
  username: 'test-user',
  email: 'user@example.test',
  role: 'user',
  balance: 10,
  concurrency: 2,
  status: 'active',
}

describe('sub2api contracts', () => {
  it('accepts authenticated and two-factor login responses', () => {
    expect(
      sub2ApiLoginResponseSchema.parse({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 900,
        token_type: 'Bearer',
        user,
      })
    ).toMatchObject({ user })

    expect(
      sub2ApiLoginResponseSchema.parse({
        requires_2fa: true,
        temp_token: 'temporary-token',
        user_email_masked: 'u***@example.test',
      })
    ).toMatchObject({ requires_2fa: true })
  })

  it('rejects incomplete rotating refresh token pairs', () => {
    expect(
      sub2ApiRefreshResponseSchema.safeParse({
        access_token: 'access-token',
        expires_in: 900,
        token_type: 'Bearer',
      }).success
    ).toBe(false)
  })

  it('strips unexpected token fields from renderer-facing users', () => {
    const response = sub2ApiAuthResponseSchema.parse({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 900,
      token_type: 'Bearer',
      user: {
        ...user,
        access_token: 'unexpected-user-access-token',
        refresh_token: 'unexpected-user-refresh-token',
      },
    })

    expect(response.user).toEqual(user)
    expect(response.user).not.toHaveProperty('access_token')
    expect(response.user).not.toHaveProperty('refresh_token')
  })
})
