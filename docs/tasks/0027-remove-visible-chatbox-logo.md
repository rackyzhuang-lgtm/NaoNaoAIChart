# Task 0027: Remove Visible Chatbox Logo

## Scope

- Replace the onboarding card's legacy Chatbox logo asset with the NaoNaoAI app icon.
- Prevent the legacy Chatbox provider fallback from rendering the upstream Chatbox logo in model/provider surfaces.
- Keep legacy provider identifiers and compatibility data readable.

## Acceptance

- No user-visible onboarding or provider icon uses the legacy Chatbox logo.
- Existing provider icon fallback behavior remains available for other providers.
- Add focused regression coverage for the changed rendering paths.
- Run targeted tests, `pnpm check`, desktop smoke E2E, and `git diff --check`.

## Risks

- Historical Chatbox provider configurations may still be present. They must remain readable, but their icon must use the NaoNaoAI icon or a neutral fallback.
