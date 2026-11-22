# Security

Use least privilege and deny access by default. Apply these guidelines as target security standards for new and hardened operations; verify current source files and deployed hosts directly before reporting any control as active. Treat browser input, external API data, uploaded files, URLs, query parameters, and forwarded headers as untrusted. Verify each protected operation at both the backend BFF (`apps/api/`) and database (`supabase/` RLS/RPC) boundaries, and layer private storage, safe rendering, and deployment controls around that check. [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

| Concern            | Frontend responsibility (`apps/web/`)                        | Server or hosting responsibility (`apps/api/` & `supabase/`)             |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Session and access | Show session state, guide navigation, clear caches on `401`  | Verify JWTs and active role/allowlist membership, enforce PostgreSQL RLS |
| Data and files     | Render safe text, validate for usability, minimize retention | Validate Zod schemas & decoded image bytes, scope writes, bound limits   |
| Requests           | Send `X-Requested-With: fetch` and same-origin credentials   | Enforce CSRF (`Origin`/`Referer`), rate limits, and auth middleware      |
| Secrets and errors | Use public `VITE_*` config and safe UI messages              | Hold Supabase keys, redact diagnostics, return RFC 9457 Problem Details  |
| Browser policies   | Use approved destinations, sources, and embed permissions    | Serve HTTPS and applicable security, framing, and `no-store` headers     |

Static Vite client builds (`apps/web/dist/`) deliver public client bundles; all secret-bearing credentials (`SUPABASE_SERVICE_ROLE_KEY`, signing secrets) and private data access belong strictly in the server runtime (`apps/api/`) and `supabase/`. Document app-specific threat models, session lifetimes, and storage policies in `README.md`. See [Architecture](architecture.md#application-layers-and-dependency-rules), [Database and storage](database-and-storage.md), and [Feature structure](feature-structure.md#boundaries-and-public-apis).

## Authentication and authorization

- **Verify identity and authorization on every protected route and at the database layer.** Frontend route guards, client validation, and `VITE_*` navigation visibility flags guide UX only. In the backend BFF, verify the caller's session via Supabase Auth AND confirm active role/allowlist membership before executing privileged operations. Forward the caller's JWT (`Authorization: Bearer <accessToken>`) so PostgreSQL RLS policies independently enforce authorization at the database layer.
- **Same-origin BFF session cookies:** Issue `HttpOnly`, `SameSite=Lax`, narrowly scoped session cookies (for example, `Path=/api`, `COOKIE_SECURE=true` in HTTPS production, configurable `COOKIE_DOMAIN`). Bound refresh lifetimes, use single-flight refresh-token deduplication to prevent parallel requests from racing on rotated tokens, and clear cookies on failed validation or logout. [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- **CSRF defense on cookie-authenticated routes:** Enforce both an explicit custom header check (such as `X-Requested-With: fetch`) and strict `Origin` (or `Referer` fallback) matching against the configured app origin (`APP_ORIGIN`) on all mutating HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`), keeping `GET`/`HEAD` strictly read-only. [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- **Opaque guest capability tokens:** When issuing opaque capability tokens for unauthenticated resource lookups, transmit them via an explicit request header rather than navigable URLs, persist only a cryptographic hash (`SHA-256`) in PostgreSQL, and compare via a `SECURITY DEFINER` lookup returning `404` on mismatch. Derive tokens with a dedicated server secret (or HKDF-derived domain-separated key) rather than feeding database root credentials directly into client-controlled HMAC inputs.
- **Least-privilege `SUPABASE_SERVICE_ROLE_KEY` usage:** Restrict the service-role client strictly to health checks, server-side allowlist lookups, and least-privilege `SECURITY DEFINER` RPCs whose `EXECUTE` privileges are revoked from `public`, `anon`, and `authenticated`. Never use the service-role client to bypass user RLS on standard admin CRUD routes.
- **Rate limiting and proxy header trust:** Apply sliding-window rate limits (`429` + `Retry-After`) to sensitive unauthenticated endpoints (login, account mutations, and public submission endpoints). Only trust `X-Forwarded-For` / `X-Real-IP` when running behind an explicit trusted reverse proxy (otherwise an attacker can spoof arbitrary `X-Forwarded-For` headers to bypass IP limits), cap or evict expired rate-limiter buckets to prevent unbounded memory growth, and pair IP limits with per-account throttling on login.
- **Client `401` / `403` / `404` behavior:** On `401`, cancel protected queries, remove private query cache entries, reset session state, and prompt for sign-in. Handle `403` without retrying under unchanged permissions, and preserve `404` for undisclosed resources. See [API design](api-design.md#runtime-validation-and-errors).

## XSS prevention and input validation

Render external strings as JSX text. Keep untrusted data out of raw HTML sinks, inline script, and dynamic JavaScript evaluation. If a feature genuinely needs rich HTML, use a maintained sanitizer with a narrow allowlist before rendering. Validate each URL's scheme (such as allowing relative single-`/` paths or `https:` URLs without embedded `username`/`password`) and, when its purpose has known destinations, its exact origin. [React DOM](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html), [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Scripting_Prevention_Cheat_Sheet.html).

```tsx
type ResourceLinkProps = {
  destination: unknown;
  label: string;
  allowedOrigins: ReadonlySet<string>;
};

export function ResourceLink({ destination, label, allowedOrigins }: ResourceLinkProps) {
  if (typeof destination !== 'string') return <span>{label}</span>;

  let url: URL;
  try {
    url = new URL(destination);
  } catch {
    return <span>{label}</span>;
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !allowedOrigins.has(url.origin)
  ) {
    return <span>{label}</span>;
  }

  return (
    <a href={url.href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}
```

Use controlled destinations for internal redirects, and sanitized targets with URL-encoded fields for `mailto:`, `sms:`, and `tel:` links.

- **Server-side schema and upload validation:** Validate request payloads with shared Zod v4 `z.strictObject(...)` schemas (`packages/contracts/src/`) on every Hono write route. For file uploads, enforce byte-size bounds at the request body limit before buffering, validate decoded headers/dimensions and re-encode safely on the server, and enforce Storage bucket MIME/size limits plus role-scoped RLS on `storage.objects`. See [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) and [Database and storage](database-and-storage.md#storage-buckets-and-media-lifecycle).

## API communication, private storage, and browser storage

- Require HTTPS in production (`COOKIE_SECURE=true` and an `https://` configured app origin). Send credentials only to same-origin or allowlisted endpoints, reject unexpected redirects (`redirect: 'error'`), and keep tokens out of navigable URLs, router state, and query keys.
- Keep user-sensitive objects in non-public buckets and treat short-lived signed storage URLs as bearer capabilities: validate the exact approved HTTPS origin and expected path before transferring bytes, and send those requests with `credentials: 'omit'` and `referrerPolicy: 'no-referrer'` without app bearer headers (whereas non-sensitive static assets use explicit public-read bucket policies per [Database and storage](database-and-storage.md#storage-buckets-and-media-lifecycle)). Send `Cache-Control: no-store` and `Pragma: no-cache` on private JSON/session responses. See [API design](api-design.md#authentication-and-security).
- Configure CORS (or prefer same-origin proxy routing) strictly for required origins, methods, and headers; the server still authorizes every protected request.
- Use `localStorage` only for non-sensitive preferences or non-sensitive draft references (such as theme or versioned draft item IDs) and `sessionStorage` only for non-sensitive tab UI flags (such as single-retry preload guards). Keep credentials, capability tokens, private documents, and personal data out of Web Storage, IndexedDB, and persistent caches; purge legacy mixed-PII storage keys on migration.
- On logout, expiry (`401`), or account changes, abort in-flight requests, release object URLs, cancel/remove private TanStack Query caches, and clear drafts before rendering another session. See [State management](state-management.md#persistence-and-session-boundaries).

## Secrets and deployment

- Treat all client-delivered values, static assets, bundles, source maps, and `VITE_*` variables as public. Public client UI visibility flags (`VITE_*`) are UX conveniences only—never access control.
- Keep `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, cookie domain/security flags, and signing secrets strictly in server runtime environment variables documented (without secret values) in `.env.example`. Keep local `.env` / `.env.local` files gitignored, verify release builds against unintended local overrides, and keep CI builds and tests runnable without live credentials.
- Separate deterministic production-safe baseline seeds from local-only developer credential seeds under `supabase/seeds/`, and never apply local development passwords to staging or production databases.

See [Architecture](architecture.md#release-workflow) for release permissions and `README.md` for app-specific environment setup.

## Security headers and third-party integrations

Configure and verify security headers against both the BFF and the live serving host before reporting them as active:

| Control                 | What to configure and verify                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API security headers    | Deliver `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and `Cache-Control: no-store` + `Pragma: no-cache` on private API prefixes via the security-headers middleware. |
| Content Security Policy | Limit script, style, image, and third-party tile, embed, or CDN origins on the serving host. Trial a report-only policy first where supported.                                                                                          |
| Clickjacking            | Deliver CSP `frame-ancestors` as a response header alongside `X-Frame-Options: DENY`.                                                                                                                                                   |
| Transport security      | Enforce HTTPS (`COOKIE_SECURE=true`) and enable HSTS on hosts with stable HTTPS after verifying subdomain scope.                                                                                                                        |

Review external scripts, SDKs, third-party embeds or tile providers, and frames for ownership and minimal permissions. Apply `rel="noopener noreferrer"` on new-tab external links. See [OWASP HTTP Headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html) and [OWASP HTML5 Security](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html).

## Errors and logging

Return RFC 9457 Problem Details with actionable UI messages or a safe generic `500` fallback for unexpected errors. Keep stack traces, Supabase/auth provider responses, request headers, cookies, bearer tokens, signed URLs, and private payloads out of logs, diagnostics, and browser console output. Allowlist safe fields such as operation name, HTTP status, error code, and the server-generated or sanitized `X-Request-Id`. [OWASP Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).

## Dependency and CI security

- Use npm with a single root `package-lock.json`. Review publisher, maintenance, install scripts, and reachability before adding dependencies (especially native addons such as `sharp`), and triage advisories rather than running `npm audit fix --force` blindly. See [Coding standards](coding-standards.md#dependencies-and-review) and [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/).
- [CI](../.github/workflows/ci.yml) uses least-privilege `contents: read`, `persist-credentials: false`, and full commit SHA pinning on third-party actions.
- See [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use).

## Dependency overrides

When a transitive dependency has an active security advisory and a patched version exists that a parent range blocks, prefer a tightly scoped entry in root [package.json](../package.json) `overrides` rather than forcing a SemVer-major toolchain downgrade:

- Scope each override to the blocking direct parent package when possible; use a top-level override only when unrelated parents share the same safe patched SemVer line.
- Record the advisory identifier (GHSA/CVE) and removal condition in the commit or PR.
- Verify changes with `npm audit --json --offline=false` and full checks (`lint`, `format:check`, `typecheck`, `test`, `build`).

## Security verification

- Use colocated Vitest tests across `apps/api/src/`, `apps/web/src/`, and `packages/contracts/src/` for CSRF enforcement, rate limits, auth/session cookies, single-flight refresh, capability token isolation, image upload validation, safe URL filtering, and session teardown. See [Testing strategy](testing-strategy.md).
- Verify PostgreSQL RLS (`npm run db:reset`, `npm run db:lint`) and deployed host response headers, TLS/cookie flags, and proxy trust independently of React navigation—reporting unverified live-host checks honestly.

## Security anti-patterns

- Treating React route guards, client validation, `VITE_*` UI visibility toggles, or CORS as proof of authorization.
- Using `SUPABASE_SERVICE_ROLE_KEY` for routine admin CRUD queries or as a direct HMAC key for untrusted client inputs.
- Trusting spoofable `X-Forwarded-For` headers without an upstream reverse proxy boundary or running `DELETE + INSERT` resets across foreign-keyed tables.
- Rendering unsanitized HTML, evaluating external strings, or using unchecked payload URLs for navigation or credentialed requests.
- Persisting tokens or personal data in Web Storage, or forwarding raw errors, cookies, or private payloads to logs.
- Adding unreviewed packages or scripts, applying local-only credential seeds outside local dev, or broadening host permissions to work around configuration problems.
