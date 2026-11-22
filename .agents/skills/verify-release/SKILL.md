---
name: verify-release
description: >-
  Run pre-release, post-build, and deployment verification checks across the
  project's frontend and (when present) backend API and database artifacts
  against repository testing, architecture, and deployment guides. Use when
  preparing a release, auditing base-path or proxy routing, checking production
  env requirements, or executing release checklists; not for routine feature
  coding (use create-feature), database schema/RLS authoring (use
  manage-database), dependency advisories (use triage-dependabot), or
  security-policy hardening (use audit-security).
---

# Verify Release

Validate built production artifacts, deployment base paths, routing/proxy configuration, environment separation, and (when present) backend server and database checks before or after deployment. Clearly separate **verified automated/local checks** from **unverified live-host, browser, or external-database checks**.

## 1. Establish verification scope and target

1. Read `AGENTS.md`, `README.md`, and relevant guides present in `docs/` (testing, architecture, security, and database/storage guides when configured).
2. Inspect configuration files relevant to the active stack: project/workspace manifests, framework/build configs, deployment and CI pipeline configs, environment example files, and (when present) backend env validation or database configs.
3. Determine the verification target:
   - **Pre-merge / local production verification:** CI suite, production builds, base-path/routing/config invariants, and local built-app preview/start checks (plus local database reset/lint checks when configured and running).
   - **Post-deploy / hosted release verification:** Confirm the deployed commit SHA/workflow outcome, verify configured public URLs and production env/cookie settings, and walk through release checks (marking uninspected live-host checks honestly as unverified).
4. Keep this skill **read-only by default** unless the user explicitly asks to fix a discovered release defect.

## 2. Load the release checklist

Load [Release verification checklist](./references/release-verification-checklist.md) for CI parity steps, optional backend/database readiness checks, built-app smoke checks, and honest status classification (`Verified` / `Failed` / `Unverified`).

## 3. Verify automated CI parity

Run the validation sequence configured in the repository's CI workflow and project manifests (typically lint, format-check, test, type-check, and build via the project's configured runner). Confirm builds and tests succeed without live secrets or cloud credentials, and run configured database checks when local DB services are active.

## 4. Verify deployment configuration, base-path, and runtime invariants

Inspect configuration files directly against repository architecture, security, and database guides:

- **Frontend base paths, assets, and public env separation (when present):** Verify configured public base paths, router base paths, and static asset URLs remain subpath-safe; confirm public client env files document only safe build-time values without secrets and check that gitignored local env overrides do not inadvertently alter the release bundle.
- **Backend runtime bundling, proxy, cookies, and seed isolation (when present):** Verify server build configs externalize native/runtime addons cleanly per the repository's build tool, confirm production runtime flags (origin allowlists, HTTPS-only cookie flags, same-origin API/storage/CDN routing), and confirm local-only developer credential seeds stay excluded from staging/production databases.

## 5. Run built-app release checks

Execute runnable checks from [Release verification checklist](./references/release-verification-checklist.md) using the repository's configured preview/start scripts. Stop started local processes afterward and confirm working-tree status is clean of stray artifacts.

## 6. Respect approval gates

- Do **not** trigger deployments, push tags/commits, push remote database migrations, modify CI variables/environments, rotate secrets, install dependencies, or mutate live cloud databases/storage without explicit user approval.
- Never claim a browser check, live URL, readiness probe, or response header passed unless directly observed.

## 7. Deliver structured release report

Report concisely in this order:

1. Target scope (commit/branch, affected modules/migrations, deployment targets).
2. Automated CI check results (exact commands run and observed pass/fail status).
3. Deployment config, base-path, proxy, env/cookie, and seed-isolation verification results.
4. Release checklist results: **Verified** vs. **Blocked / Unverified (manual, local-DB, or live-host steps required)**.
5. Go/no-go summary, release blockers (if any), and rollback/follow-up notes.

## Skill boundaries

- Use **this skill** (`verify-release`) for pre-release validation, CI parity, base-path/proxy/runtime checks, and release checklists.
- Use `manage-database` for designing or auditing database schemas, migrations, access-control/RLS policies, database functions, storage buckets, and seeds.
- Use `audit-security` for deep trust-boundary, auth/session, CSRF, storage, header, or CI workflow security audits/remediation.
- Use `audit-performance` for production bundle/runtime profiling, DB query optimization, and Core Web Vitals optimization.
- Use `audit-accessibility` for thorough WCAG 2.2, keyboard, ARIA, and assistive-technology audits.
- Use `triage-dependabot` for dependency security advisories and Dependabot alerts.
- Use `commit-push-staged` to commit and push already-staged changes after release checks pass.
- Use `sync-docs` if release steps, base paths, or deployment docs drifted from configuration.
