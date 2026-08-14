# ADR-0033: Forward Gemini API authentication through the Infinite Canvas proxy

- Status: Accepted
- Date: 2026-08-14
- Related task: `docs/tasks/0067-infinite-canvas-gemini-api-key-forwarding.md`

## Context

Infinite Canvas routes external HTTPS calls through a local proxy and applies an explicit request-header allowlist. Gemini image generation uses `x-goog-api-key`, while the imported sub2api key had been forwarded only for OpenAI-format requests through `Authorization`. The proxy therefore removed the Gemini credential before the request reached the model gateway.

## Decision

Add `x-goog-api-key` to the existing allowlist and declare it in the local proxy's CORS preflight response. The proxy continues to exclude all headers not on the allowlist, including cookies and arbitrary caller-supplied headers.

## Consequences

Gemini-format Canvas requests can authenticate with the imported user API key. This does not expand the allowed target, change key storage, or alter sub2api server behavior.
