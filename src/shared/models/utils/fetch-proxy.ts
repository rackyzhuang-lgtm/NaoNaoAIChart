import { deriveSub2ApiGatewayRequestId } from '../../sub2api/request-id'
import { isSub2ApiGatewayUrl } from '../../sub2api/url'
import type { ModelDependencies } from '../../types/adapters'

interface LogicalRequestContext {
  requestId?: string
  requestSequence?: number
}

/**
 * Creates a fetch function that uses proxy when enabled,
 * or falls back to apiRequest for mobile CORS handling
 */
export function createFetchWithProxy(
  useProxy: boolean | undefined,
  dependencies: ModelDependencies,
  context: LogicalRequestContext = {}
) {
  let requestSequence = context.requestSequence ?? 0

  return async (url: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || 'GET'
    const headers = (init?.headers as Record<string, string>) || {}
    const requestUrl = url.toString()

    if (method === 'POST') {
      const fixedGateway = isSub2ApiGatewayUrl(requestUrl)
      const requestId =
        fixedGateway && context.requestId
          ? deriveSub2ApiGatewayRequestId(context.requestId, requestSequence++)
          : undefined
      // A fixed-gateway POST may already be accepted and billed when its response
      // is delayed. Never resubmit it automatically.
      const response = await dependencies.request.apiRequest({
        url: requestUrl,
        method: 'POST',
        headers,
        body: init?.body,
        signal: init?.signal || undefined,
        useProxy,
        retry: fixedGateway ? 0 : 5,
        requestId,
      })
      return response
    } else {
      const response = await dependencies.request.apiRequest({
        url: requestUrl,
        method: 'GET',
        headers,
        signal: init?.signal || undefined,
        useProxy,
      })
      return response
    }
  }
}
