# Task 0066: Route Gemini image models through the Canvas Gemini protocol

- Status: Completed pending manual Canvas verification
- Date: 2026-08-14

## Problem

Infinite Canvas previously imported every discovered model into an OpenAI-format channel. Gemini image models were therefore sent to the OpenAI Images API and failed with `Images API is not supported for this platform`.

## Scope

- Add an `apiFormat` field to each Infinite Canvas import model.
- Classify Gemini image model IDs into `gemini`; keep GPT image and all other imported models on `openai`.
- Split one imported API key into stable protocol-specific Canvas channels when required.
- Migrate the prior unsuffixed managed channel and retain compatibility with historical payloads that do not contain `apiFormat`.
- Do not modify the sub2api service, source snapshot, credentials, brand content, network policy, packaging, push, or release.

## Acceptance criteria

- [x] `gpt-image-*` imports through an `openai` Canvas channel.
- [x] Gemini image IDs import through a `gemini` Canvas channel.
- [x] Mixed imports preserve the correct protocol and capability defaults for every model.
- [x] Historical payloads without `apiFormat` remain OpenAI-compatible.
- [x] Existing unsuffixed managed channels are removed during re-import.
- [ ] Manual Infinite Canvas generation with a real Gemini image key has not been executed.

## Verification

- `corepack pnpm exec vitest run` for the eight focused suites: passed, 82 tests.
- `node --check assets/infinite-canvas/naonao-embed-bridge.js`: passed.
- `corepack pnpm check`: passed.
- Biome passed for the ten modified bridge, contract, classifier, client, renderer, and related test files. The separately modified IPC fixture retains one pre-existing formatting diagnostic outside this change's hunk; its 12-test suite and the TypeScript check passed.
- `git diff --check`: passed.
- No real model request, desktop manual Canvas generation, packaging, push, or release is included in this task.
