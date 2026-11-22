# Feature Enhancement Checklist & Validation

Use this procedural checklist alongside `AGENTS.md` and relevant repository guides under `docs/` when refining, hardening, or cleaning up an existing feature, component, or (when present) paired backend endpoint.

## 1. Core enhancement focus areas

- **State & lifecycle hygiene (client/frontend):**
  - Eliminate duplicated sources of truth: prefer render-time derivation, focused selectors, or key-based resets over synchronizing props or remote cache back into local state.
  - Keep state transitions pure, deterministic, and unit-testable with explicit discriminated actions.
  - Keep ephemeral UI flags out of persistent storage (persist durable non-sensitive state only), validate hydrated payloads before use, handle storage quota/unavailable errors cleanly, and purge deprecated sensitive keys during storage schema migrations.
  - Guard against async races: cancel superseded requests, ignore stale async results after reset/unmount/revision changes, and release created object URLs on cleanup.
- **Validation, concurrency & error recovery:**
  - Validate untrusted external payloads at API, storage, and client adapter boundaries using strict runtime schemas or focused guards.
  - Preserve idempotency keys on creation retries and optimistic concurrency checks (such as version predicates rejecting stale writes without discarding unsaved user edits) when supported by the backend.
  - Clear private query caches and session state cleanly upon authentication expiry (`401`).
  - Surface clear, user-safe error messages without exposing stack traces, raw schema dumps, credentials, cookies, or private payloads; preserve edits on failed submissions and block duplicate submits while pending.
- **UX edge states & accessibility:**
  - Verify loading, empty, error, disabled, and confirmation states at narrow and wide viewports.
  - Ensure visible labels, error association, keyboard accessibility, focus restoration on modals/drawers, theme parity across configured modes, and live status/alert announcements (including graceful fallback feedback if optional browser APIs such as clipboard access fail).
- **Evidence-based performance:**
  - Separate query/computation cost from UI rendering cost before optimizing.
  - Debounce search inputs, pause background polling when viewing deeper paginated pages or terminal states, and defer heavy widgets or virtualize lists only when measurements justify it.

## 2. Architecture & optional backend boundaries

Inspect `AGENTS.md`, `docs/`, and the repository's configured linter rules to confirm every modified file preserves:

- **Feature barrel discipline:** Outside a feature, import only from its public entry point; inside a feature, use direct internal imports and avoid importing the feature's own public barrel (cycle prevention).
- **One-way layering:** Keep features and shared client modules independent of app composition/routes; keep shared client modules independent of business features unless an exception is documented in `AGENTS.md`; keep shared contracts independent of client UI and server runtimes; keep server modules free of UI libraries and client bundles free of server-only modules.
- **Optional shared contracts & backend API (when present):** Synchronize shared validation schemas and pure cross-tier rules in the shared contracts boundary; keep backend route handlers thin, enforce auth/role/CSRF rules and downstream DB privileges on protected routes, and update route/gateway-double tests alongside endpoint edits.
- **Colocated test hygiene:** Keep test state isolated per test (fresh providers/caches, clean DOM/storage/stores, disabled automatic retries when testing errors, and single-boundary I/O stubs).

## 3. Verification steps

1. Format modified files using the repository's configured formatter.
2. Run the repository's configured lint, format-check, test, type-check, and build commands via the project's configured runner.
