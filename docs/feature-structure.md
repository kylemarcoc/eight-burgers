# Feature structure

Group code by user capability. Keep its UI, hooks, business rules, data operations, contracts, and tests in the feature that owns them. Use this guide for folder conventions and [Architecture](architecture.md#application-layers-and-dependency-rules) for layering and dependency rules.

## Recommended feature structure

| Location    | Responsibility                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| `app/`      | Bootstrap, routing, layouts, providers, composition-root store wiring, and feature composition.      |
| `features/` | User capabilities and the UI, rules, operations, contracts, stores, and tests they own.              |
| `shared/`   | Optional app-local code (including cross-feature client stores) independent of any business feature. |

Vite composes pages in `routes/` when multi-route navigation is enabled.
Keep translations in the owning app's locale resources when localized (keeping English-only apps English-only).

### Feature folders and naming

Start with a flat folder. Add a subdirectory when related modules become easier to find or maintain together. A single schema, type, helper, or constant can live beside its consumer or in a clearly named file at the feature root.

| Optional location | Use                                                                              |
| ----------------- | -------------------------------------------------------------------------------- |
| `components/`     | Feature-specific UI with distinct responsibilities.                              |
| `hooks/`          | Feature-specific React behavior and hooks that connect UI to feature operations. |
| `api/`            | Feature-specific transport and API operations.                                   |
| `store/`          | Feature-specific Zustand store, actions, and selectors for shared client state.  |
| `types/`          | TypeScript contracts used across several modules in the feature.                 |
| `schemas/`        | Runtime validation schemas for external inputs or responses.                     |
| `utils/`          | Feature-specific helpers with a clear purpose or more than one consumer.         |
| `constants/`      | Related constants used across feature modules.                                   |
| `index.ts`        | Explicit public exports for supported consumers outside the feature.             |

Use kebab-case for feature folders and API and utility `.ts` filenames. Use `PascalCase.tsx` for component files and `useSomething.ts` for hook files in Vite apps. Exported component and hook identifiers use `PascalCase` and `useCamelCase` across all stacks. See [Coding standards](coding-standards.md#naming).

### Boundaries and public APIs

- A feature can import its own modules and app-local shared code. Shared code stays independent of business features. Keep features independent of `app/` and `routes/` implementation details, including provider and store setup.
- Compose sibling features in the route or app layer using typed props and callbacks. When one feature needs an operation owned by another, call its public API. Keep feature dependencies one-way and acyclic. See [Cross-feature communication](architecture.md#imports-and-cross-feature-communication).
- Add an `index.ts` when the app or another feature needs a stable entry point. Use explicit named exports for public components, hooks, and types, plus any operation or reducer an outside consumer needs. Keep private helpers and internal transport details within the feature.
- Outside consumers import from the feature entry point. Inside the feature, import directly from sibling modules with relative paths. Keep re-exports at the boundary to avoid chains of barrels and circular imports.

### UI, hooks, state, and tests

- Keep feature-specific UI in the feature. Split a component when it owns independently changing responsibilities, such as editing a record and rendering its history. Compose smaller pieces through props and children. Promote UI to a shared layer when its behavior is feature-independent and reuse is concrete. See [Component guidelines](component-guidelines.md).
- Colocate hooks with the feature that owns the behavior. Put request and response handling in its API adapter, let hooks connect operations to React, and let components present the resulting state. Keep business rules with one owning feature and reuse its public contract when needed. Move domain-independent hooks to `shared/` when another feature needs them. See [API design](api-design.md).
- Keep state close to its consumers, starting with `useState`, `useReducer`, and scoped Context before introducing a store. When wider ownership is justified, colocate feature Zustand stores in `features/<feature>/store/` (or `shared/store/` for genuinely cross-feature, feature-independent client state) and keep cached server state in TanStack Query (or RTK Query in Redux-centric apps). See [State management](state-management.md#choosing-a-state-owner).
- Colocate `*.test.ts` and `*.test.tsx` files with the modules they exercise. Keep feature integration tests in the feature and tests for composed routes beside the route. See [Testing strategy](testing-strategy.md).

### Growing a feature

Start with one component and expose it when a route needs it. The feature's component test can live alongside it:

```text
features/order-history/
├── OrderHistory.tsx
├── OrderHistory.test.tsx
└── index.ts
```

Add folders as responsibilities grow:

```text
features/order-history/
├── components/
│   ├── OrderHistory.tsx
│   ├── OrderFilters.tsx
│   └── OrderList.tsx
├── hooks/useOrderHistory.ts
├── api/
│   ├── get-orders.ts
│   └── get-orders.test.ts
└── index.ts
```

## Stack conventions

### Vite + React

- `src/app/` owns bootstrap, routing, layout, providers, global styles, and optional localization setup (such as `i18next` and `src/app/locales/`). When multiple locales are configured, update every locale resource together whenever UI copy, accessible labels, or validation messages change.
- `src/routes/` holds page components and their colocated tests when multi-route navigation is used. Small, single-route sections stay beside their route until an independent workflow or a second route consumer justifies extracting `src/features/<feature>/`.
- `src/shared/` holds app-local shared UI, content, helpers, or client stores that have no dependency on `app/`, `routes/`, or `features/`.

## Incremental adoption

- Keep small, route-specific behavior beside its route. Extract a feature when it gains an independent workflow or another route needs it. Move related code and tests together in focused changes, keeping routes, public imports, and observable behavior stable.
- Adopt the folder and naming defaults as features grow. Compact layouts such as feature-root `schemas.ts` and `types.ts` can stay while their responsibilities remain clear.
- Use `src/shared/` when introducing feature-independent app-local code with a second consumer. See [Architecture](architecture.md#exceptions-and-incremental-adoption) for boundary enforcement and exceptions.
