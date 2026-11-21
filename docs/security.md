# Security

Use least privilege and deny access by default. Treat browser input, external API data, files, URLs, and events as untrusted. Verify each protected operation where the data is read or changed, and layer private storage, safe rendering, and deployment controls around that check. [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

| Concern            | Frontend responsibility                                      | Server or hosting responsibility                                     |
| ------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Session and access | Show the current session state, guide navigation, clear data | Verify credentials and expiry, enforce resource ownership            |
| Data and files     | Render safe text, validate for usability, minimize retention | Validate inputs and files, scope reads and writes, limit exposure    |
| Requests           | Send credentials only to their intended endpoint             | Enforce permissions, set CORS and CSRF policy, limit costly requests |
| Secrets and errors | Use public configuration and safe UI messages                | Hold credentials, redact diagnostics, return safe error contracts    |
| Browser policies   | Use approved destinations, sources, and embed permissions    | Serve HTTPS and applicable security and cache headers                |

Static Vite client builds deliver public client bundles; any secret-bearing integration or private data workflow belongs strictly on the server. Document app-specific threat models, session lifetimes, and storage policies in `README.md`. See [Architecture](architecture.md#application-layers-and-dependency-rules) and [Feature structure](feature-structure.md#boundaries-and-public-apis).

## Authentication and authorization

- Verify caller identity, session expiry, and resource ownership on the server at every protected endpoint before reading or mutating private data. Route guards, client validation, and hidden UI controls guide UX only.
- For **anonymous capability sessions**, hold opaque session bearer tokens in browser memory only, store only the token hash on the server, compare in constant time, enforce bounded idle expiry, and support explicit revocation/cleanup.
- For **same-origin account login**, prefer a server-issued `Secure`, `HttpOnly` cookie with narrow scope and an appropriate `SameSite` policy. Rotate the session on sign-in or privilege change, bound lifetimes, apply CSRF protection to cookie-authenticated writes, and keep safe HTTP methods read-only. [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- On `401`, stop protected work and prompt for a new session or sign-in. Handle `403` as access denied without retrying under unchanged permissions, and preserve `404` for undisclosed resources. See [API design](api-design.md#runtime-validation-and-errors).

## XSS prevention and input validation

Render external strings as JSX text. Keep untrusted data out of raw HTML sinks, inline script, and dynamic JavaScript evaluation. If a feature genuinely needs rich HTML, use a maintained sanitizer with a narrow allowlist before rendering. Validate each URL's scheme and, when its purpose has known destinations, its exact origin. [React DOM](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html), [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Scripting_Prevention_Cheat_Sheet.html).

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

Use controlled destinations for internal redirects and encoded fields for `mailto:`. Validate external responses from `unknown` using runtime schemas (such as Zod) or focused guards, and verify file size, content headers, ownership, and workflow state on the server rather than trusting browser `accept` hints. See [Coding standards](coding-standards.md#typescript), [API design](api-design.md#runtime-validation-and-errors), and [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## API communication, private storage, and browser storage

- Require HTTPS in production. Send bearer credentials only to intended same-origin or allowlisted endpoints, reject unexpected redirects on credentialed calls, and keep tokens out of navigable URLs, router state, and query keys.
- Treat short-lived signed storage URLs as bearer capabilities. Validate the exact approved HTTPS origin and expected path before transferring bytes, and send those requests with `credentials: 'omit'` and `referrerPolicy: 'no-referrer'` without app bearer tokens. Send `Cache-Control: no-store` on private JSON/session responses. See [API design](api-design.md#authentication-and-security).
- Configure CORS to permit only required origins, methods, and headers; the server still authorizes every protected request.
- Use `localStorage` only for non-sensitive preferences (such as theme or language) and `sessionStorage` only for non-sensitive tab UI state. Keep credentials, private documents, and sensitive responses out of Web Storage, IndexedDB, and persistent caches.
- On logout, expiry, or account changes, abort in-flight requests, release object URLs, and clear private caches, forms, and drafts before rendering another session. See [State management](state-management.md#persistence-and-session-boundaries).

## Secrets and deployment

- Treat all client-delivered values, static assets, bundles, source maps, `VITE_*`, `NEXT_PUBLIC_*` variables as public. Keep private keys, service-role keys, signing keys, and connection strings out of Git, client config, logs, and artifacts.
- Keep server credentials in runtime environment variables documented (without values) in `.env.example`, keep local `.env.local` files gitignored, and keep builds and tests runnable without live credentials.

See [Architecture](architecture.md#release-workflow) for release permissions and `README.md` for app-specific environment setup.

## Security headers and third-party integrations

Configure and verify security headers against the live serving host before reporting them as active:

| Control                   | What to configure and verify                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Content Security Policy   | Limit script and resource origins. Trial a report-only policy first where supported.                                                                                                 |
| Clickjacking              | Deliver CSP `frame-ancestors` as a response header. Allow only required frame parents. Use `X-Frame-Options` as a compatible fallback where appropriate.                             |
| Transport security        | Enforce HTTPS and use HSTS on hosts with stable HTTPS. Review any subdomain scope before enabling it.                                                                                |
| Browser data and features | Use `X-Content-Type-Options: nosniff` with correct MIME types, a restrictive `Referrer-Policy`, limited `Permissions-Policy`, and `Cache-Control: no-store` for sensitive responses. |

Review external scripts, SDKs, and frames for ownership and minimal permissions. For `postMessage`, specify an exact target origin and validate `event.origin`, `event.source`, and payload schema. Apply `rel="noopener noreferrer"` on new-tab external links. See [OWASP HTTP Headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html) and [OWASP HTML5 Security](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html).

## Errors and logging

Return actionable UI messages or a safe generic fallback for unexpected errors. Keep stack traces, provider responses, request objects, cookies, auth headers, signed URLs, filenames, and private payloads out of logs, diagnostics, and browser console output. Allowlist safe fields such as operation name, status, category, and an opaque correlation ID. [OWASP Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).

## Dependency and CI security

- Use npm and a single root `package-lock.json`. Review publisher, maintenance, install scripts, and reachability before adding dependencies, and triage advisories rather than running `npm audit fix --force` blindly. See [Coding standards](coding-standards.md#dependencies-and-review) and [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/).
- [CI](../.github/workflows/ci.yml) uses least-privilege `contents: read`, `persist-credentials: false`, and full commit SHA pinning on third-party actions.
- See [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use).

## Dependency overrides

When a transitive dependency has an active security advisory and a patched version exists that a parent range blocks, prefer a tightly scoped entry in root [package.json](../package.json) `overrides` rather than forcing a SemVer-major toolchain downgrade:

- Scope each override to the blocking direct parent package when possible; use a top-level override only when unrelated parents share the same safe patched SemVer line.
- Record the advisory identifier (GHSA/CVE) and removal condition in the commit or PR.
- Verify changes with `npm audit --json --offline=false` and full checks (`lint`, `format:check`, `typecheck`, `test`, `build`).

## Security verification

- Use colocated Vitest and React Testing Library tests for safe UI messages, malformed responses, untrusted links, and session teardown. See [Testing strategy](testing-strategy.md#frontend-validation).
- Verify backend access independently of React navigation—covering session ownership, expiry/revocation, restricted DB roles, credential isolation, and response headers against deployed hosts. See [Release checks](testing-strategy.md#release-checks).
- Enable host dependency review and secret scanning with push protection where supported.

## Security anti-patterns

- Treating route guards, client validation, submitted roles, or CORS as proof of authorization.
- Rendering unsanitized HTML, evaluating external strings, or using unchecked payload URLs for navigation or credentialed requests.
- Hardcoding secrets, persisting tokens in Web Storage, or forwarding raw errors or private payloads to logs.
- Adding unreviewed packages or scripts, ignoring applicable advisories, or broadening host permissions to work around configuration problems.
