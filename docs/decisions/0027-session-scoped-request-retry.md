# ADR-0027: Session-scoped generation retry

- Status: Accepted
- Date: 2026-08-12
- Related tasks: TASK-0067, TASK-0068
- Extends: ADR-0025 and ADR-0026

## Context

The fixed NaoNaoAI gateway must keep the existing at-most-once network dispatch
rule for each request ID. A user may nevertheless want a failed chat turn to
retry without affecting another conversation window. Retrying in the fetch
adapter or main-process gateway would violate request ownership and make the
retry budget global.

## Decision

1. A logical user message has one initial attempt and at most five additional
   attempts. The total budget is six sequential attempts.
2. The budget is keyed by the renderer session and assistant message. Different
   sessions have independent counters; a new user message starts a new budget.
3. The existing generation lock remains held for the complete initial attempt
   and retry chain. A later attempt starts only after the previous attempt has
   reached a terminal success or failure state.
4. Each retry derives a new request-attempt ID. The assistant message identity
   remains stable, while the main process keeps its request-ID tombstone and
   rejects terminal replay.
5. Automatic retry applies only to terminal generation failures for the fixed
   NaoNaoAI chat gateway. Explicit user cancellation, renderer destruction, and
   local request-ID protocol conflicts do not retry.
6. The retry loop is implemented in renderer session orchestration. The main
   gateway, IPC stream protocol, AI SDK adapter, and other providers do not gain
   automatic retry behavior.

## Consequences

- A failed turn can issue up to six billable attempts, so retries remain visible
  in session state and stop deterministically at the per-message limit.
- Partial output is cleared before the next attempt so failed attempts are not
  concatenated into the final assistant message.
- Network or stream failures can have an unknown upstream outcome; accepting
  all terminal generation failures therefore carries a possible duplicate-cost
  risk that must be recorded during owner acceptance.
- No database migration or external API is required; retry state is runtime
  renderer state keyed by session and message.

## Knowledge-base boundary

The static `codex_knowledge_base` session protocol and request-routing records
are used only as design references for terminal state, request ownership, and
interrupt handling. Its background `jobs.retry_remaining/retry_at/lease`
schema is not copied to billable model requests, and no knowledge-base code is
executed.
