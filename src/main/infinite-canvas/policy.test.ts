import { describe, expect, it, vi } from 'vitest'
import {
  decodeInfiniteCanvasProxyTarget,
  isPublicInternetAddress,
  validateInfiniteCanvasProxyTarget,
  validateInfiniteCanvasTargetStructure,
} from './policy'

function encodeTarget(url: string): string {
  return Buffer.from(url).toString('base64url')
}

describe('infinite canvas target policy', () => {
  it('accepts arbitrary public HTTPS targets and keeps their full structured URL', async () => {
    const resolver = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
    const encoded = encodeTarget('https://models.example/v1/images/generations?count=1')
    const validation = await validateInfiniteCanvasProxyTarget(encoded, resolver)

    expect(validation).toMatchObject({
      ok: true,
      url: new URL('https://models.example/v1/images/generations?count=1'),
      addresses: [{ address: '93.184.216.34', family: 4 }],
    })
    expect(resolver).toHaveBeenCalledWith('models.example', { all: true, verbatim: true })
    expect(decodeInfiniteCanvasProxyTarget(encoded)?.hostname).toBe('models.example')
  })

  it('rejects non-HTTPS, URL credentials, local targets, and administrative paths', async () => {
    const resolver = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
    for (const target of [
      'http://models.example/v1/models',
      'https://user:password@models.example/v1/models',
      'https://localhost/v1/models',
      'https://models.example/admin/users',
      'https://models.example/%61dmin/users',
      'https://models.example/%2561dmin/users',
      'https://models.example/api%2fadmin/users',
    ]) {
      await expect(validateInfiniteCanvasProxyTarget(encodeTarget(target), resolver)).resolves.toMatchObject({
        ok: false,
      })
    }
  })

  it('rejects every local, private, link-local, documentation, reserved, and mixed DNS result', async () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.0.1',
      '169.254.1.1',
      '100.64.0.1',
      '192.0.2.1',
      '192.88.99.1',
      '198.51.100.1',
      '203.0.113.1',
      '224.0.0.1',
      '::1',
      'fc00::1',
      'fe80::1',
      'ff02::1',
      '2001:db8::1',
      '2002:7f00:1::1',
      '64:ff9b::7f00:1',
      '100::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isPublicInternetAddress(address), address).toBe(false)
    }
    expect(isPublicInternetAddress('8.8.8.8')).toBe(true)
    expect(isPublicInternetAddress('2606:4700:4700::1111')).toBe(true)

    const mixedResolver = vi.fn(async () => [
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ])
    await expect(
      validateInfiniteCanvasProxyTarget(encodeTarget('https://models.example/v1/models'), mixedResolver)
    ).resolves.toMatchObject({ ok: false })
  })

  it('rejects malformed encoded URLs and validates literal IP targets without DNS', async () => {
    expect(decodeInfiniteCanvasProxyTarget('%%%')).toBeNull()
    expect(validateInfiniteCanvasTargetStructure(new URL('https://[::1]/v1/models'))).toEqual({ ok: true })
    await expect(validateInfiniteCanvasProxyTarget(encodeTarget('https://[::1]/v1/models'))).resolves.toMatchObject({
      ok: false,
    })
  })
})
