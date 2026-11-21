---
name: audit-security
description: >-
  Audit and remediate application, trust-boundary, browser-storage, header, and
  CI/deployment security issues against docs/security.md. Use
  when reviewing or hardening authentication/sessions, Server Actions, API
  routes, signed storage URLs, XSS/URL validation, secret/log redaction,
  security headers, or GitHub Actions workflows; not for npm advisories or
  Dependabot alerts (use triage-dependabot) or routine feature work.
---

# Audit Security

Systematically audit or harden application trust boundaries, data handling, hosting configuration, and CI/CD workflows against `docs/security.md`. Treat browser input, external API payloads, files, URLs, client bundles, and realtime events as untrusted; separate verified source/config findings from unverified live-host controls.

## 1. Establish mode and scope

1. Read `AGENTS.md` and `docs/security.md` first.
2. Inspect target configuration (`package.json`, framework config, `.github/workflows/*.yml`).
3. Determine the execution mode:
   - **Mode A — Security Audit (read-only default):** When asked to audit, review, or threat-model an app, feature, diff, or workflow, inspect source and config without modifying files and deliver prioritized, file-backed findings.
   - **Mode B — Targeted Remediation:** When asked to fix or harden specific security issues, scope the exact files, trust boundaries, and regression tests before editing.
4. Preserve unrelated working behavior and public contracts unless a security fix explicitly requires changing an auth, error, storage, or header contract.

## 2. Load the security checklist and relevant guides

Load [Security audit checklist](./references/security-audit-checklist.md) for concrete inspection criteria, red-flag patterns, and verification commands.
Consult `docs/` selectively when a finding crosses concerns:

- Trust boundaries, auth, storage, headers, logging, and CI security: `docs/security.md`
- HTTP adapters, Server Actions, runtime schemas, and safe error envelopes: `docs/api-design.md`
- Session state, persistence, and teardown boundaries: `docs/state-management.md`
- App layering, server-only isolation, and release workflows: `docs/architecture.md`
- Feature boundaries: `docs/feature-structure.md`
- Test strategy and release verification: `docs/testing-strategy.md`

## 3. Audit by trust boundary

Inspect only the surfaces relevant to the target scope using actual source and configuration:

1. **Input validation, XSS, files, and URLs:**
   - Check for raw HTML sinks (`dangerouslySetInnerHTML`, `innerHTML`), dynamic code evaluation, or unvalidated `href`/redirect targets.
   - Verify external JSON, persisted Web Storage payloads, query params, realtime messages, `postMessage` events, and form/action inputs are validated from `unknown` (Zod or focused type guards).
   - Verify URL destinations enforce `https:` (or controlled `mailto:`/`sms:`/`tel:` with sanitized targets and URL-encoded bodies, or internal paths), reject embedded credentials, and match an allowlisted origin where expected.
   - Confirm server-side file upload handlers enforce size, content/header checks, ownership, and workflow state independently of browser `accept` hints.
1. **Credentials, private storage, and browser state:**
   - Verify bearer tokens stay in memory only (or `HttpOnly` cookies), never in URLs, router state, query keys, `localStorage`, `sessionStorage`, or IndexedDB.
   - Verify signed storage URLs validate the exact approved HTTPS origin/path and transfer with `credentials: 'omit'` and `referrerPolicy: 'no-referrer'` without app bearer headers.
   - Confirm private JSON/session responses send `Cache-Control: no-store`.
   - Confirm logout, session expiry, or account switch cancels in-flight work (`AbortSignal`), revokes object URLs, and clears private caches/drafts/state.
1. **Secrets, public bundles, and error/log redaction:**
   - Verify no private keys, service-role keys, signing secrets, or connection strings appear in Git, client configs, `VITE_*` env vars, public realtime payloads, and confirm public client UI flags (such as hiding admin navigation links) are treated strictly as UX toggles rather than authorization.
   - Verify `.env.example` documents variable names without secret values, `.env.local` remains gitignored without leaking unintended flag overrides into release builds, and builds/tests run without live credentials.
   - Inspect `console.*`, logger calls, and error handlers to ensure stack traces, raw provider errors, cookies, auth headers, signed URLs, filenames, and private contents are redacted or omitted.
1. **Security headers, embeds, and CI/CD workflows:**
   - Inspect framework configs for open redirects, overly permissive rewrites/CORS, or missing header policy. Mark live response headers (CSP, HSTS, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`) as **unverified** unless observed from a live host.
   - Inspect `.github/workflows/*.yml` for least-privilege `permissions:`, pinned full commit SHAs on third-party actions, `persist-credentials: false` on checkout steps where push is unneeded, and isolation of release credentials from PR jobs.

## 4. Remediate safely (Mode B only)

When implementing fixes:

1. Apply the smallest, clearest fix that closes the vulnerability at the authoritative trust boundary.
2. Add or tighten colocated Vitest regression tests proving the security invariant (auth denial/cancellation, malformed payloads, safe URL filtering, redacted errors, and session teardown).
3. Update `README.md` only if a documented threat model, session lifetime, storage policy, or security follow-up changed.

## 5. Validate within repository guardrails

1. For **Mode B**, inspect the diff to confirm only intended files changed and format changed files only:
   `npx --no-install prettier --write <changed-files>`
2. Run read-only verification checks (`lint`, `format:check`, `test`, `typecheck`, `build`). Use `npm.cmd` and `npx.cmd` on Windows PowerShell if `.ps1` launchers are blocked.
3. **Approval gates**: Do not install or upgrade dependencies, rotate or fetch live secrets, modify live hosting/GitHub repository settings, alter CI/deployment workflows unless explicitly requested, or commit, push, or deploy without explicit user approval.
4. Never claim live response headers, storage bucket rules, webhook verification, or hosted secret scanning are active unless directly verified.

## 6. Deliver findings and handoff

Report concisely in this order:

1. Scope audited/remediated and execution mode (Audit vs. Remediation).
2. Findings ranked by severity (`Critical`, `High`, `Medium`, `Low`) with exact file/line references, exploit or failure scenario, and concrete fix (or status if fixed in Mode B).
3. Files modified and regression tests added (Mode B).
4. Exact commands executed and observed results.
5. Unverified runtime/host controls and recommended follow-up.

## Skill boundaries

- Use **this skill** (`audit-security`) to audit or harden application trust boundaries, auth/session enforcement, input/URL/file validation, storage/redaction hygiene, response headers, and CI/CD workflow permissions.
- Use `triage-dependabot` for GitHub Dependabot alerts, `npm audit` findings, transitive dependency overrides, and lockfile remediation.
- Use `audit-performance` for production bundle, rendering, complexity, virtualization, and Core Web Vitals audits or optimizations.
- Use `audit-accessibility` for WCAG 2.2, semantic HTML, keyboard/focus, ARIA, contrast, and reduced-motion audits or remediation.
- Use `verify-release` for pre-release CI parity and deployment routing/release checks.
- Use `enhance-feature` for routine feature or component improvements without security-policy changes.
- Use `refactor-architecture` for behavior-preserving structural, ownership, or layering refactors.
- Use `create-feature` for building new capabilities.
- Use `sync-docs` when documentation needs synchronization after verified changes.
