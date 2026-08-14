# ADR-0032: Infinite Canvas image protocol selection

- Status: Accepted
- Date: 2026-08-14
- Related task: `docs/tasks/0066-infinite-canvas-gemini-image-protocol.md`

## Context

Infinite Canvas supports both OpenAI Images API calls and Gemini `generateContent` image calls. The import bridge previously created every managed channel with `apiFormat: 'openai'`, even when the selected API key exposed Gemini image models. Those models consequently used an unsupported API route.

## Decision

1. The main-process model classifier includes a per-model `apiFormat` in the Canvas import contract.
2. Only model IDs recognized as Gemini image models use `gemini`; GPT image models and all other models retain `openai`.
3. The bridge creates one stable managed channel per imported key and protocol: `naonao-key-<id>-openai` and, when needed, `naonao-key-<id>-gemini`.
4. The bridge removes the prior unsuffixed managed channel on re-import and defaults missing historical `apiFormat` values to `openai`.
5. Protocol choice remains local Canvas configuration. The gateway URL, credential scope, request proxy rules, and sub2api service behavior do not change.

## Consequences

- Gemini image models use the Canvas Gemini request construction, including `generateContent` and the Gemini API key header.
- GPT image models continue to use the OpenAI Images API.
- A single imported key may be represented by multiple Canvas channels; unrelated channels and settings remain intact.
- Non-image Gemini model IDs remain OpenAI-compatible so existing text gateway behavior is not changed.
