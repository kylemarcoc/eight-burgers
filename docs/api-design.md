# API design

Keep transport, external contracts, state coordination, and UI presentation with their respective owners. Apply these conventions to new and substantially changed operations. Document app-specific endpoints, envelopes, and realtime protocols in `README.md`.

## Ownership and file layout

| Location                        | Responsibility                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| Feature `api/`                  | Plain functions that build endpoint requests, validate and normalize responses, and map errors |
| Feature `hooks/`                | Query keys and lifecycle, mutations, and cache updates                                         |
| Feature `schemas/` and `types/` | Runtime schemas and TypeScript contracts                                                       |
| App-local `shared/lib/`         | Feature-independent HTTP configuration when multiple features share the same setup             |
| App and route layer             | Provider setup, page composition, and thin HTTP route adapters                                 |
| Components                      | Render pending, empty, failure, and success states and call typed handlers or hooks            |

Target layout for a growing feature:

```text
src/
├── features/users/
│   ├── api/
│   │   ├── get-users.ts
│   │   ├── create-user.ts
│   │   └── user-keys.ts
│   ├── hooks/
│   │   ├── useUsers.ts
│   │   └── useCreateUser.ts
│   ├── schemas/user.schema.ts
│   ├── types/user.types.ts
│   └── index.ts
└── shared/lib/http-client.ts
```

Use descriptive camelCase operation names such as `getUsers`, `updateUser`, and `deleteUser` in kebab-case files. Use `useSomething.ts` for Vite hooks. Export only externally supported operations, hooks, and types through the feature entry point. Use direct relative imports internally to avoid barrel chains and cycles. See [Architecture](architecture.md#imports-and-cross-feature-communication), [Feature structure](feature-structure.md#boundaries-and-public-apis), and [Coding standards](coding-standards.md#naming).

## HTTP clients and API functions

- Use browser `fetch` for HTTP requests unless the project adopts another client. Keep a single integration's configuration in its adapter. Extract a shared client helper only when multiple features share the same origin and policy. Avoid changing global defaults or adding automatic retries to every request.
- Use a fixed or validated public API base URL. Respect the app's configured deployment base path and keep private integration URLs or credentials strictly in server-only configuration. Treat `VITE_*` and `NEXT_PUBLIC_*` values as public. See [Architecture](architecture.md#routing-and-deployment) and [Security](security.md#secrets-and-deployment).
- Set `Accept` and `Content-Type` according to the endpoint and body. Attach bearer credentials only to the intended API origin. Enable cross-origin cookies only for a cookie-based API that explicitly supports them. Use a separate request with `credentials: 'omit'` and `referrerPolicy: 'no-referrer'` (and no app bearer token) for signed storage transfers.
- Type the request and domain result. Build the endpoint path, encode path segments, and serialize supported pagination, sorting, and filters in the adapter. Handle the actual success contract, including an empty body for a `204`. Check `response.ok` with `fetch` and translate transport rejections at the adapter boundary.
- Accept and forward an `AbortSignal` for cancellable reads. Pass it through each request in a chain. Treat a superseded or aborted result as cancellation and suppress stale UI updates. Aborting a browser request does not undo a committed write or cancel a queued job. Use operation-specific timeouts where there is a latency budget and distinguish deadlines from cancellation.

## Runtime validation and errors

Read external JSON as `unknown`. Validate required fields before mapping or using them, especially when a response controls a workflow or file transfer. Use a runtime schema library (such as Zod v4) for structured server boundaries and complex forms, and focused type guards for small contracts. With Zod v4, prefer `safeParse` at user and API boundaries to handle validation failures explicitly, use top-level format validators (`z.email()`, `z.uuid()`, `z.url()`), and keep default unknown-key stripping rather than `.passthrough()` on untrusted payloads. Validate at the trusted server entry point even if client-side checks guide the UI. See [Zod parsing](https://zod.dev/basics).

```ts
import { z } from 'zod';

const finalizedItemSchema = z.object({
  itemId: z.uuid(),
  filename: z.string().min(1),
  size: z.number().int().positive(),
});

type FinalizedItem = z.infer<typeof finalizedItemSchema>;

export function parseFinalizedItem(payload: unknown): FinalizedItem {
  return finalizedItemSchema.parse(payload);
}
```

Translate a thrown schema error to a response validation failure at the adapter boundary. Keep raw validation issues out of user-facing messages.

For new operations, normalize the failure where transport details are known:

```ts
type ApiFailure =
  | { kind: 'authentication' | 'authorization' | 'http'; status: number; retryAfterMs?: number }
  | { kind: 'validation'; source: 'request' | 'response'; status?: number }
  | { kind: 'network' | 'timeout' | 'cancelled' | 'unexpected' };
```

| Failure                                  | Handling                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Cancellation                             | Stop work or ignore its result. Skip error toasts and retries.                                                                                 |
| Network or timeout                       | Keep usable data or inputs. A safe read can use bounded backoff. A timed-out write may already have committed.                                 |
| `400` or `422` validation                | Show safe field or operation feedback when the endpoint identifies a validation failure. Retry after correcting the input.                     |
| `401` authentication                     | Handle missing or expired credentials in the owning session flow. Stop protected polling or fetching and prompt for a new session when needed. |
| `403` authorization                      | Show access denied or the endpoint's documented equivalent. Avoid retrying with unchanged permissions.                                         |
| `404` missing resource                   | Show the resource's missing state. Treat it as empty only when the endpoint explicitly defines that meaning.                                   |
| `409` conflict                           | Refresh or reconcile the current revision before retrying where the operation uses version checks.                                             |
| `429` or transient `5xx`                 | Honor `Retry-After` when present. Use bounded backoff only when the operation is safe to repeat. Keep other `5xx` failures visible.            |
| Malformed response or unexpected failure | Show a safe generic message. Record sanitized diagnostic context and avoid automatic retries for a contract error.                             |

Parse `Retry-After` as seconds or an HTTP date. Put retry policy at one layer to avoid multiplying attempts. Log safe operation names, status, or approved request identifiers. Keep raw error objects, headers, response bodies, bearer tokens, signed URLs, and private content out of user messages and logs. See [HTTP Retry-After semantics](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after).

## Queries and request lifetime

Prefer **TanStack Query v5** as the default for cached client-side queries when reading HTTP endpoints, keeping its query cache authoritative without mirroring responses into Zustand, Redux, or Context. In Redux-centric apps, **RTK Query** is a valid alternative. See [State management](state-management.md#server-state) for cache ownership.

- Use serializable keys such as `['users', 'list', { page, sort, search }]`, including every normalized input and a nonsecret scope for private data.
- Choose `staleTime` for freshness and `gcTime` for inactive retention. See [Query defaults](https://tanstack.com/query/v5/docs/framework/react/guides/important-defaults) and [query retries](https://tanstack.com/query/v5/docs/framework/react/guides/query-retries).
- Gate conditional reads with `enabled` or `skipToken`. Use `useInfiniteQuery` for cursor-based append. See [infinite queries](https://tanstack.com/query/v5/docs/framework/react/guides/infinite-queries).

```ts
import { useQuery } from '@tanstack/react-query';

type User = { id: number; name: string };
type UserFilters = { page: number; sort: 'name' | 'newest'; search: string };
const userListKey = ['users', 'list'] as const;

function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'number' &&
    'name' in value &&
    typeof value.name === 'string'
  );
}

export async function getUsers(
  baseUrl: string,
  filters: UserFilters,
  signal: AbortSignal,
): Promise<User[]> {
  const params = new URLSearchParams({
    page: String(filters.page),
    sort: filters.sort,
    search: filters.search,
  });
  const response = await fetch(`${baseUrl}/users?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`User request failed (${response.status}).`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data) || !data.every(isUser)) {
    throw new Error('The user list response is invalid.');
  }
  return data;
}

export function useUsers(baseUrl: string, filters: UserFilters) {
  return useQuery({
    queryKey: [...userListKey, filters],
    queryFn: ({ signal }) => getUsers(baseUrl, filters, signal),
    retry: false,
  });
}
```

## Mutations and concurrent writes

- Keep create, update, and delete requests in plain operations. Wrap client HTTP writes in `useMutation` when using TanStack Query, or call the Server Action or HTTP contract in Next.js apps.
- On success, use `setQueryData` for an exact record when the response is authoritative, and invalidate only affected list or detail keys when the server recalculates results. See [mutation invalidation](https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations).
- Disable duplicate submissions while a write is pending and preserve input on failure. Use server-side idempotency or revision checks where concurrent writes matter. See [optimistic updates](https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates).

## Authentication and security

Follow the owning application's session mechanism (documented in `README.md`). For protected operations, verify credentials, scope, and expiry on the server. Frontend access checks guide the UI; authorization belongs at each server entry point or the service it calls. See [Security](security.md#authentication-and-authorization) and [session state](state-management.md#persistence-and-session-boundaries).

## Testing

Colocate operation tests. Stub the remote boundary and assert endpoint inputs, normalized outputs, transport and HTTP failures, malformed data, and cancellation. Use a fresh `QueryClient` (with `retry: false` for non-retry scenarios) for TanStack Query tests. See [Testing strategy](testing-strategy.md).
