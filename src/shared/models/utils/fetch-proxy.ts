import type { ModelDependencies } from '../../types/adapters'

/**
 * Creates a fetch function that uses proxy when enabled,
 * or falls back to apiRequest for mobile CORS handling
 */
export function createFetchWithProxy(useProxy: boolean | undefined, dependencies: ModelDependencies) {
  return async (url: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || 'GET'
    const headers = (init?.headers as Record<string, string>) || {}

    if (method === 'POST') {
      // Provider calls recover from transient non-2xx responses by default.
      // Callers that must avoid retries can still pass retry: 0 through the adapter.
      const response = await dependencies.request.apiRequest({
        url: url.toString(),
        method: 'POST',
        headers,
        body: init?.body,
        signal: init?.signal || undefined,
        useProxy,
        retry: 5,
      })
      return response
    } else {
      const response = await dependencies.request.apiRequest({
        url: url.toString(),
        method: 'GET',
        headers,
        signal: init?.signal || undefined,
        useProxy,
      })
      return response
    }
  }
}
