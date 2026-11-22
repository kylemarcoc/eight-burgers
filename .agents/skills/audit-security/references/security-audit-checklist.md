# Security Audit Checklist & Verification

Use this procedural checklist alongside `AGENTS.md` and repository security/database guides under `docs/` when present. Defer stack-specific implementation mechanics to those repository guides.

## 1. Severity classification

| Severity | Criteria                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Critical | Direct compromise of credentials, unauthorized access to private data/actions, arbitrary script/code execution, or leaked secret keys. |
| High     | Missing auth/access-control/CSRF enforcement, spoofable rate-limit bypasses, secret-key misuse, unvalidated uploads, or open XSS.      |
| Medium   | Missing `no-store` caching headers on private responses, incomplete session teardown, unpinned CI actions, or overly broad CORS.       |
| Low      | Defense-in-depth gaps, missing regression tests for existing guards, or documentation drift on threat-model/header checklists.         |

## 2. Boundary-by-boundary inspection checklist

### Client & browser boundaries (when present)

- Ensure untrusted strings render as escaped text; disallow unguarded raw HTML injection or dynamic script evaluation sinks.
- Ensure external API payloads, hydrated Web Storage entries, and URL query params pass through strict validation schemas or type guards before entering domain state.
- Validate dynamic URLs via strict parsing: allow only controlled internal single-`/` paths or `https:` without embedded credentials (and check expected origins where constrained); sanitize `mailto:`, `sms:`, and `tel:` targets and add `rel="noopener noreferrer"` on external new-tab links.
- Verify client bundles and public client-exposed env prefixes contain zero secrets or private keys, and ensure client UI visibility flags or route guards never act as security boundaries.
- Confirm build, type, and static-analysis boundaries keep server-only modules and credentials out of browser bundles.
- Verify persistent client storage holds only non-sensitive preferences or non-sensitive draft references (purging legacy sensitive keys on migration), and verify logout/`401` aborts requests, releases temporary blob URLs, and clears private caches and drafts.

### Backend API / server boundaries (when present)

- Confirm protected endpoints verify caller identity AND active role/allowlist membership server-side, propagating caller context to database authorization layers when applicable.
- Verify session cookies set `HttpOnly`, appropriate `SameSite`, narrow path/domain scope, and `Secure` in HTTPS production, with single-flight refresh-token rotation guards and complete clearing on logout or expiry.
- Verify state-changing HTTP routes enforce CSRF protections (e.g., strict `Origin`/`Referer` verification plus anti-CSRF request headers or tokens appropriate to the auth transport).
- Inspect rate limiters: confirm proxy forwarding headers (`X-Forwarded-For`, `X-Real-IP`) are trusted only behind an explicit trusted proxy boundary, expired buckets are bounded or evicted cleanly, and login endpoints combine IP limits with per-account throttling.
- Verify opaque guest/public capability tokens travel via headers (never navigable URLs), store only one-way cryptographic hashes in persistence, and derive from a dedicated domain-separated server secret rather than database root keys.
- Confirm write routes validate schemas strictly (rejecting unexpected fields) and binary uploads enforce pre-decode byte limits, media header/dimension bounds, safe re-encoding, and metadata stripping.
- Verify security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Cache-Control: no-store` on private endpoints) and confirm logs and error responses redact stack traces, raw provider/DB errors, cookies, and tokens.

### Database & object storage boundaries (when present)

- Verify every public table enforces database-level access policies (e.g., RLS), keeping private records and allowlists inaccessible to anonymous roles.
- Confirm elevated/service credentials stay limited to readiness checks, allowlist verification, or least-privilege elevated database functions—never used as a blanket bypass for standard user/admin CRUD.
- Confirm elevated database functions pin `search_path`, schema-qualify all references, and revoke public/unprivileged execute rights.
- Confirm object buckets enforce size/MIME allowlists, object access rules, private signed-URL flows for sensitive objects, and complete reference checks across all stored URL forms before object deletion.
- Verify local-only developer credential seeds carry clear local-only markers and stay excluded from staging/production pipelines.

### CI/CD & hosting (when present)

- Confirm environment example files omit secret values, local secret files remain ignored by version control, and CI runs cleanly without live credentials.
- Inspect CI workflow definitions for least-privilege token permissions, disabled credential persistence where unneeded, and immutable commit-pinned third-party actions.
- Keep live-host CSP, HSTS, TLS, and proxy headers marked **unverified** unless tested directly against the deployed host.

## 3. Conceptual read-only audit searches

Using the repository's discovered source, DB, and CI directories, search for:

- Unsafe HTML/script evaluation sinks (`innerHTML`, raw HTML binding helpers, dynamic `eval`).
- Client storage APIs (`localStorage`, `sessionStorage`, `indexedDB`) storing sensitive fields or unvalidated reads.
- Public env prefixes and privileged service/root key references across client vs. server code.
- Third-party CI workflow action pins and workflow `permissions` blocks.
- Database access-control policies, elevated function definitions, and dev-only credential seeds.

## 4. Verification steps (Mode B)

1. Format modified files using the repository's configured formatter.
2. Run the repository's configured lint, format-check, test, type-check, and build suite via the project's runner.
3. If database schemas, access policies, or storage policies changed and local DB services are active, run the repository's configured local database reset and lint checks.
4. For dependency vulnerability scanner findings or Dependabot alerts, hand off to `triage-dependabot`.
