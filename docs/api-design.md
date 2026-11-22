# API design

Keep transport, external contracts, state coordination, HTTP middleware, and UI presentation with their respective owners. Frontend HTTP and TanStack Query conventions apply to every SPA on this stack; `apps/api/` and `packages/contracts/` sections apply when a BFF and shared contracts workspace are configured. Apply these conventions to new and substantially changed operations, and document repository-specific routes, ports, env vars, and error codes in [AGENTS.md](../AGENTS.md) and [README.md](../README.md).

## Ownership and file layout

See [Architecture](architecture.md#stack-layering) for top-level workspace boundaries. Transport responsibilities split across the active layers as follows:

- **Shared contracts (`packages/contracts/src/*.schema.ts`):** Shared Zod v4 request, response, error, and domain schemas plus pure cross-tier helpers.
- **Shared browser HTTP (`apps/web/src/shared/lib/`):** Shared `fetch` wrapper (anti-CSRF header, timeout, `AbortSignal`, `Retry-After`, and failure normalization).
- **Feature API & hooks (`apps/web/src/features/<feature>/{api,hooks}/`):** Feature request builders, TanStack Query key factories, and `useQuery`/`useMutation` hooks.
- **BFF routes, middleware, and gateways (`apps/api/src/{routes,middleware,lib}/`):** Thin Hono route handlers, cross-cutting HTTP middleware (request IDs, security headers, CSRF, auth guards), data gateway adapters, cookies/refresh, rate limiting, RFC 9457 error formatting, and media processing.

Illustrative layout across workspaces:

```text
packages/contracts/src/
├── error.schema.ts
├── <domain>.schema.ts
└── index.ts

apps/web/src/
├── features/<feature>/
│   ├── api/<resource>-api.ts
│   ├── hooks/<useFeatureHook>.ts
│   └── index.ts
└── shared/lib/
    ├── api-error.ts
    └── http-client.ts

apps/api/src/
├── app.ts
├── config/env.ts
├── middleware/    # request IDs, security headers, CSRF, auth guards
├── routes/        # thin domain route handlers + health probes
└── lib/           # Problem Details formatting, cookies/refresh, rate limiting, media processing, data gateway
```

Use descriptive camelCase operation names in kebab-case files under `api/` (for example, `fetchRecords` or `createSubmission`). Use `useSomething.ts` for frontend hooks. Export only externally supported operations, hooks, and types through the feature `index.ts` or workspace entry point. See [Architecture](architecture.md#imports-and-cross-feature-communication), [Feature structure](feature-structure.md#boundaries-and-public-apis), and [Coding standards](coding-standards.md#naming).

## HTTP clients and API functions

- **Shared browser HTTP client (`apps/web/src/shared/lib/http-client.ts`):** Route feature requests through the shared browser `fetch` helper targeting a validated public API base URL env var (for example, `VITE_API_BASE_URL` defaulting to same-origin `/api/v1`). Send `Accept: application/json`, the configured anti-CSRF header (such as `X-Requested-With: fetch`), `credentials: 'same-origin'`, and `redirect: 'error'`. Leave `Content-Type` unset when passing `FormData` so the browser generates the multipart boundary automatically.
- **Timeouts and cancellation:** Combine an operation-specific timeout (`AbortController` + `timeoutMs`, longer for binary uploads) with any caller-supplied `AbortSignal` so external cancellations (`cancelled`) stay distinct from deadlines (`timeout`). Pass `signal` through every query read (`queryFn: ({ signal }) => ...`). Aborting a browser request does not undo an already committed server write.
- **Proxy and external transfers:** Use Vite's dev proxy for configured same-origin API, health, and storage prefixes (such as `/api`, `/healthz`, `/readyz`, `/storage` — see [AGENTS.md](../AGENTS.md) and [README.md](../README.md)) during local development, and use `credentials: 'omit'` with `referrerPolicy: 'no-referrer'` (and no app bearer token or cookies) if downloading from third-party signed storage URLs.
- **Hono BFF routes (`apps/api/src/routes/`):** Inject server dependencies (`config`, `gateway`, rate limiters, image processor) via `createApp(deps)` so routes remain pure, testable, and independent of global singletons. Parse `JSON` and `FormData` explicitly, validate query and body parameters with shared Zod schemas (`safeParse`), forward request-scoped errors cleanly, and map gateway domain statuses (`not_found`, `conflict`, unavailability, precondition/value drift, idempotency conflict, validation rules) to explicit HTTP status codes.

## Runtime validation and errors

Read external JSON as `unknown` on both client and server boundaries. Validate untrusted inputs and responses using shared Zod v4 schemas (`z.strictObject` on write requests to reject unknown properties, `safeParse` at HTTP boundaries, and top-level format validators `z.email()`, `z.uuid()`, `z.url()`). See [Zod parsing](https://zod.dev/basics).

Return structured **RFC 9457 Problem Details** (`Content-Type: application/problem+json; charset=utf-8`) from the BFF error helper:

```ts
type ProblemDetail = {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  requestId?: string;
  fieldErrors?: Record<string, string[]>;
};
```

Normalize client failures into a discriminated union in `apps/web/src/shared/lib/api-error.ts`:

```ts
type ApiFailure =
  | {
      kind: 'http';
      status: number;
      code: string;
      message: string;
      requestId?: string;
      fieldErrors?: Record<string, string[]>;
      retryAfterMs?: number;
      problem?: ProblemDetail;
    }
  | { kind: 'network'; message: string }
  | { kind: 'timeout'; message: string }
  | { kind: 'cancelled'; message: string }
  | { kind: 'validation'; message: string; issues: unknown };
```

| Failure                                  | Handling                                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Cancellation                             | Stop work or ignore its result. Skip error toasts and retries.                                                                      |
| Network or timeout                       | Keep usable data or inputs. Safe reads may retry with bounded backoff; check idempotent retry support before repeating writes.      |
| `400` or `422` validation / domain rule  | Surface safe `detail` and `fieldErrors` on the offending control. Retry only after correcting input.                                |
| `401` authentication                     | Cancel/remove protected session-scoped queries, reset session query data, and prompt for sign-in.                                   |
| `403` authorization / CSRF failure       | Show access denied or forbidden state without retrying under unchanged credentials or headers.                                      |
| `404` missing resource                   | Show the resource's missing state (or opaque `404` for invalid/unmatched capability tokens).                                        |
| `409` conflict / drift / idempotency     | Invalidate stale resource queries on version conflict or precondition/availability drift, or surface idempotency conflicts cleanly. |
| `413` / `415` media upload error         | Surface size or format limit guidance without mutating stored records.                                                              |
| `429` or transient `5xx`                 | Honor `Retry-After` (numeric seconds or HTTP date) in `QueryClient` backoff for safe reads; avoid unbounded automatic retries.      |
| Malformed response or unexpected failure | Show a safe generic message. Log sanitized `requestId`/status diagnostics without raw secrets, cookies, or stack traces.            |

## Queries and request lifetime

Use **TanStack Query v5** as the default for cached client-side queries, keeping its cache authoritative without mirroring responses into Zustand or Context. See [State management](state-management.md#server-state) for cache ownership.

- **Normalized query keys:** Group keys by domain and normalized filter parameters (e.g., `['records', 'infinite', { limit, status, range, sort, q }]`). Never embed credentials, cookies, or secret tokens in query keys.
- **Composite keyset pagination:** Prefer composite cursor pagination (such as `<createdAtIso>|<uuid>`) with `useInfiniteQuery` and matching composite database indexes over `OFFSET` pagination on growing tables. Pause `refetchInterval` background polling when the user has expanded beyond the first page (`pages.length > 1`) or when a polled entity reaches a terminal status.
- **Selective retries:** Configure `QueryClient` to retry only `network`, `timeout`, `429`, and `5xx` failures up to bounded attempts while honoring `Retry-After` headers, and set `retry: false` on mutations and auth checks.

## Mutations, concurrency, and binary uploads

- **Idempotency on creation writes:** Attach a per-attempt `Idempotency-Key` header on sensitive creation requests and store `(idempotency_key, payload_hash)` atomically in PostgreSQL (`409` conflict when a key is reused with a different canonical payload; safe replay when identical). Regenerate the client key whenever the user changes the submitted payload.
- **Optimistic concurrency control (`expectedVersion`):** Send the record's integer `version` in `PUT`/`PATCH` mutations and enforce `WHERE id = $id AND version = $expected_version` in the database trigger/update path, returning `409 Conflict` on stale writes and invalidating the query cache on the client.
- **Precondition and drift guards:** Pass expected totals, versions, or preconditions on transactional writes when user confirmation depends on prior displayed values so server-recomputed invariants or availability changes return an explicit `409` conflict rather than committing an unexpected state.
- **Server-mediated binary uploads:** Validate file size (`413`) and decoded media headers (`415` / `400`) in the BFF before normalizing and uploading to object storage, and clean up replaced or unreferenced blobs cleanly. See [Database and storage](database-and-storage.md#storage-buckets-and-media-lifecycle).

## Authentication and security

Follow the BFF cookie and RLS architecture documented in [Security](security.md#authentication-and-authorization) and [Database and storage](database-and-storage.md#row-level-security-rls-and-client-separation). Verify credentials, CSRF headers, `Origin`, and server-side allowlist/role membership on the server for every protected endpoint, and forward the verified JWT so PostgreSQL RLS enforces the same boundaries at the data layer.

## Testing

Colocate operation, route, and contract tests across the owning modules (such as browser HTTP client tests under `apps/web/src/shared/lib/`, BFF route/middleware tests under `apps/api/src/`, and schema/helper tests under `packages/contracts/src/`). Stub `globalThis.fetch` for browser HTTP tests and pass an in-memory backend gateway test double into `createApp(deps)` for Hono BFF tests. Assert request shapes, required security/idempotency/capability headers, RFC 9457 error normalization, `Retry-After` parsing, cancellation, concurrency conflicts (`409`), and Zod validation failures. Use a fresh `QueryClient` (`retry: false` for non-retry scenarios) in TanStack Query component and hook tests. See [Testing strategy](testing-strategy.md).
