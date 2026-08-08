# ADR-0010: OpenAI Streaming Agent Gateway for Infinite Canvas

- Status: Accepted
- Date: 2026-08-09

## Context

Infinite Canvas ships a browser UI for a local Canvas Agent protocol. The selected model service only exposes OpenAI-compatible APIs, not that protocol. The embedded iframe must not receive the application API key or broad Electron IPC access. The application already owns Skill and MCP lifecycles in the trusted renderer/main process boundary.

## Decision

Use a loopback Canvas Agent compatibility gateway.

```text
Canvas iframe -> loopback Canvas Agent protocol -> Electron gateway -> OpenAI Chat Completions SSE
                                                   -> trusted Skill/MCP bridge
```

The gateway accepts a session-only API configuration through narrow IPC, validates the target against the exact approved HTTPS origins, and sends the API key only in an upstream `Authorization: Bearer` header. It translates OpenAI streamed text and function calls into the Canvas Agent event model.

Only enabled Skills and MCP tools may be advertised. Skills are exposed as a `load_skill` function. MCP tools retain their `mcp__server__tool` namespace. Mutable or host-executing actions must require a confirmation path; arbitrary commands, Skill installation, and full filesystem access are not part of the initial tool catalog.

For the embedded host, the approved MCP namespace is `mcp__<server-id>__<tool-name>` rather than a display-name-derived identifier. This prevents tool collisions between servers with the same display name. Canvas MCP access is opt-in and each invocation requires a separate confirmation in the trusted renderer.

## Consequences

- The canvas UI remains substantially upstream-compatible.
- API key handling moves outside the iframe persistence boundary.
- The gateway must manage per-canvas conversation state, SSE parsing, tool-call accumulation, cancellation, and tool-result continuation.
- This feature needs a narrow cross-context bridge and targeted security tests.
