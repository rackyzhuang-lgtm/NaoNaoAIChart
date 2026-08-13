# ADR-0026: Per-request fixed-gateway concurrency

- Status: Accepted
- Date: 2026-08-11
- Related task: `docs/tasks/0066-concurrent-chat-window-requests.md`
- Supersedes: ADR-0025 decision items 5 and 9 only

## Context

ADR-0025 introduced a process-wide single active request slot to stop repeated
billable requests. Stable logical request IDs, renderer submission locks, and
per-session generation locks now provide the actual duplicate boundary. The
global slot rejects a legitimate request from another conversation or window
with `REQUEST_IN_PROGRESS`, even though it has a distinct logical identity.

The product supports multiple conversations and windows. Independent explicit
submissions must not share a global generation lock.

## Decision

1. Every accepted fixed-gateway request ID retains its process-lifetime
   tombstone and can cause at most one network dispatch.
2. Matching active IDs reuse the original Promise only for an identical
   request; conflicting reuse and terminal replay remain rejected.
3. Different request IDs dispatch independently and may stream concurrently.
   They are never queued for dispatch after another request completes.
4. Each request retains its own renderer owner, stream callback, Promise, and
   `AbortController`; cancellation, failure, or renderer exit affects only the
   matching request ID.
5. Same-session operations remain serialized by the renderer session generation
   lock. Synchronous input submission and operation-key locks continue to
   suppress repeated UI invocation before a second request ID can be created.
6. No automatic retry, timeout resend, response replay, or crash recovery is
   introduced.

## Consequences

- Two windows or conversations can generate responses at the same time.
- Legitimate concurrency no longer produces `REQUEST_IN_PROGRESS`.
- The at-most-once billing invariant applies per explicit logical request,
  rather than globally blocking unrelated user actions.
- Accepted-ID memory and concurrent upstream usage can grow with independent
  explicit submissions. The server remains authoritative for account
  concurrency limits and rate limits.

## Alternatives considered

- Keep the global slot: rejected because it makes multi-window use fail.
- Queue later requests: rejected because delayed billable work could run after
  the user-visible context has changed.
- Remove request tombstones: rejected because terminal replay could duplicate
  charges.

## Validation

- Focused tests cover concurrent dispatch, per-ID Promise reuse, body conflict,
  terminal replay, transport-failure isolation, and cancellation isolation.
- Type checking, full tests, build, clean restart, and manual multi-window
  acceptance are recorded in Task 0066.

## Pending confirmation

- The maximum useful client-side concurrency remains server-controlled; no
  additional local concurrency cap is defined in this change.
