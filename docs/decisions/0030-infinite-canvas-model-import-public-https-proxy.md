# ADR-0030: Automatic Canvas model import and public HTTPS proxy

- Status: Accepted
- Date: 2026-08-13
- Decision makers: Project owner, Codex
- Related task: `docs/tasks/0073-infinite-canvas-import-brand-network.md`

## Context

The previous Canvas import contract assigned one user-selected capability to every model returned by `/v1/models`. Mixed-capability keys were therefore imported incorrectly. The Canvas loopback proxy also allowed only two fixed service origins, preventing user-authorized keys for other public HTTPS model services from working.

## Decision

1. The main process classifies every discovered model independently. Explicit service metadata wins; otherwise the same model-family rules used by Infinite Canvas determine image, video, audio, or text capability.
2. Import remains an explicit user action. Only the selected API key enters the Canvas payload; panel JWT and refresh credentials remain in the main process.
3. The Canvas bridge stores one stable channel per key, preserves unrelated configuration, and assigns capability-specific defaults from the imported models.
4. The loopback proxy accepts structurally encoded public HTTPS targets rather than a fixed hostname allowlist. It rejects URL credentials, HTTP, administrative paths, redirects, and any hostname resolving to local, private, link-local, documentation, multicast, reserved, or otherwise non-public IP space.
5. DNS results are validated before dispatch and the HTTPS connection is pinned to one validated address while retaining the original hostname for TLS verification. Request methods and forwarded headers remain restricted.
6. Existing model request construction and response parsing in Infinite Canvas are unchanged. Historical bridge message and storage identifiers remain compatibility keys and are not user-visible branding.

## Consequences

- Mixed model keys import correctly without a manual capability choice.
- Users can use public HTTPS compatible model services without disabling Electron web security or CSP.
- The proxy has a broader hostname surface, so DNS/IP validation and connection pinning are mandatory security controls.
- Existing Canvas-stored API keys remain managed by Infinite Canvas after the explicit import.
