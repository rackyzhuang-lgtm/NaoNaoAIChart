# Task 0033: OpenAI Streaming Canvas Agent

- Status: In progress
- Branch: `codex/infinite-canvas-openai-agent`
- Date: 2026-08-09

## Goal

Allow the embedded Infinite Canvas Agent to use a user-configured OpenAI-compatible API URL, API key, and model through streaming Chat Completions. The Agent must be able to use approved application Skills and MCP tools without exposing the API key to the iframe.

## Scope

- Preserve the vendored canvas UI and canvas data model.
- Add a loopback compatibility gateway that translates the existing Canvas Agent protocol to OpenAI Chat Completions streaming.
- Convert canvas operations, enabled Skills, and enabled MCP tools into OpenAI function tools.
- Keep API credentials in the Electron main process for the running application session only.
- Require explicit approval before host-side mutable or process-executing tools run.

## Non-goals

- Do not expose the application JWT, refresh token, or existing provider credentials to the iframe.
- Do not allow arbitrary remote API origins, private IP addresses, redirects, or administrator endpoints.
- Do not make Skill installation, arbitrary commands, or unrestricted filesystem access available by default.
- Do not change the sub2api server.

## Delivery Plan

1. Add the agent gateway contract, URL policy, session-only credential holder, and task/ADR documentation.
2. Add the OpenAI SSE client and tool-call accumulator with cancellation, timeout, and a bounded tool-call loop.
3. Expose a narrow host bridge for enabled Skill metadata/loading and enabled MCP schemas/execution.
4. Route Canvas Agent events through the gateway, preserving canvas operation approval and tool results.
5. Update the iframe connect UX to configure API URL, key, and model without persisting the key in its localStorage.
6. Add focused tests, run typecheck/lint/build, then run a desktop smoke test locally.

## Acceptance Criteria

- A valid allowed API URL, key, and tool-capable model produces a streamed text response.
- Streamed `tool_calls` are reassembled, executed once, returned to the model, and followed by another streamed response.
- Enabled Skills are discoverable through `load_skill`; disabled Skills are absent.
- Enabled MCP tools are exposed under a stable namespace; tool errors and user rejection return a model-visible error without execution retries.
- API keys are absent from iframe storage, URL query strings, renderer-visible IPC results, and logs.
- Existing canvas-only Local Agent connections continue to work.

## Verification Record

- Passed: focused gateway, SSE, origin-policy, and static-server tests (4 files / 6 tests).
- Passed: `corepack pnpm check` (TypeScript 0 errors).
- Passed: Biome lint for the new gateway and Canvas host bridge files.
- Completed with baseline warnings: `corepack pnpm lint` completed with 889 pre-existing repository warnings; the Canvas-specific changed-file lint is clean.
- Completed: `corepack pnpm run build`; only existing dependency `eval` warnings were emitted.
- Desktop startup: Electron development mode launched, and the main-process loopback Canvas server listened on `127.0.0.1`. An initial route-generator conflict caused by the host broker file location was fixed, followed by a successful typecheck. Full interactive desktop automation remains not executed.
- Full test suite was run and produced no observed failing test output, but the terminal summary was truncated; do not treat the full-suite result as a recorded pass. The focused Canvas tests remain the authoritative pass result for this task.

## Implemented Design

- The Electron main process owns the OpenAI-compatible URL, API key, model, streamed request, and loopback Agent token. The API key is session-only and is never returned by IPC.
- The Canvas host page accepts the API configuration and reloads the embedded Canvas Agent through a loopback endpoint. The iframe receives only a loopback URL and connection token; the bridge prevents that token from being persisted by the upstream Agent store.
- Enabled application Skills are exposed only through `load_skill`. Skill content is bounded and does not include the source directory or file paths.
- MCP tools are enumerated from running, enabled application MCP servers with a stable `mcp__<server-id>__<tool-name>` name. They are disabled until the user enables the Canvas MCP switch, and every call requires an explicit renderer confirmation.
