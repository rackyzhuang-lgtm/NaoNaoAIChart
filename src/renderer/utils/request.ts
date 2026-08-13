import platform from '@/platform'
import { ApiError, BaseError, NetworkError } from '../../shared/models/errors'
import { isSub2ApiGatewayUrl } from '../../shared/sub2api/url'
import { handleMobileRequest } from './mobile-request'
import { createSub2ApiGatewayRequestId, openSub2ApiGatewayStream } from './sub2api-gateway-stream'

interface RequestOptions {
  method: string
  headers?: RequestInit['headers']
  body?: RequestInit['body']
  signal?: AbortSignal
  retry?: number
  useProxy?: boolean
  requestId?: string
}

/** Number of retries used when a caller does not provide an explicit value. */
export const DEFAULT_REQUEST_RETRIES = 5

/** NaoNaoAI provider requests use their configured HTTPS URL without a loopback rewrite. */
export function resolveDesktopProviderUrl(url: string): string {
  return url
}

async function retryRequest<T>(fn: () => Promise<T>, retry: number, url: string, signal?: AbortSignal): Promise<T> {
  let requestError: BaseError | null = null

  for (let i = 0; i <= retry; i++) {
    try {
      return await fn()
    } catch (e) {
      // Retry every non-abort failure, including non-2xx API responses.
      if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
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

function getSafeGatewayErrorHeaders(headers: Headers): Record<string, string> | undefined {
  const retryAfter = headers.get('retry-after')
  return retryAfter ? { 'retry-after': retryAfter } : undefined
}

async function doRequest(url: string, options: RequestOptions): Promise<Response> {
  const { signal, retry = DEFAULT_REQUEST_RETRIES, useProxy = false, body, method, requestId } = options
  const requestUrl = await resolveDesktopProviderUrl(url)
  const headers = buildHeaders(options, url)
  const directGateway =
    platform.type === 'desktop' &&
    typeof window !== 'undefined' &&
    (() => {
      try {
        return isSub2ApiGatewayUrl(requestUrl)
      } catch {
        return false
      }
    })()
  const directGatewayRequestId = directGateway ? requestId || createSub2ApiGatewayRequestId() : null

  if (directGateway) {
    headers.set('Cache-Control', 'no-cache, no-store, max-age=0')
  }

  const makeRequest = async () => {
    if (platform.type === 'mobile' && useProxy) {
      return handleMobileRequest(requestUrl, method, headers, body, signal)
    }

    if (directGateway) {
      const values: Record<string, string> = {}
      headers.forEach((value, key) => {
        values[key] = value
      })
      const res = await openSub2ApiGatewayStream(
        directGatewayRequestId as string,
        {
          url: requestUrl,
          method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
          headers: values,
          body: typeof body === 'string' ? body : undefined,
        },
        signal
      )
      if (!res.ok) {
        await res.text().catch(() => undefined)
        throw new ApiError(
          `Status Code ${res.status}`,
          undefined,
          res.status,
          undefined,
          getSafeGatewayErrorHeaders(res.headers)
        )
      }
      return res
    }

    const res = await fetch(requestUrl, { method, headers, body, signal })
    if (!res.ok) {
      const err = await res.text().catch(() => null)
      throw new ApiError(`Status Code ${res.status}`, err ?? undefined, res.status)
    }
    return res
  }

  // Fixed-gateway calls bypass the retry helper entirely. Once the request-id
  // is registered, only stream terminal events or explicit cancellation end it.
  if (directGateway) return makeRequest()
  return retryRequest(makeRequest, retry, requestUrl, signal)
}

export const apiRequest = {
  post(url: string, headers: Record<string, string>, body: RequestInit['body'], options?: Partial<RequestOptions>) {
    return doRequest(url, { ...options, method: 'POST', headers, body })
  },

  get(url: string, headers: Record<string, string>, options?: Partial<RequestOptions>) {
    return doRequest(url, { ...options, method: 'GET', headers })
  },
}

export function fetchWithProxy(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return doRequest(input.toString(), {
    method: init?.method || 'GET',
    headers: init?.headers,
    body: init?.body,
    signal: init?.signal || undefined,
    useProxy: true,
  })
}
