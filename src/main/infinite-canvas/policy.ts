import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const blockedPathSegments = new Set(['admin', 'administrator'])
const blockedHostnames = new Set(['localhost', 'localhost.localdomain'])

export type ResolvedPublicAddress = { address: string; family: 4 | 6 }
export type InfiniteCanvasDnsResolver = (
  hostname: string,
  options: { all: true; verbatim: true }
) => Promise<Array<{ address: string; family: number }>>
export type ProxyTargetValidation =
  | { ok: true; url: URL; addresses: ResolvedPublicAddress[] }
  | { ok: false; reason: string }

function ipv4Number(address: string): number | null {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0
}

function inIpv4Range(value: number, network: string, prefix: number): boolean {
  const base = ipv4Number(network)
  if (base === null) return false
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (value & mask) === (base & mask)
}

function isPublicIpv4(address: string): boolean {
  const value = ipv4Number(address)
  if (value === null) return false
  const blocked: Array<[string, number]> = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.168.0.0', 16],
    ['192.31.196.0', 24],
    ['192.52.193.0', 24],
    ['192.88.99.0', 24],
    ['192.175.48.0', 24],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ]
  return !blocked.some(([network, prefix]) => inIpv4Range(value, network, prefix))
}

function expandIpv6(address: string): number[] | null {
  const normalized = address.toLowerCase().split('%', 1)[0]
  const ipv4Index = normalized.lastIndexOf(':')
  let source = normalized
  if (normalized.includes('.')) {
    const ipv4 = ipv4Number(normalized.slice(ipv4Index + 1))
    if (ipv4 === null) return null
    source = `${normalized.slice(0, ipv4Index)}:${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`
  }
  const halves = source.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null
  const parts = [...left, ...Array(missing).fill('0'), ...right].map((part) => Number.parseInt(part || '0', 16))
  return parts.length === 8 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff)
    ? parts
    : null
}

function isPublicIpv6(address: string): boolean {
  const parts = expandIpv6(address)
  if (!parts) return false
  if (parts.every((part) => part === 0) || (parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1))
    return false
  if (parts.slice(0, 6).every((part) => part === 0)) return false
  if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0 && parts[4] === 0 && parts[5] === 0xffff) {
    return isPublicIpv4(`${parts[6] >>> 8}.${parts[6] & 255}.${parts[7] >>> 8}.${parts[7] & 255}`)
  }
  if ((parts[0] & 0xfe00) === 0xfc00) return false
  if ((parts[0] & 0xffc0) === 0xfe80) return false
  if ((parts[0] & 0xff00) === 0xff00) return false
  if (parts[0] === 0x0064 && (parts[1] === 0xff9b || (parts[1] === 0xff9b && parts[2] === 1))) return false
  if (parts[0] === 0x0100 && parts.slice(1, 4).every((part) => part === 0)) return false
  if (parts[0] === 0x2001 && parts[1] < 0x0200) return false
  if (parts[0] === 0x2001 && parts[1] === 0x0db8) return false
  if (parts[0] === 0x2002) return false
  if (parts[0] === 0x3fff && (parts[1] & 0xf000) === 0) return false
  return (parts[0] & 0xe000) === 0x2000
}

export function isPublicInternetAddress(address: string): boolean {
  const family = isIP(address)
  return family === 4 ? isPublicIpv4(address) : family === 6 ? isPublicIpv6(address) : false
}

export function decodeInfiniteCanvasProxyTarget(encoded: string): URL | null {
  if (!encoded || encoded.length > 24_000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null
  try {
    return new URL(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export function validateInfiniteCanvasTargetStructure(url: URL): { ok: true } | { ok: false; reason: string } {
  if (url.protocol !== 'https:') return { ok: false, reason: 'Only HTTPS targets are allowed' }
  if (url.username || url.password) return { ok: false, reason: 'URL credentials are not allowed' }
  if (blockedHostnames.has(url.hostname.toLowerCase()) || url.hostname.toLowerCase().endsWith('.localhost')) {
    return { ok: false, reason: 'Local targets are not allowed' }
  }
  let decodedPath = url.pathname
  try {
    for (let pass = 0; pass < 3 && decodedPath.includes('%'); pass += 1) decodedPath = decodeURIComponent(decodedPath)
  } catch {
    return { ok: false, reason: 'Invalid target path' }
  }
  if (decodedPath.includes('%') || decodedPath.includes('\0')) return { ok: false, reason: 'Invalid target path' }
  const segments = decodedPath
    .split(/[\\/]/)
    .filter(Boolean)
    .map((segment) => segment.toLowerCase())
  if (segments.some((segment) => blockedPathSegments.has(segment))) {
    return { ok: false, reason: 'Administrative paths are not allowed' }
  }
  return { ok: true }
}

export async function validateInfiniteCanvasProxyTarget(
  encoded: string,
  resolver: InfiniteCanvasDnsResolver = lookup
): Promise<ProxyTargetValidation> {
  const url = decodeInfiniteCanvasProxyTarget(encoded)
  if (!url) return { ok: false, reason: 'Invalid encoded target URL' }
  const structure = validateInfiniteCanvasTargetStructure(url)
  if (!structure.ok) return structure
  let addresses: ResolvedPublicAddress[]
  const literalHostname =
    url.hostname.startsWith('[') && url.hostname.endsWith(']') ? url.hostname.slice(1, -1) : url.hostname
  if (isIP(literalHostname)) {
    addresses = [{ address: literalHostname, family: isIP(literalHostname) as 4 | 6 }]
  } else {
    try {
      const resolved = await resolver(url.hostname, { all: true, verbatim: true })
      addresses = resolved.map(({ address, family }) => ({ address, family: family as 4 | 6 }))
    } catch {
      return { ok: false, reason: 'Unable to resolve target hostname' }
    }
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicInternetAddress(address))) {
    return { ok: false, reason: 'Target hostname must resolve only to public IP addresses' }
  }
  return { ok: true, url, addresses }
}
