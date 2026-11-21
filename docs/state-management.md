# State management

Keep one authoritative owner for each piece of state. Treat these guidelines as **recommended defaults, not mandatory architectural rules**. Start with the simplest effective solution closest to the consumer, prefer dependencies and patterns already installed in the project, and move state outward only when consumer distance, lifetime, persistence, performance, or maintainability requires it.

- **Separate state categories.** Keep server state, local UI state, shared client state, form state, and URL state in distinct owners instead of merging them into one global store.
- **Avoid duplicated sources of truth.** Compute derived values during render or in focused selectors. Avoid syncing TanStack Query data into Zustand, Redux, Context, or effects.
- **Scope state to its feature.** Keep feature state inside the owning feature unless cross-feature sharing is genuinely required.
- **Keep working code in place.** Apply these defaults to new and substantially changed code. Do not migrate working implementations solely to match this guide.

> **Installed vs. optional dependencies.** Inspect `package.json` and `package-lock.json` before choosing a library. React 19 primitives (`useState`, `useReducer`, Context) are available everywhere; optional packages such as `@tanstack/react-query`, `zustand`, `react-hook-form`, `zod`, `@hookform/resolvers`, or `@reduxjs/toolkit` should be added only when a concrete requirement justifies them.

## Choosing a state owner

| Approach                                             | Best fit                                                                                           | Avoid for / guardrails                                                                            | Recommended placement                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Derived value                                        | Totals, filtered lists, and flags computed from authoritative state or props                       | Storing redundant copies in state or syncing via `useEffect`                                      | Inline during render, pure helper, or selector                            |
| `useState`                                           | Simple component-local UI state: toggles, inputs, disclosures, modals                              | Multi-step state machines or interdependent transitions                                           | Owning component or closest common parent                                 |
| `useReducer`                                         | Complex local or feature-scoped state with multiple actions, transitions, or business rules        | Remote API caching or trivial single-boolean toggles                                              | Feature hook or colocated `*-reducer.ts` module                           |
| React 19 Actions (`useActionState`, `useOptimistic`) | Async form submissions, Server Actions, and local mutation or optimistic pending state             | Caching remote reads (use TanStack Query) or complex multi-field validation (use React Hook Form) | Owning form component or feature hook                                     |
| React Context                                        | Dependency injection and relatively stable subtree values (theme, locale, scoped `useReducer`)     | High-frequency client updates or acting as a server-state cache                                   | `app/providers/` (app-wide) or `features/<feature>/` (subtree)            |
| Zustand                                              | Shared client state across distant components or features when props and Context become cumbersome | Duplicating server responses, committed URL params, or local-only UI state                        | `features/<feature>/store/` by default; `shared/store/` if cross-feature  |
| TanStack Query v5                                    | Default for client-side server state: fetching, caching, mutations, pagination, invalidation       | Pure UI toggles or duplicating cached data in Zustand or Redux                                    | `features/<feature>/api/` + `features/<feature>/hooks/`; `app/providers/` |
| React Hook Form + Zod                                | Complex forms, multi-field validation, schema contracts, dirty/submitting state                    | Simple one-field controls where plain React state suffices; never skip server validation          | Owning route or `features/<feature>/components/` + `schemas/`             |
| URL search parameters                                | Shareable, bookmarkable state: search queries, filters, sorting, pagination, invite codes          | Sensitive data, secrets, or unsubmitted keystroke drafts                                          | Route boundary (`useSearchParams` or Next.js page `searchParams`)         |
| Redux Toolkit & RTK Query                            | Retain where existing architecture or complex global state justifies it; RTK Query for Redux apps  | Introducing by default, overlapping with Zustand, or caching the same data in TanStack & RTK      | Feature slices (`features/<feature>/`); root store wiring in `app/store/` |

## Local and shared client state

- **`useState` first.** Use `useState` for simple, independent component-local UI state such as toggles, controlled inputs, and modal open flags. Lift state to the closest common parent when sibling components share a value.
- **`useReducer` for complex transitions.** Prefer `useReducer` when local or feature-scoped state involves multiple actions, interdependent fields, invariants, or transition rules worth unit-testing in isolation. Keep reducers pure and deterministic, use typed discriminated actions, and put network or storage side effects in the owning hook or adapter.
- **React Context for dependency injection and stable subtree values.** Use Context for low-frequency shared concerns such as theme (`ThemeProvider`), localization, or injecting test/runtime adapters. Combine Context with `useReducer` when several descendants in a feature subtree need shared state and dispatch without prop drilling. Scope providers closely to their consumers and memoize provided values so unrelated updates do not re-render the subtree.
- **Zustand only when justified.** Introduce **Zustand** when client state must be shared across distant components or features, or survive route transitions, and props or Context would be unnecessarily cumbersome. Give actions descriptive names and typed inputs, keep transitions pure, and include an explicit `reset` action for session cleanup and test teardown. See the [Zustand TypeScript guide](https://zustand.docs.pmnd.rs/guides/typescript).
- **Redux Toolkit (retain when justified, do not introduce by default).** Do not add `@reduxjs/toolkit` where requirements do not justify it. When retained, avoid overlapping responsibilities with Zustand for the same client domain and never duplicate cached server data from TanStack Query into Redux slices.

### Local UI state (`useState`)

Keep ephemeral disclosure or confirmation state with the component that renders it and derive secondary flags during render:

```tsx
import { useState } from 'react';
import { Button } from '@/shared/components/Button';

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
      <Button onClick={() => setConfirmOpen(true)}>Clear session</Button>
      {confirmOpen && (
        <Button loading={submitting} onClick={handleConfirm}>
          Confirm clear
        </Button>
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

For straightforward form submissions, Server Actions, and local async mutations that do not require React Hook Form or a TanStack Query cache, prefer React 19 Actions (`useActionState`, `useFormStatus`, or async `startTransition`) over hand-rolled `isSubmitting` and `try/catch/finally` state machines. Pair `useOptimistic` with an Action or `startTransition` when immediate UI feedback helps and the optimistic value should reconcile automatically once settled. See [`useActionState`](https://react.dev/reference/react/useActionState) and [`useOptimistic`](https://react.dev/reference/react/useOptimistic).

```tsx
import { useActionState } from 'react';
import { Button } from '@/shared/components/Button';

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
      <Button type="submit" loading={isPending}>
        Save
      </Button>
      {result.error && <p role="alert">{result.error}</p>}
    </form>
  );
}
```

### Shared client state and Zustand store placement

Follow the module boundaries enforced in `.oxlintrc.json` when placing a Zustand store:

| Ownership scope                                     | Recommended location                                                                           | Public access rule                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Feature-owned client state (default)                | `src/features/<feature>/store/` (`useFiltersStore.ts` in Vite; `use-filters-store.ts` in Next) | Export focused selector hooks and supported actions via `features/<feature>/index.ts`    |
| Genuinely cross-feature, feature-independent client | `src/shared/store/`                                                                            | Features may import `shared/`; keep `shared/` independent of `features/`, `app/`, routes |
| Composition-root store setup (for example, Redux)   | `src/app/store/`                                                                               | Wired in `app/` or `routes/` and passed to features via providers, props, or callbacks   |

Because `.oxlintrc.json` forbids `features/`, `lib/`, and `server/` from importing `app/` or `routes/`, never place a Zustand store that features import directly inside `src/app/store/`. See [Architecture](architecture.md#imports-and-cross-feature-communication) and [Feature structure](feature-structure.md#boundaries-and-public-apis).

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

When combining Zustand with `immer` and `persist`, compose `persist(immer(...))`, keep ephemeral UI flags in local state or a separate non-persisted store (and `partialize` only durable slices), select individual actions (or a stable `actions` object) so action-only consumers do not re-render, validate/sanitize hydrated storage payloads from `unknown` in `merge` or custom `PersistStorage`, and handle storage quota or restricted-mode errors cleanly.

## Server state

Prefer **TanStack Query v5** as the default for cached client-side server state, API fetching, mutations, pagination, and cache invalidation. Add `@tanstack/react-query` only when adopting cached remote reads; features using Server Actions, polling loops, or realtime channels can keep those patterns when they fit. Keep one authoritative cache for each remote resource. See [API design](api-design.md) for transport and error contracts.

In Redux-centric apps that retain Redux Toolkit, **RTK Query** is a valid alternative to TanStack Query. Do not manage the same server resource in both TanStack Query and RTK Query.

- **Keep server data in the query cache.** Avoid copying TanStack Query responses into Zustand, Redux Toolkit, Context, or component state as a second source of truth.
- **Place server modules with their feature.** Put plain transport operations and shared query keys in `features/<feature>/api/`, query and mutation hooks in `features/<feature>/hooks/`, and `QueryClientProvider` setup in `app/providers/`.
- **Use serializable, normalized query keys.** Group keys by feature and resource, followed by normalized inputs that affect the result (filters, sorting, page or cursor, and a nonsecret account identifier for private data). Give list, detail, and infinite results distinct keys.
- **Tune freshness and retention per query.** Set `staleTime` for how long results stay fresh and `gcTime` for inactive cache retention. See [TanStack Query defaults](https://tanstack.com/query/v5/docs/framework/react/guides/important-defaults).
- **Gate conditional reads and paginate explicitly.** Use `enabled` or `skipToken` until prerequisites exist. Key numbered pages by page number and use `useInfiniteQuery` for cursor-based append. See [conditional queries](https://tanstack.com/query/v5/docs/framework/react/guides/disabling-queries) and [pagination](https://tanstack.com/query/v5/docs/framework/react/guides/paginated-queries).
- **Keep writes in `useMutation` hooks.** On success, update exact cache entries with `setQueryData` when authoritative and invalidate affected lists or details. See [optimistic updates](https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates).

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

Prefer **React Hook Form + Zod** for complex forms, cross-field validation, schema-backed contracts, and form-specific state (`dirtyFields`, `errors`, `isSubmitting`). Keep simple forms lightweight: small forms can use inline field rules, and single controlled inputs can stay on `useState`. Always validate again on the server for persisted writes.

Provide typed `defaultValues`. With React Hook Form, prefer uncontrolled field registration (`register`) by default to minimize keystroke re-renders, use `Controller` or `useController` only for controlled custom inputs without native refs, and prefer scoped `useWatch({ control, name })` over top-level `watch()`. Reset on deliberate discard or record change, protect dirty input from background refresh, and preserve values on failure. See [React Hook Form reset](https://react-hook-form.com/docs/useform/reset), [Zod basics](https://zod.dev/basics), and [Component guidelines](component-guidelines.md#interaction-and-accessibility).

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const inviteSchema = z.object({
  email: z.email('Enter a valid email address.'),
  role: z.enum(['viewer', 'editor']),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

export function useInviteForm(onSubmitInvite: (values: InviteFormValues) => Promise<void>) {
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'viewer' },
  });

  return { ...form, onSubmit: form.handleSubmit(onSubmitInvite) };
}
```

## URL state

Prefer URL search parameters for shareable, bookmarkable state such as search queries, filters, sorting, pagination, and invite codes. Validate parameters at the route boundary, provide safe defaults, and pass typed values to the feature. Update related parameters together and keep unsubmitted search drafts local.

Use React Router's `useSearchParams` in Vite, preferring the functional updater `setSearchParams((prev) => ...)` to preserve the configured `basename`. See [React Router search parameters](https://reactrouter.com/api/hooks/useSearchParams).

## Subscriptions and performance

Subscribe to the smallest useful value with a focused Zustand selector (using `useShallow` from `zustand/react/shallow` when deriving an object or array) or a TanStack Query `select` option. Avoid selectors that return fresh object references on every update. Keep fast-changing values out of broad Context providers. Profile before adding memoization or splitting providers. See [Performance](performance.md#rendering-and-assets).

## Persistence and session boundaries

Persist only non-sensitive values with a clear reload or cross-session need, such as theme or language preferences. Always validate and sanitize hydrated storage payloads from `unknown` and fall back when storage is unavailable. Keep credentials, secrets, and sensitive personal data out of Web Storage and URLs; if a client-only or offline-first app persists non-sensitive local app state, document the retention scope, clearing mechanism, and limitations explicitly in `README.md`. Treat frontend authentication state as UI input and enforce authorization on the server. See [Security](security.md#authentication-and-authorization).

For authenticated or session-scoped features, define what resets on logout, expiry, or account switch. Stop old-session polling and fetches, revoke temporary object URLs, cancel and remove user-scoped query cache entries, reset user-owned Zustand or Redux stores and drafts, and ignore late results from the old session. Partition private cache keys by account or session scope without including credentials.

## Testing and incremental adoption

Colocate tests with the state owner. Unit-test reducers, store transitions and selectors, schema validation, and parameter parsing with representative edge cases. Integration-test observable UI with fresh providers, fresh `QueryClient` instances, and reset or fresh stores per test. Cover query and mutation failures, optimistic rollback where used, form validation and resets, URL reload and Back, and session cleanup when those paths change. See [Testing strategy](testing-strategy.md).

Document app-specific state stores, storage keys, and session persistence details in `README.md`.
