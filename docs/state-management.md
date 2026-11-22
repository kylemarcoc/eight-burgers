# State management

Keep one authoritative owner for each piece of state. Use these patterns as **recommended defaults for this stack** (`useState`, `useReducer`, Context, TanStack Query v5, Zustand, Immer, and Zod v4). Start with the simplest effective solution closest to the consumer, prefer dependencies and patterns already installed in the project, and move state outward only when consumer distance, lifetime, persistence, performance, or maintainability requires it.

- **Separate state categories.** Keep server state, local UI state, shared client state, form state, and URL state in distinct owners instead of merging them into one global store.
- **Avoid duplicated sources of truth.** Compute derived values during render or in focused selectors. Avoid syncing TanStack Query data into Zustand, Context, or effects.
- **Scope state to its feature.** Keep feature state inside the owning feature unless cross-feature sharing is genuinely required.
- **Keep working code in place.** Apply these defaults to new and substantially changed code. Do not migrate working implementations solely to match this guide.

> **Installed vs. optional dependencies.** Inspect root and workspace `package.json` and `package-lock.json` before choosing a library. React 19 primitives, `@tanstack/react-query`, `zustand`, `immer`, and `zod` are the standard stack defaults; optional packages such as `react-hook-form`, `@hookform/resolvers`, or `@reduxjs/toolkit` should only be added when a concrete requirement justifies them and with explicit user approval.

## Choosing a state owner

| Approach                                             | Best fit                                                                                            | Avoid for / guardrails                                                               | Recommended placement                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Derived value                                        | Totals, filtered lists, and flags computed from authoritative state or props                        | Storing redundant copies in state or syncing via `useEffect`                         | Inline during render, pure helper, or selector                           |
| `useState`                                           | Simple component-local UI state: toggles, inputs, disclosures, modals                               | Multi-step state machines or interdependent transitions                              | Owning component or closest common parent                                |
| `useReducer`                                         | Complex local or feature-scoped state with multiple actions, transitions, or business rules         | Remote API caching or trivial single-boolean toggles                                 | Feature hook or colocated `*-reducer.ts` module                          |
| React 19 Actions (`useActionState`, `useOptimistic`) | Lightweight form submissions and local async transitions                                            | Caching remote reads (use TanStack Query) or complex multi-field schemas             | Owning form component or feature hook                                    |
| React Context                                        | Dependency injection and relatively stable subtree values (theme, locale, scoped `useReducer`)      | High-frequency client updates or acting as a server-state cache                      | `apps/web/src/app/providers/` or `apps/web/src/features/<feature>/`      |
| Zustand (+ `immer` / `persist`)                      | Shared client state across distant components or features when props and Context become cumbersome  | Duplicating server responses, committed URL params, or local-only UI state           | `features/<feature>/store/` by default; `shared/store/` if cross-feature |
| TanStack Query v5                                    | Default for client-side server state: fetching, caching, mutations, cursor pagination, invalidation | Pure UI toggles or duplicating cached data in Zustand                                | `features/<feature>/{api,hooks}/`; `apps/web/src/app/providers/`         |
| Form state (+ Zod contracts)                         | Local controlled form state or optional React Hook Form + Zod for multi-field schemas               | Mirroring server cache directly into persistent stores; never skip server validation | Owning component or `packages/contracts/src/`                            |
| URL search parameters                                | Shareable, bookmarkable state: search queries, filters, sorting, pagination                         | Sensitive data, secrets, or unsubmitted keystroke drafts                             | Route boundary (`useSearchParams`)                                       |

## Local and shared client state

- **`useState` first.** Use `useState` for simple, independent component-local UI state such as toggles, controlled inputs, and modal open flags. Lift state to the closest common parent when sibling components share a value.
- **`useReducer` for complex transitions.** Prefer `useReducer` when local or feature-scoped state involves multiple actions, interdependent fields, invariants, or transition rules worth unit-testing in isolation. Keep reducers pure and deterministic, use typed discriminated actions, and put network or storage side effects in the owning hook or adapter.
- **React Context for dependency injection and stable subtree values.** Use Context for low-frequency shared concerns such as theme (`ThemeProvider`) or injecting test/runtime adapters. Combine Context with `useReducer` when several descendants in a feature subtree need shared state and dispatch without prop drilling. Scope providers closely to their consumers and memoize provided values so unrelated updates do not re-render the subtree.
- **Zustand only when justified.** Introduce **Zustand** when client state must be shared across distant components or features, or survive route transitions, and props or Context would be unnecessarily cumbersome. Give actions descriptive names and typed inputs, keep transitions pure, and include an explicit `reset` action for session cleanup and test teardown. See the [Zustand TypeScript guide](https://zustand.docs.pmnd.rs/guides/typescript).

### Local UI state (`useState`)

Keep ephemeral disclosure or confirmation state with the component that renders it and derive secondary flags during render:

```tsx
import { useState } from 'react';

export function ClearSessionControl({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={() => setConfirmOpen(true)}>
        Clear session
      </button>
      {confirmOpen && (
        <button type="button" disabled={submitting} aria-busy={submitting} onClick={handleConfirm}>
          Confirm clear
        </button>
      )}
    </div>
  );
}
```

### Complex feature state (`useReducer`)

Use a pure reducer with discriminated actions when multiple events update related fields together:

```ts
export type SelectionState = {
  selectedIds: readonly string[];
  filter: 'all' | 'flagged';
};

export type SelectionAction =
  | { type: 'toggle_item'; id: string }
  | { type: 'filter_changed'; filter: SelectionState['filter'] }
  | { type: 'reset' };

export const initialSelectionState: SelectionState = {
  selectedIds: [],
  filter: 'all',
};

export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case 'toggle_item': {
      const exists = state.selectedIds.includes(action.id);
      return {
        ...state,
        selectedIds: exists
          ? state.selectedIds.filter((id) => id !== action.id)
          : [...state.selectedIds, action.id],
      };
    }
    case 'filter_changed':
      return { ...state, filter: action.filter };
    case 'reset':
      return initialSelectionState;
  }
}
```

### Async actions and optimistic updates (React 19)

For straightforward form submissions and local async transitions that do not require a TanStack Query mutation cache, prefer React 19 Actions (`useActionState`, `useFormStatus`, or async `startTransition`) over hand-rolled `isSubmitting` and `try/catch/finally` state machines. Pair `useOptimistic` with an Action or `startTransition` when immediate UI feedback helps and the optimistic value should reconcile automatically once settled. See [`useActionState`](https://react.dev/reference/react/useActionState) and [`useOptimistic`](https://react.dev/reference/react/useOptimistic).

```tsx
import { useActionState } from 'react';

type SaveResult = { error: string | null };

export function RenameControl({ onSave }: { onSave: (name: string) => Promise<SaveResult> }) {
  const [result, submitAction, isPending] = useActionState<SaveResult, FormData>(
    async (_previous, formData) => {
      const name = String(formData.get('name') ?? '').trim();
      if (!name) return { error: 'Enter a name.' };
      return onSave(name);
    },
    { error: null },
  );

  return (
    <form action={submitAction}>
      <input name="name" aria-invalid={Boolean(result.error)} />
      <button type="submit" disabled={isPending} aria-busy={isPending}>
        Save
      </button>
      {result.error && <p role="alert">{result.error}</p>}
    </form>
  );
}
```

### Shared client state and Zustand store placement

Follow the module boundaries enforced in [Oxlint](../.oxlintrc.json) when placing a Zustand store inside `apps/web/src/`:

| Ownership scope                                     | Recommended location                                            | Public access rule                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Feature-owned client state (default)                | `apps/web/src/features/<feature>/store/` (`useFiltersStore.ts`) | Export focused selector hooks and supported actions via `features/<feature>/index.ts`    |
| Genuinely cross-feature, feature-independent client | `apps/web/src/shared/store/` (`usePreferencesStore.ts`)         | Features may import `shared/`; keep `shared/` independent of `features/`, `app/`, routes |
| Composition-root wiring                             | `apps/web/src/app/providers/`                                   | Wired in `app/` or `routes/` and passed to features via providers, props, or callbacks   |

Because `.oxlintrc.json` forbids `features/` and `routes/` from importing `app/`, never place a Zustand store that features or routes import directly inside `app/`. See [Architecture](architecture.md#imports-and-cross-feature-communication) and [Feature structure](feature-structure.md#boundaries-and-public-apis).

```ts
import { create } from 'zustand';

type WorkspaceUiState = {
  selectedPanel: 'details' | 'history';
  sidebarOpen: boolean;
  setSelectedPanel: (panel: 'details' | 'history') => void;
  toggleSidebar: () => void;
  reset: () => void;
};

const initialState = {
  selectedPanel: 'details' as const,
  sidebarOpen: false,
};

export const useWorkspaceUiStore = create<WorkspaceUiState>()((set) => ({
  ...initialState,
  setSelectedPanel: (selectedPanel) => set({ selectedPanel }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  reset: () => set(initialState),
}));

export const useSidebarOpen = () => useWorkspaceUiStore((state) => state.sidebarOpen);
export const useSelectedPanel = () => useWorkspaceUiStore((state) => state.selectedPanel);
```

When combining Zustand with `immer` and `persist`, compose `persist(immer(...))`, keep ephemeral UI flags in local state or a separate non-persisted store (and `partialize` only durable slices), select individual actions (or a stable `actions` object) so action-only consumers do not re-render, validate/sanitize hydrated storage payloads from `unknown` in `merge` or custom `PersistStorage`, suppress storage writes during `reset()` in test teardown if appropriate, and handle storage quota or restricted-mode errors cleanly.

## Server state

Use **TanStack Query v5** as the default for cached client-side server state, API fetching, mutations, cursor pagination, and cache invalidation. Keep one authoritative cache for each remote resource, configured in `apps/web/src/app/providers/QueryProvider.tsx` (`query-client.ts`). See [API design](api-design.md) for transport and error contracts.

- **Keep server data in the query cache.** Avoid copying TanStack Query responses into Zustand, Context, or component state as a second source of truth.
- **Place server modules with their feature.** Put plain transport operations and shared query keys in `features/<feature>/api/`, query and mutation hooks in `features/<feature>/hooks/`, and `QueryClientProvider` setup in `apps/web/src/app/providers/`.
- **Use serializable, normalized query keys.** Group keys by feature and resource, followed by normalized inputs that affect the result (filters, sorting, range, limit). Give list, detail, and infinite results distinct keys (for example `['items', 'list', filters]` vs `['items', 'infinite', filters]`).
- **Tune freshness, retry policy, and retention per query.** Set explicit `staleTime` and `gcTime`, and retry only transient network/timeout/`429`/`5xx` failures while failing fast on validation, cancellation, `400`, `401`, `403`, `404`, and `409` responses. See [TanStack Query defaults](https://tanstack.com/query/v5/docs/framework/react/guides/important-defaults).
- **Gate conditional reads and paginate explicitly.** Use `enabled` or `skipToken` until prerequisites exist. Use `useInfiniteQuery` for keyset-cursor pagination (`getNextPageParam`), and pause automatic background `refetchInterval` polling when the user has loaded beyond the first page (`pages.length > 1`) or once a tracked record reaches a terminal state.
- **Handle optimistic concurrency (`409`) and session expiry (`401`) consistently in mutations and queries.** Pass `expectedVersion` when mutating versioned entities. On `409 Conflict`, invalidate the affected resource keys (`queryClient.invalidateQueries`) so the UI refreshes the latest server revision while preserving unsaved form input. On `401 Unauthorized`, cancel in-flight protected queries (`queryClient.cancelQueries`), clear protected query entries (`queryClient.removeQueries`), and reset the cached session query to the unauthenticated session state. See [API design](api-design.md#runtime-validation-and-errors) and [API design](api-design.md#mutations-concurrency-and-binary-uploads).

```ts
import { skipToken, useQuery } from '@tanstack/react-query';

type UserPage = { userIds: string[]; hasMore: boolean };
type LoadUserPage = (role: string, page: number, signal: AbortSignal) => Promise<UserPage>;

export function useUserPage(role: string | undefined, page: number, loadPage: LoadUserPage) {
  return useQuery({
    queryKey: ['users', 'list', { role, page }],
    queryFn: role === undefined ? skipToken : ({ signal }) => loadPage(role, page, signal),
  });
}
```

## Form state

Use local controlled state (`useState`) paired with shared Zod v4 contracts (`packages/contracts/src/`) — or adopt `react-hook-form` + `@hookform/resolvers` only if installed and justified for large multi-step forms. Keep field-level validation feedback accessible (`aria-invalid` + `aria-describedby`), preserve unsaved input on submission failures, protect against duplicate submits while pending, and always re-validate inputs server-side in `apps/api/` and PostgreSQL constraints.

## URL state

Prefer URL search parameters for shareable, bookmarkable state such as search queries, filters, sorting, and pagination. Validate parameters at the route boundary, provide safe defaults, and pass typed values to the feature. Update related parameters together and keep unsubmitted search drafts local.

Use React Router's `useSearchParams`, preferring the functional updater `setSearchParams((prev) => ...)` to preserve the configured `basename`. See [React Router search parameters](https://reactrouter.com/api/hooks/useSearchParams).

## Subscriptions and performance

Subscribe to the smallest useful value with a focused Zustand selector (using `useShallow` from `zustand/react/shallow` when deriving an object or array) or a TanStack Query `select` option. Avoid selectors that return fresh object references on every update. Keep fast-changing values out of broad Context providers. Profile before adding memoization or splitting providers. See [Performance](performance.md#rendering-and-assets).

## Persistence and session boundaries

Persist only non-sensitive values with a clear reload or cross-session need, such as theme preferences or non-sensitive draft references. Always validate and sanitize hydrated storage payloads from `unknown` and fall back cleanly when storage is unavailable or exceeds quota. Keep credentials, secrets, guest capability tokens, and personal data out of Web Storage and URLs; when retiring an older storage key that held mixed or sensitive data (e.g., migrating `v1` -> `v2`), read only non-sensitive fields needed for migration and immediately remove the legacy storage key. Document storage keys, retention scope, and clearing mechanisms in `README.md`. Treat frontend authentication state as UI input and enforce authorization on the server. See [Security](security.md#authentication-and-authorization).

For authenticated or session-scoped features, define what resets on logout, expiry (`401`), or account switch. Stop old-session polling and fetches (`cancelQueries`), revoke temporary object URLs, remove user-scoped query cache entries (`removeQueries`), reset session query state (`setQueryData`), reset user-owned Zustand stores and drafts, and ignore late results from the old session.

## Testing and incremental adoption

Colocate tests with the state owner. Unit-test reducers, store transitions, storage migrations, and selectors with representative edge cases. Integration-test observable UI with fresh providers, fresh `QueryClient` instances (`retry: false`), and reset or fresh stores per test. Cover query and mutation failures (`401`, `409`), form validation and resets, URL reload/Back, and session cleanup when those paths change. See [Testing strategy](testing-strategy.md).

Document app-specific state stores, storage keys, and session persistence details in `README.md`.
