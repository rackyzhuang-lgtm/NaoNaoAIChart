import {
  areSub2ApiDirectGatewayRequestsEqual,
  type Sub2ApiDirectGatewayRequest,
  type Sub2ApiDirectGatewayStreamEvent,
} from '../../shared/sub2api/contracts'
import { parseSub2ApiIpcError } from '../../shared/sub2api/errors'
import type { Sub2ApiRendererApi } from '../../shared/sub2api/ipc'

interface GatewayStreamState {
  requestId: string
  request: Sub2ApiDirectGatewayRequest
  api: Sub2ApiRendererApi
  responsePromise: Promise<Response>
  resolveResponse: (response: Response) => void
  rejectResponse: (error: unknown) => void
  controller: ReadableStreamDefaultController<Uint8Array> | null
  pendingBodylessResponse: Response | null
  responseReceived: boolean
  responseSettled: boolean
  terminal: boolean
  signal?: AbortSignal
  abortListener?: () => void
}

// Mirrors the knowledge-base requestPromises lifecycle: registration happens
// before dispatch, and cleanup happens once on complete, error, or cancel.
const requestPromises = new Map<string, GatewayStreamState>()
const encoder = new TextEncoder()

function abortError(): DOMException {
  return new DOMException('The request was aborted', 'AbortError')
}

function toGatewayStreamError(serializedError: string): Error {
  const descriptor = parseSub2ApiIpcError(new Error(serializedError))
  if (!descriptor) {
    return new Error('NaoNaoAI gateway request failed')
  }

  switch (descriptor.kind) {
    case 'session_expired':
      return new Error('NaoNaoAI account session expired')
    case 'authentication_failed':
      return new Error('NaoNaoAI gateway authentication failed')
    case 'network':
      return new Error('NaoNaoAI gateway connection was interrupted')
    case 'timeout':
      return new Error('NaoNaoAI gateway request timed out')
    case 'rate_limited':
      return new Error('NaoNaoAI gateway rate limit reached')
    case 'feature_unavailable':
      return new Error('NaoNaoAI gateway feature is unavailable')
    case 'invalid_response':
      return new Error('NaoNaoAI gateway returned an invalid response')
    case 'service_error':
      return new Error(
        descriptor.status
          ? `NaoNaoAI gateway request failed (HTTP ${descriptor.status})`
          : 'NaoNaoAI gateway request failed'
      )
    case 'unknown':
      return new Error('NaoNaoAI gateway request failed')
  }
}

function finishRequest(state: GatewayStreamState): void {
  if (state.terminal) return
  state.terminal = true
  requestPromises.delete(state.requestId)
  if (state.signal && state.abortListener) {
    state.signal.removeEventListener('abort', state.abortListener)
  }
  state.api.releaseDirectGatewayStream?.(state.requestId)
}

function failRequest(state: GatewayStreamState, error: unknown): void {
  if (state.terminal) return
  if (state.responseSettled) {
    state.controller?.error(error)
  } else {
    state.rejectResponse(error)
  }
  finishRequest(state)
}

function cancelRequest(state: GatewayStreamState): void {
  if (state.terminal) return
  const error = abortError()
  void state.api.cancelDirectGatewayStream?.(state.requestId).catch(() => undefined)
  failRequest(state, error)
}

function cancelConsumedStream(state: GatewayStreamState): void {
  if (state.terminal) return
  void state.api.cancelDirectGatewayStream?.(state.requestId).catch(() => undefined)
  finishRequest(state)
}

function handleStreamEvent(state: GatewayStreamState, event: Sub2ApiDirectGatewayStreamEvent): void {
  if (state.terminal || event.requestId !== state.requestId) return

  switch (event.type) {
    case 'response': {
      if (state.responseReceived) {
        failRequest(state, new Error('Duplicate gateway response event'))
        return
      }
      state.responseReceived = true
      const bodyAllowed = event.status !== 204 && event.status !== 205 && event.status !== 304
      const body = bodyAllowed
        ? new ReadableStream<Uint8Array>({
            start(controller) {
              state.controller = controller
            },
            cancel() {
              cancelConsumedStream(state)
            },
          })
        : null
      const response = new Response(body, { status: event.status, headers: event.headers })
      if (body) {
        state.responseSettled = true
        state.resolveResponse(response)
      } else {
        // A bodyless response settles only after main confirms completion, so a
        // terminal bridge error can still reject instead of being swallowed.
        state.pendingBodylessResponse = response
      }
      return
    }
    case 'data':
      if (!state.responseReceived || !state.controller) {
        failRequest(state, new Error('Gateway data arrived before response metadata'))
        return
      }
      state.controller.enqueue(encoder.encode(event.data))
      return
    case 'complete':
      if (!state.responseReceived) {
        failRequest(state, new Error('Gateway completed before response metadata'))
        return
      }
      if (state.pendingBodylessResponse) {
        state.responseSettled = true
        state.resolveResponse(state.pendingBodylessResponse)
        state.pendingBodylessResponse = null
      } else {
        state.controller?.close()
      }
      finishRequest(state)
      return
    case 'error':
      failRequest(state, toGatewayStreamError(event.error))
  }
}

export function createSub2ApiGatewayRequestId(): string {
  return globalThis.crypto.randomUUID()
}

export function openSub2ApiGatewayStream(
  requestId: string,
  request: Sub2ApiDirectGatewayRequest,
  signal?: AbortSignal
): Promise<Response> {
  const existing = requestPromises.get(requestId)
  if (existing) {
    if (!areSub2ApiDirectGatewayRequestsEqual(existing.request, request)) {
      return Promise.reject(new Error('Conflicting sub2api gateway request ID'))
    }
    return existing.responsePromise
  }

  const api = window.electronAPI?.sub2api
  if (!api?.openDirectGatewayStream) {
    return Promise.reject(new Error('Direct gateway streaming is unavailable'))
  }
  if (signal?.aborted) {
    return Promise.reject(abortError())
  }

  let resolveResponse!: (response: Response) => void
  let rejectResponse!: (error: unknown) => void
  const responsePromise = new Promise<Response>((resolve, reject) => {
    resolveResponse = resolve
    rejectResponse = reject
  })
  const state: GatewayStreamState = {
    requestId,
    request,
    api,
    responsePromise,
    resolveResponse,
    rejectResponse,
    controller: null,
    pendingBodylessResponse: null,
    responseReceived: false,
    responseSettled: false,
    terminal: false,
    signal,
  }
  requestPromises.set(requestId, state)

  if (signal) {
    state.abortListener = () => cancelRequest(state)
    signal.addEventListener('abort', state.abortListener, { once: true })
  }

  void api
    .openDirectGatewayStream(requestId, request, (event) => handleStreamEvent(state, event))
    .then((ack) => {
      if (!state.terminal && ack.requestId !== requestId) {
        failRequest(state, new Error('Gateway acknowledged a different request ID'))
      }
    })
    .catch((error: unknown) => failRequest(state, error))

  return responsePromise
}
