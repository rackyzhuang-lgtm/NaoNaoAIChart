import platform from '@/platform'
import { ApiError, BaseError, NetworkError } from '../../shared/models/errors'
import { handleMobileRequest } from './mobile-request'

interface RequestOptions {
  method: string
  headers?: RequestInit['headers']
  body?: RequestInit['body']
  signal?: AbortSignal
  retry?: number
  useProxy?: boolean
}

const SUB2API_ORIGIN = 'https://naonaoai.shop'
const SUB2API_PROXY_ALIAS = 'naonaoai.shop'

/**
 * Routes the fixed sub2api gateway through the app-owned loopback server.
 * Electron renderer fetches are subject to CORS, while the main process can
 * make the same request directly and stream the response back to the UI.
 */
export async function resolveDesktopProviderUrl(url: string): Promise<string> {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return url
  }

  if (target.origin !== SUB2API_ORIGIN || platform.type !== 'desktop' || !platform.getInfiniteCanvasUrl) {
    return url
  }

  const loopbackUrl = await platform.getInfiniteCanvasUrl()
  const proxyBase = new URL(loopbackUrl.endsWith('/') ? loopbackUrl : `${loopbackUrl}/`)
  const proxyPath = `/_naonao_proxy/${SUB2API_PROXY_ALIAS}${target.pathname}${target.search}`
  return new URL(proxyPath, proxyBase).toString()
}

async function retryRequest<T>(fn: () => Promise<T>, retry: number, url: string): Promise<T> {
  let requestError: BaseError | null = null

  for (let i = 0; i <= retry; i++) {
    try {
      return await fn()
    } catch (e) {
      // 对 ApiError（通常代表 4xx/业务错误）不重试
      if (e instanceof ApiError) {
        throw e
      }
      let origin = 'unknown'
      try {
        origin = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost').origin
      } catch {}
      requestError = e instanceof BaseError ? e : new NetworkError((e as Error).message, origin)

      if (i < retry) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
  }

  throw requestError || new Error('Unknown error')
}

function buildHeaders(options: RequestOptions, _url: string): Headers {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')

  return headers
}

async function doRequest(url: string, options: RequestOptions): Promise<Response> {
  const { signal, retry = 3, useProxy = false, body, method } = options
  const requestUrl = await resolveDesktopProviderUrl(url)
  const headers = buildHeaders(options, url)

  const makeRequest = async () => {
    if (platform.type === 'mobile' && useProxy) {
      return handleMobileRequest(requestUrl, method, headers, body, signal)
    }

    const res = await fetch(requestUrl, { method, headers, body, signal })
    if (!res.ok) {
      const err = await res.text().catch(() => null)
      throw new ApiError(`Status Code ${res.status}`, err ?? undefined)
    }
    return res
  }

  return retryRequest(makeRequest, retry, requestUrl)
}

export const apiRequest = {
  async post(
    url: string,
    headers: Record<string, string>,
    body: RequestInit['body'],
    options?: Partial<RequestOptions>
  ) {
    return doRequest(url, { ...options, method: 'POST', headers, body })
  },

  async get(url: string, headers: Record<string, string>, options?: Partial<RequestOptions>) {
    return doRequest(url, { ...options, method: 'GET', headers })
  },
}

export async function fetchWithProxy(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return doRequest(input.toString(), {
    method: init?.method || 'GET',
    headers: init?.headers,
    body: init?.body,
    signal: init?.signal || undefined,
    useProxy: true,
  })
}
