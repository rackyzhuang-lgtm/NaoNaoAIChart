# ADR-0024: Request-ID streaming for the fixed sub2api gateway

- Status: Accepted
- Date: 2026-08-11
- Related task: `docs/tasks/0063-request-id-stream-protocol.md`

## Context

The fixed sub2api gateway must be called from Electron main because the renderer
cannot rely on gateway CORS headers. ADR-0017 initially solved that boundary by
buffering the full response body in main. ADR-0020 later added body-hash
coalescing, short response replay, and a response-header timeout.

Those mechanisms do not model a logical request lifecycle. Buffering prevents
incremental SSE rendering, a response-header timeout can abort a request after
the provider accepted it, and a body hash cannot bind start, stream events,
errors, cancellation, and cleanup to one stable identity.

The read-only knowledge-base evidence uses a request-ID-to-Promise map, explicit
in-flight/queued state, an early request acknowledgement, and later terminal
notifications. It does not treat a model response as one long synchronous IPC
return value.

## Decision

1. The renderer creates one UUID per fixed-gateway call and registers its
   Promise before dispatch.
2. The start IPC validates the UUID and fixed gateway request, starts or queues
   it, and immediately returns `{ requestId }`.
3. Response metadata, raw data chunks, completion, and safe errors travel on a
   dedicated IPC event channel and always include the same request ID.
4. Electron main maintains a request map and a single dispatch lane. The same
   ID reuses the existing Promise; later IDs remain queued until the active ID
   reaches a terminal state.
5. Terminal states are provider completion/failure/incomplete events, `[DONE]`,
   response EOF, an explicit transport error, or explicit cancellation.
6. Renderer cancellation invokes a cancel IPC that aborts the exact
   main-process fetch.
7. Fixed-gateway calls bypass the renderer retry helper. Main applies no model
   response timeout, automatic retry, body-fingerprint coalescing, or completed
   response replay.
8. Other providers and panel API requests retain their existing retry and
   timeout behavior.
9. The protocol remains a narrow trusted IPC bridge. It adds no HTTP endpoint,
   remote service, or listening port.

## Superseded decisions

- This ADR supersedes ADR-0017's buffered-body consequence. The fixed IPC
  security boundary remains, but response delivery is now incremental.
- This ADR supersedes ADR-0020's body-hash replay and fixed-gateway model timeout
  decisions. ADR-0020's no-automatic-retry requirement remains in force.

## Consequences

- The existing AI SDK receives a standard `Response` backed by a real
  `ReadableStream`, so no provider parser rewrite is required.
- A lost connection is surfaced as one failed logical request and is never
  silently resubmitted. The user must explicitly start a new attempt.
- The single lane may delay a later user request, but it prevents overlapping
  billable sends unless a future explicit parallel authorization contract is
  designed and tested end to end.
- Main and renderer must both clean request state on every terminal path; tests
  cover success, failure, cancellation, queuing, and duplicate IDs.
