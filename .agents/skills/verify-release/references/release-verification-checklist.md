# Release Verification Checklist & Commands

Use this procedural checklist alongside `AGENTS.md`, `README.md`, and relevant repository guides under `docs/` when validating a release candidate or deployment across single-app or multi-package repositories.

## 1. Full CI parity check

1. Run the repository's configured lint, format-check, test, type-check, and build commands from the repository root using the configured runner (matching the CI workflow sequence).
2. Confirm all CI checks succeed without live cloud credentials or private local env secrets, and confirm local env overrides do not alter production client build flags under test.
3. When local database tooling/services are configured and running, also run the repository's configured local database reset, migration, and schema lint commands.

## 2. Optional backend, database & environment readiness checks (when present)

- [ ] **Server-side env & cookie flags:** Confirm server runtime variables (allowed origins, HTTPS-only `Secure` cookie flags, database keys, signing secrets) remain strictly server-side and never appear under public client build-env prefixes.
- [ ] **Seed isolation:** Confirm local-only developer credential seeds are **never** applied to staging or production databases; only idempotent baseline seeds run on fresh non-local environments.
- [ ] **Same-origin API & storage routing:** Confirm the production proxy or serving host routes API endpoints, health probes, and storage/CDN URLs consistently with origin allowlists, cookies, and CORS policy.

## 3. Built-app verification checklist (browser / live host)

Execute against locally built production preview/server processes using the repository's configured scripts (or against the deployed target URL):

- [ ] **Health & readiness probes (if backend present):** Verify configured health and readiness endpoints return healthy `200` responses against the target database.
- [ ] **Base path, proxy & reload:** Open the public base URL and deep/secondary routes directly, then hard-reload. Confirm zero console errors, zero 404/base-path asset or API/storage proxy failures, zero unused preload warnings on secondary routes, clean lazy-chunk loading, and working unknown-route fallback.
- [ ] **Themes & responsiveness:** Check narrow and wide viewports; toggle light/dark themes where supported and confirm persistence across reload.
- [ ] **Localization:** In localized apps, switch across every configured locale and check visible copy, labels, errors, and document/nav text.
- [ ] **Interactive & keyboard smoke checks:** Test primary forms/actions, authenticated workflows (if present), error/conflict recovery (`409` or validation feedback), and modal/drawer keyboard navigation and focus restoration.

## 4. Honest verification status table

Always classify each item in the final release report:

| Status     | Meaning                                                                              |
| ---------- | ------------------------------------------------------------------------------------ |
| Verified   | Command, config check, or browser/live check was executed and directly observed.     |
| Failed     | Executed and observed a failure (include exact error/path and whether pre-existing). |
| Unverified | Could not run in this environment (e.g., no local DB daemon, live host, or browser). |
