# Task 0067: Forward Gemini authentication through the Infinite Canvas proxy

- Status: Completed
- Date: 2026-08-14

## Problem

After a Gemini image model is imported into Infinite Canvas, generation fails with `API key is required`. The Canvas Gemini protocol sends the imported user key in `x-goog-api-key`, but the local HTTPS proxy only forwards `Accept`, `Authorization`, and `Content-Type`.

## Scope

- Forward `x-goog-api-key` through the existing loopback HTTPS proxy.
- Advertise the same header in CORS preflight responses.
- Preserve the existing request-header allowlist behavior for unrelated headers.
- Do not change the remote gateway, API-key storage, model import payload, domain policy, or user account data.

## Acceptance criteria

- A proxied Gemini request retains its `x-goog-api-key` header.
- The preflight allow-header response includes `X-Goog-Api-Key`.
- Cookies and arbitrary caller-supplied headers remain excluded.

## Verification

- `corepack pnpm exec vitest run src/main/infinite-canvas/static-server.test.ts src/main/infinite-canvas/embed-bridge.test.ts src/main/sub2api/canvas-model-capability.test.ts`: passed, 3 files and 26 tests.
- `corepack pnpm check`: passed.
- `git diff --check`: passed.
- Real Gemini image generation was not executed. No user API key was read, logged, or sent by the verification commands.
