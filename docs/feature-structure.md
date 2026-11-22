# Feature structure

Group code by user capability. Keep its UI, hooks, transport operations, client state, and tests in the feature that owns them, while placing shared wire schemas and pure cross-tier domain rules in `packages/contracts/src/`. Use this guide for folder conventions and [Architecture](architecture.md#application-layers-and-dependency-rules) for layering and dependency rules.

## Recommended feature structure

See [Architecture](architecture.md#stack-layering) for top-level workspace and tier ownership (`apps/web/src/`, `packages/contracts/src/`, `apps/api/src/`, and `supabase/`). Within `apps/web/src/`:

- `app/` owns bootstrap, routing, layouts, providers, and composition-root wiring.
- `routes/` holds route-level page components and colocated route tests.
- `features/` owns user capabilities alongside their UI, hooks, feature API adapters, stores, and tests.
- `shared/` holds feature-independent client code (UI primitives, HTTP client, errors, client stores, shared test utilities), subject to any repository exceptions documented in [AGENTS.md](../AGENTS.md).

### Feature folders and naming

Start with a flat folder under `apps/web/src/features/<feature>/`. Add a subdirectory when related modules become easier to find or maintain together. A single type, helper, or constant can live beside its consumer or in a clearly named file at the feature root.

| Optional location | Use                                                                            |
| ----------------- | ------------------------------------------------------------------------------ |
| `components/`     | Feature-specific UI with distinct responsibilities                             |
| `hooks/`          | Feature-specific React behavior and hooks that connect UI to queries/mutations |
| `api/`            | Feature-specific HTTP request builders and TanStack Query key factories        |
| `store/`          | Feature-specific Zustand store, actions, and selectors for shared client state |
| `types/`          | Feature-internal TypeScript contracts (put cross-tier schemas in contracts)    |
| `schemas/`        | Frontend-only runtime validation schemas when no backend contract exists       |
| `utils/`          | Feature-specific helpers with a clear purpose or more than one consumer        |
| `constants/`      | Related constants used across feature modules                                  |
| `index.ts`        | Explicit public exports for supported consumers outside the feature            |

Use `kebab-case` for feature folders and API/utility `.ts` filenames. Use `PascalCase.tsx` for component files and `useSomething.ts` for hook files. Exported component and hook identifiers use `PascalCase` and `useCamelCase`. See [Coding standards](coding-standards.md#naming).

### Boundaries and public APIs

- A feature can import its own modules, `apps/web/src/shared/`, and shared contracts (`@<scope>/contracts`). Shared client code stays independent of business features, `app/`, `routes/`, and backend server code unless an explicit exception is recorded in [AGENTS.md](../AGENTS.md). Keep features independent of `app/` and `routes/` implementation details, including provider and router setup.
- Put request, response, and error Zod schemas—plus any calculation that must behave identically on client and server—in `packages/contracts/src/` rather than duplicating them inside frontend features and backend routes.
- Compose sibling features in the route or app layer using typed props and callbacks. When one feature needs an operation owned by another, call its public API (`index.ts`). Keep feature dependencies one-way and acyclic. See [Cross-feature communication](architecture.md#imports-and-cross-feature-communication).
- Add an `index.ts` when the app or another feature needs a stable entry point. Use explicit named exports for public components, hooks, and types, plus any operation an outside consumer needs. Keep private helpers and internal transport details within the feature.
- Outside consumers import from the feature entry point (`@/features/<feature>`). Inside the feature, import directly from sibling modules with relative paths. Keep re-exports at the boundary to avoid chains of barrels and circular imports.

### UI, hooks, state, and tests

- Keep feature-specific UI in the feature. Split a component when it owns independently changing responsibilities, such as editing a record and listing filtered results. Compose smaller pieces through props and children. Promote UI to `apps/web/src/shared/components/` when its behavior is feature-independent and reuse is concrete. See [Component guidelines](component-guidelines.md).
- Colocate hooks with the feature that owns the behavior. Put request and response handling in `api/`, let hooks connect operations to React via TanStack Query, and let components present the resulting state. Move domain-independent hooks to `shared/` when another feature needs them. See [API design](api-design.md).
- Keep state close to its consumers, starting with `useState`, `useReducer`, and scoped Context before introducing a store. When wider ownership is justified, colocate feature Zustand stores in `features/<feature>/store/` (or `shared/store/` for genuinely cross-feature, feature-independent client state) and keep cached server state in TanStack Query. See [State management](state-management.md#choosing-a-state-owner).
- Colocate `*.test.ts` and `*.test.tsx` files with the modules they exercise. Keep feature integration tests in the feature and tests for composed routes beside the route. See [Testing strategy](testing-strategy.md).

### Growing a feature

Start with one component and expose it when a route needs it. The feature's component test can live alongside it:

```text
apps/web/src/features/record-history/
├── RecordHistory.tsx
├── RecordHistory.test.tsx
└── index.ts
```

Add folders as responsibilities grow, while keeping shared schemas in `packages/contracts/src/`:

```text
apps/web/src/features/record-history/
├── components/
│   ├── RecordHistory.tsx
│   ├── RecordFilters.tsx
│   └── RecordList.tsx
├── hooks/
│   └── useRecordHistory.ts
├── api/
│   ├── records-api.ts
│   └── records-api.test.ts
└── index.ts
```

## Stack conventions

### Frontend (`apps/web/src/`)

- `app/` owns bootstrap, routing, layout, providers, and global styles.
- `routes/` holds page components and their colocated tests. Small, single-route sections stay beside their route until an independent workflow or a second route consumer justifies extracting `features/<feature>/`.
- `shared/` holds app-local shared UI, HTTP/error helpers, content, or client stores that have no dependency on `app/`, `routes/`, `features/`, or backend server modules.
- Keep single-language apps inline; if localization is adopted, keep translation keys static, avoid fragment concatenation, and update every configured locale resource together whenever UI copy, accessible labels, or validation messages change.

### Backend BFF (`apps/api/src/`) and contracts (`packages/contracts/src/`)

- Keep shared domain schemas (`*.schema.ts`), invariants, and pure calculations in `packages/contracts/src/` and re-export them from `index.ts`.
- Align BFF `routes/` modules with domain capabilities as thin Hono handlers that parse requests with shared Zod schemas, delegate persistence to `lib/` gateway methods, and return standardized JSON or RFC 9457 Problem Details responses.
- Keep cross-cutting HTTP middleware (such as request IDs, security headers, CSRF checks, and auth/role guards) in `apps/api/src/middleware/` and runtime environment validation in `apps/api/src/config/`. See [Database and storage](database-and-storage.md) for SQL and Storage ownership under `supabase/`.

## Incremental adoption

- Keep small, route-specific behavior beside its route. Extract a feature when it gains an independent workflow or another route needs it. Move related code and tests together in focused changes, keeping routes, public imports, and observable behavior stable.
- Adopt the folder and naming defaults as features grow. Keep shared contracts in `packages/contracts/src/` whenever both frontend and backend validate or compute the same payload.
- Use `apps/web/src/shared/` when introducing feature-independent app-local code with a second consumer. See [Architecture](architecture.md#exceptions-and-incremental-adoption) and [AGENTS.md](../AGENTS.md) for boundary enforcement and documented exceptions.
