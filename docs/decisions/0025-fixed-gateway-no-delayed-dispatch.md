# ADR-0025: No delayed dispatch for fixed-gateway model requests

- Status: Accepted
- Date: 2026-08-11
- Related task: `docs/tasks/0063-request-id-stream-protocol.md`
- Supersedes: the queued-request portion of ADR-0024

## Context

ADR-0024 replaced the buffered Electron bridge with request-ID streaming, but
its first implementation retained different request IDs in a FIFO queue. That
only delayed an accidental second or third model POST. When the active request
ended, every queued POST still reached the billable gateway.

The renderer also created its UUID inside the lowest request adapter. Repeating
one logical assistant generation therefore produced new UUIDs that the
main-process same-ID Promise map could not recognize. Deleting an ID at terminal
state additionally allowed that ID to be sent again.

The read-only knowledge-base queue schedules local app-server RPC. It is not an
authorization mechanism for delayed billable HTTP dispatch and must not be
copied to that boundary.

## Decision

1. The assistant generation supplies a stable logical identity. Each provider
   step derives a deterministic UUID from that identity and its step sequence;
   request bodies are not hashed or used as identity.
2. An explicit user retry receives a new attempt namespace. Error handlers,
   timeouts, IPC failures, and transport failures never create one themselves.
3. Main registers every accepted request ID before `fetch` and retains the ID
   for the main-process lifetime. A terminal replay is rejected without network
   access.
4. A matching duplicate while active reuses the original Promise only when its
   URL, method, allowed headers, and body match. Conflicting reuse is rejected.
5. A different ID received while a model request is active is rejected
   immediately. It is not queued and cannot be dispatched later by completion,
   failure, disconnect, or cancellation of the active request.
6. Public generation and tool-continuation entry points deduplicate repeated UI
   invocation keys while their original task is in flight. The input box also
   acquires a synchronous submission lock before any await, including on the
   new-session route where the original submission remains awaited.
7. Fixed-gateway status retries are disabled using the complete configured
   endpoint (`apiHost + apiPath`), in addition to the existing zero retries in
   the AI SDK and request adapters.
8. Renderer abort, main-frame navigation, render-process exit, and WebContents
   destruction cancel the matching main-process `AbortController`.
9. Explicit multi-Agent support does not bypass the single active request gate.
   Any future parallel authorization requires a separate end-to-end contract.

## Consequences

- Accidental requests fail visibly instead of becoming delayed billable work.
- A later normal send is allowed only through a fresh explicit invocation after
  the active lifecycle ends.
- Multi-step tool turns retain distinct deterministic provider-step IDs while
  remaining serial at the gateway boundary.
- Accepted-ID memory grows with fixed-gateway use until process exit. This is a
  deliberate tradeoff for the at-most-once invariant; the IDs contain no prompt,
  credential, or response content.
- Restart recovery does not automatically resume an interrupted model request.
  A project-owner action is required to retry it with a new attempt identity.

## Alternatives considered

- Keep the FIFO and wait for the active request to end: rejected because an
  accidental request would still be sent and billed later.
- Coalesce by request-body hash: rejected because payload equality is not a
  logical user-action identity and risks retaining sensitive request material.
- Retry 429/5xx automatically: rejected for the fixed gateway because an
  intermediary status does not prove the upstream model did no billable work.
- Persist every accepted UUID to the user database: deferred because current
  startup behavior does not auto-resume interrupted generations, while the
  deterministic logical identity and process-lifetime set cover runtime replay.

## Validation

- Focused tests cover active duplicate reuse, body conflict, terminal replay,
  overlap rejection, transport failure, cancellation, renderer exit, streaming
  before completion, empty or bodyless SSE failure, owner-scoped cancellation,
  synchronous input submission, and deterministic provider-step IDs.
- Type checking, full tests, lint, build, clean startup, and project-owner
  billing-log acceptance are recorded in Task 0063 rather than inferred here.

## Pending confirmation

- A future explicit parallel/multi-Agent request authorization protocol.
- Whether accepted-ID persistence is required if automatic crash recovery is
  introduced later.
