---
name: audit-security
description: >-
  Audit and remediate application, API/BFF, browser-storage, auth/session,
  input/URL/upload validation, security header, and CI/deployment security
  issues against repository security guides. Use when reviewing or hardening
  trust boundaries, CSRF, rate limiting, XSS/URL handling, secret/log
  redaction, security headers, or CI workflows; not for dedicated database
  schema/RLS/migration authoring (use manage-database), dependency advisories or
  Dependabot alerts (use triage-dependabot), or routine feature work (use
  create-feature / enhance-feature).
---

# Audit Security

Systematically audit or harden application trust boundaries across client/frontend code (when present), shared contracts (when present), backend APIs (when present), database/storage boundaries (when present), and CI/deployment configuration. Treat client input, external API payloads, uploaded files, URLs, forwarded headers, and client bundles as untrusted; separate verified source/config findings from unverified live-host controls.

## 1. Establish mode and scope

1. Read `AGENTS.md` (when present) and inspect project manifests, framework configs, linter configs, environment templates, CI workflow definitions, and any backend/database security configs present in the repository.
2. Consult security, database/storage, API, and architecture guides under `docs/` when present.
3. Determine the execution mode:
   - **Mode A — Security Audit (read-only default):** Inspect source and config without modifying files and deliver severity-ranked, file-backed findings.
   - **Mode B — Targeted Remediation:** Scope exact files, trust boundaries, and regression tests before editing.
4. Preserve unrelated working behavior and public contracts unless a security fix explicitly requires changing an auth, error, storage, or header contract.

## 2. Load the security checklist

Load [Security audit checklist](./references/security-audit-checklist.md) for severity classification, trust-boundary inspection criteria, search targets, and verification steps.

## 3. Audit by trust boundary

Inspect only the surfaces present in the repository and relevant to the target scope using [Security audit checklist](./references/security-audit-checklist.md):

1. **Client & browser boundaries (when present):** DOM/HTML/script sinks, untrusted input parsing before domain use, client bundle/public env exposure, Web Storage/cache hygiene, and auth-expiry session teardown.
2. **Backend API / server boundaries (when present):** Server-side session and role/allowlist verification with downstream caller privilege propagation, session cookie attributes and refresh-token race protection, CSRF defenses on mutating endpoints, rate-limiting and reverse-proxy header trust, opaque capability-token hashing and secret separation, strict payload/upload validation, security response headers, and log/error redaction.
3. **Database & object storage boundaries (when present):** Table/bucket access control (RLS or equivalent), least-privilege server/service credentials, elevated function hardening, upload limits, and local-only dev credential isolation. Escalate dedicated schema, migration, or access-policy redesign to `manage-database`.
4. **CI/CD & hosting (when present):** Workflow least-privilege permissions, pinned third-party actions, offline CI execution without live secrets, and honest separation of unverified live-host CSP/HSTS/TLS/headers.

## 4. Remediate safely (Mode B only)

1. Apply the smallest, clearest fix that closes the vulnerability at the authoritative trust boundary.
2. Add or tighten colocated regression tests proving the security invariant (CSRF rejection, rate limiting, auth/role denial, capability token isolation, upload bounds, safe URL filtering, and session teardown).
3. Update repository security documentation only if a documented threat model, session lifetime, or storage policy changed and the repository maintains those docs.

## 5. Validate within repository guardrails

1. For **Mode B**, inspect the diff to confirm only intended files changed and format changed files using the repository's configured formatter.
2. Run the repository's configured static analysis, formatting, test, type-check, build, and (when schemas/policies changed and local tooling is running) database validation commands.
3. **Approval gates:** Do not install or upgrade dependencies, rotate or fetch live secrets, push remote migrations, modify live hosting/repository settings, alter CI/deployment workflows unless explicitly requested, or commit, push, or deploy without explicit user approval.
4. Never claim live response headers, hosted storage rules, or remote database policies are active unless directly verified.

## 6. Deliver findings and handoff

Report concisely in this order:

1. Scope audited/remediated and execution mode (Audit vs. Remediation).
2. Findings ranked by severity (`Critical`, `High`, `Medium`, `Low`) with exact file/line references, exploit or failure scenario, and concrete fix (or applied status in Mode B).
3. Files modified and regression tests added (Mode B).
4. Exact commands executed and observed results.
5. Unverified runtime/host controls and recommended follow-up.

## Skill boundaries

- Use **this skill** (`audit-security`) to audit or harden application trust boundaries, auth/session/CSRF/rate-limit enforcement, input/URL/file validation, storage/redaction hygiene, response headers, and CI workflow permissions.
- Use `manage-database` for dedicated database schema, migration, access-control/RLS, database function, and storage-bucket design or authoring.
- Use `triage-dependabot` for dependency security advisories, vulnerability scanner findings, transitive overrides, and lockfile remediation.
- Use `audit-performance` for production bundle, rendering, complexity, DB roundtrips, and Core Web Vitals audits or optimizations.
- Use `audit-accessibility` for WCAG 2.2, keyboard/focus, ARIA, contrast, and reduced-motion audits or remediation.
- Use `verify-release` for pre-release CI parity and deployment routing/release checks.
- Use `enhance-feature` for routine feature or component improvements without security-policy changes.
- Use `refactor-architecture` for behavior-preserving structural, ownership, or layering refactors.
- Use `create-feature` for building net-new capabilities.
- Use `sync-docs` when documentation needs synchronization after verified changes.
