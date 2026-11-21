# Security Audit Checklist & Verification

Use this reference alongside `docs/security.md` when auditing or hardening applications, hosting configs, and CI workflows.

## 1. Severity classification

| Severity | Criteria                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Critical | Direct compromise of credentials, unauthorized access to private data/actions, arbitrary script/code execution, or leaked keys. |
| High     | Missing server-side ownership/expiry checks, token leakage into storage/URLs/logs, unvalidated signed-URL transfers, open XSS.  |
| Medium   | Missing `Cache-Control: no-store` on private responses, incomplete session teardown, unpinned CI actions, overly broad CORS.    |
| Low      | Defense-in-depth gaps, missing regression tests for existing guards, or documentation drift on threat-model/header checklists.  |

## 2. Boundary-by-boundary inspection checks

### XSS, untrusted inputs, URLs, and file uploads

- Untrusted strings render as JSX text; no unguarded `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function`.
- External API responses, hydrated Web Storage (`localStorage`/`sessionStorage`) payloads, query strings, realtime payloads, `postMessage` events, and form/action inputs are parsed from `unknown` with Zod or narrow type guards.
- Dynamic external URLs parse via `new URL(...)`, require `https:` (no `javascript:`, `data:`, or embedded `username`/`password`), and check exact `url.origin` against an allowlist when destinations are known; URI-scheme links (`mailto:`, `sms:`, `tel:`) sanitize recipient targets (rejecting control characters or injected parameters) and URL-encode query/body fields.
- `target="_blank"` external links include `rel="noopener noreferrer"`; `postMessage` validates `event.origin`, `event.source`, and payload schema.
- File uploads validate size, format/headers, ownership, and workflow state on the server (never relying solely on client `accept` attributes).

### Credentials, storage transfers, and browser storage

- App bearer tokens are sent only to intended same-origin or allowlisted endpoints, never attached to redirects or third-party hosts, and never placed in navigable URLs, router state, or query keys.
- Signed storage URLs are validated for expected HTTPS origin and path and fetched with `credentials: 'omit'` and `referrerPolicy: 'no-referrer'`.
- Private JSON/session responses send `Cache-Control: no-store`.
- `localStorage` holds only non-sensitive preferences (such as theme or language); `sessionStorage` holds only non-sensitive tab UI state. Credentials, private documents, and sensitive responses stay out of Web Storage, IndexedDB, and persistent caches.
- Logout, expiry, or account switching aborts in-flight requests, revokes object URLs, and clears private caches, forms, and drafts.

### Secrets, client exposure, and redacted diagnostics

- Static Vite bundles `VITE_*` variables contain no secrets or private tokens. Client-side UI visibility flags (such as hiding an admin nav link) are UX conveniences only—never access control—and must not be relied upon to guard routes or mutations.
- Server credentials and public feature flags are documented (without secret values) in `.env.example`; local `.env.local` files remain gitignored, builds/tests run without live credentials, and release builds are checked against unintended `.env.local` overrides.
- Console logs, server diagnostics, background job event payloads, and UI errors use an allowlist of safe fields (operation, status, category, opaque correlation ID) and omit cookies, auth headers, signed URLs, raw bodies, filenames, and private contents.

### Hosting headers and CI/CD workflows

- Inspect framework configs for unintended open redirects, overly permissive rewrites/CORS, or missing header policy. Always mark deployed response headers (CSP, HSTS, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) as unverified unless checked against the live host.
- Inspect `.github/workflows/*.yml`:
  - Top-level and job-level `permissions:` follow least privilege (`contents: read` by default; elevated scopes only on the specific deploy job).
  - Third-party actions are pinned to verified full commit SHAs rather than mutable tags.
  - `actions/checkout` sets `persist-credentials: false` when git push is not required.
  - Release/deploy credentials stay out of untrusted PR workflows.

## 3. Useful read-only audit searches

Run from the repository root:

```sh
git grep -n "dangerouslySetInnerHTML\|innerHTML\|eval(" src
git grep -n "localStorage\|sessionStorage\|indexedDB" src
git grep -n "VITE_\|NEXT_PUBLIC_" src
git grep -n "uses:" .github/workflows
```

## 4. Verification command matrix

Run from the repository root. Use `npm.cmd` and `npx.cmd` on Windows PowerShell if `.ps1` launchers are blocked.

### Format changed files only (Mode B)

```sh
npx --no-install prettier --write <changed-files>
npx --no-install prettier --check <changed-files>
```

### Verification suite (Mode B)

```sh
npm run lint
npm run format:check
npm run test
npm run typecheck
npm run build
```

For npm dependency advisories or Dependabot alerts uncovered during an audit, switch to `triage-dependabot`.
