---
name: verify-release
description: >-
  Run pre-release, post-build, and deployment verification checks across the
  project's production builds against
  docs/testing-strategy.md and docs/architecture.md. Use when preparing a
  release, auditing base-path routing, or executing release checklists; not for
  routine feature coding (use create-feature), dependency advisories (use
  triage-dependabot), or security-policy hardening (use audit-security).
---

# Verify Release

Validate built production artifacts, deployment base paths, routing configuration, and release checklists before or after deployment. Clearly separate **verified automated/local checks** from **unverified live-host, browser, or external-provider checks**.

## 1. Establish verification scope and target

1. Read `AGENTS.md`, `docs/testing-strategy.md` (`Choosing checks` and `Release checks`), and `docs/architecture.md` (`Build configuration` and `Routing and deployment`).
2. Inspect configuration and docs:
   - Root `package.json`, `.github/workflows/ci.yml`.
   - `README.md` for release checklists, base paths, environment variables, and external prerequisites.
3. Determine the verification target:
   - **Pre-merge / local production verification:** CI suite, production builds, routing/config invariants, and local built-app preview/start checks.
   - **Post-deploy / hosted release verification:** Confirm the deployed commit SHA/workflow outcome, verify configured public URLs, and walk through release checks (marking uninspected live-host checks honestly as unverified).
4. Keep this skill **read-only by default** unless the user explicitly asks to fix a discovered release defect.

## 2. Load the release checklist

Load [Release verification checklist](./references/release-verification-checklist.md) for exact CI commands, and browser/manual verification items.

## 3. Verify automated CI parity

Run the full validation sequence from the repository root (matching `.github/workflows/ci.yml`):

1. `npm run lint`
2. `npm run format:check`
3. `npm run test`
4. `npm run typecheck`
5. `npm run build`

Use `npm.cmd` and `npx.cmd` on Windows PowerShell if `.ps1` launchers are blocked. Verify that builds and tests succeed without live secrets or cloud credentials.

## 4. Verify deployment configuration and base-path invariants

Inspect configuration files directly against `docs/architecture.md`:

- **Vite base paths, assets, and public env flags:**
  - Confirm `vite.config.*` `base`, router `basename={import.meta.env.BASE_URL}` (when React Router is used), and `public/` asset URLs (`BASE_URL` / `%BASE_URL%`) stay subpath-safe.
  - Confirm `.env.example` documents public `VITE_*` build flags and verify local `.env.local` overrides do not inadvertently alter the release bundle under test.

## 5. Run built-app release checks

Execute every runnable check and explicitly record what requires manual or live-host confirmation:

- **Built Vite apps:** Serve with `npm run preview` (after building). Check direct base URL load and reload, secondary routes and lazy-chunk loading, browser console/network for missing `public/` assets, unused `<link rel="preload">` warnings, or base-path errors, unknown-route fallback, responsive narrow/wide layouts, theme toggling/persistence (where supported), configured locales (in localized apps), and modal keyboard navigation.
- **Clean up temporary artifacts/processes:** Stop any started local preview/dev servers and confirm `git status` is clean of stray build artifacts.

## 6. Respect approval gates

- Do **not** trigger deployments, push tags/commits, modify GitHub Actions variables/environments, rotate secrets, install dependencies, or mutate live cloud databases/storage/webhooks without explicit user approval.
- Never claim a browser check, live URL, webhook sync, or response header passed unless directly observed.

## 7. Deliver structured release report

Report concisely in this order:

1. Target scope (commit/branch, affected apps/packages, deployment targets).
2. Automated CI check results (exact commands run and observed pass/fail status).
3. Deployment config, base-path, and routing verification results.
4. Release checklist results: **Verified** vs. **Blocked / Unverified (manual or live-host steps required)**.
5. Go/no-go summary, release blockers (if any), and rollback/follow-up notes.

## Skill boundaries

- Use **this skill** (`verify-release`) for pre-release validation, CI parity, base-path/routing checks, and release checklists.
- Use `audit-security` for deep trust-boundary, auth/session, storage, header, or CI workflow security audits/remediation.
- Use `audit-performance` for production bundle/runtime profiling and Core Web Vitals optimization.
- Use `audit-accessibility` for thorough WCAG 2.2, keyboard, ARIA, and assistive-technology audits.
- Use `triage-dependabot` for npm audit findings and Dependabot alerts.
- Use `commit-push-staged` to commit and push already-staged changes after release checks pass.
- Use `sync-docs` if release steps, base paths, or deployment docs drifted from configuration.
