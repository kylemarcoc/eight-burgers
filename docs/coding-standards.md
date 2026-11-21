# Coding standards

## TypeScript

- Use TypeScript for application code. Keep `strict` enabled in the [TypeScript configuration](../tsconfig.json). Specialized Node integration scripts or build configs may use `.mjs` or `.js` where justified by runtime or tooling requirements.
- Let TypeScript infer straightforward local values and implementation return types. Name public prop, input, and result types where callers need a contract. Use interfaces for object contracts that extend other props and type aliases for unions or derived types. Reuse the owning module's types.
- Reserve explicit `any` for a documented integration constraint. Use `unknown` for values that have yet to be checked and narrow them before use. Handle null and missing values with a guard or a supported default. An unavoidable type or non-null assertion needs a nearby explanation of the invariant that makes it safe.
- Prefer `satisfies` to validate object literals without widening literal types, use `as const` and `readonly` (including `ReadonlySet` and `ReadonlyMap`) for immutable contracts, and enforce exhaustive `switch` narrowing (`never`) on discriminated unions.
- Validate external data before using it as a domain type. Use a runtime schema (such as Zod v4 where installed, preferring `safeParse` and top-level format validators like `z.email()`, `z.uuid()`, and `z.url()`) or a focused type guard at the boundary that owns the input. Server Actions, Route Handlers, and complex forms should validate inputs with a schema library when adopted. See [API design](api-design.md) and [State management](state-management.md#form-state) for validation contracts.

Validate a quantity before passing it to feature code:

```ts
export function parseQuantity(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  return undefined;
}
```

## Naming

Use these defaults for new code and preserve established conventions where a module consistently follows a stack-specific style.

| Item                        | Convention                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Component names             | PascalCase, such as `OrderSummary`                                                             |
| Component files             | PascalCase `.tsx` in Vite apps & shared UI; kebab-case `.tsx` in Next.js features              |
| Custom hook names           | camelCase with a `use` prefix, such as `useOrderFilters`                                       |
| Custom hook files           | Match hook name (`useOrderFilters.ts`) in Vite; kebab-case (`use-order-filters.ts`) in Next.js |
| Client store files          | Match store hook name (`useFiltersStore.ts`) in Vite; kebab-case in Next.js                    |
| Runtime schema files        | kebab-case `*.schema.ts` (or feature-root `schemas.ts` for compact features)                   |
| Functions and variables     | camelCase, such as `calculateOrderTotal` or `formatReceiptDate`                                |
| API modules                 | camelCase function exports, such as `getOrders`, in kebab-case files                           |
| Types and interfaces        | PascalCase, such as `OrderSummaryProps`                                                        |
| Feature and utility folders | kebab-case, such as `order-history/`                                                           |
| Non-component utility files | kebab-case `.ts`, such as `order-totals.ts`                                                    |
| Constants                   | `UPPER_SNAKE_CASE` for fixed keys and limits, camelCase for ordinary values                    |
| Guides in `docs/`           | kebab-case `.md`, such as `coding-standards.md`                                                |

- Vite apps use PascalCase component folders and files.
- See [Feature structure](feature-structure.md) for directory layout details.
- Kebab-case filenames are the default for new API and utility modules.

## Imports and code clarity

- In new modules, group built-in and third-party imports first, followed by app aliases, and relative imports. Preserve the order of side-effect imports when it affects initialization or styling.
- Use `import type` for type-only imports or inline `type` when importing a type alongside values from the same module. Use `@/` for `src/`-rooted imports inside apps where it clarifies ownership. Use relative imports within a feature.
- Prefer explicit named exports for reusable code. Use default exports where the framework or an existing integration expects them. Across feature boundaries, import through declared public entry points. Keep feature dependencies one-way and acyclic. See [Architecture](architecture.md#imports-and-cross-feature-communication).

```ts
import { useState } from 'react';
import { OrderHistory } from '@/features/order-history';
```

## React

- Prefer function components and hooks. Keep render functions and hooks strictly pure (compiler-ready): never mutate props, state, or hook arguments during render, and avoid reading or writing `ref.current` during render. Keep each component focused on a single UI responsibility and compose through props and children. See [Component guidelines](component-guidelines.md) for reuse and hook extraction.
- Call hooks such as `useState` and custom hooks at the top level of a component or custom hook, before conditional returns. Keep hooks outside loops, conditions, and callbacks.
- Keep one source of truth and calculate derived values during render. Put interaction-driven work in event handlers or React 19 Actions, and use `useEffect` strictly to synchronize with external systems. On React 19.2+, extract non-reactive callbacks read inside an Effect with `useEffectEvent` instead of suppressing effect dependencies. Follow [State management](state-management.md) for state ownership.
- Add memoization for measured render cost or when a consumer needs stable identity. Give rendered collections stable keys from the items, such as `key={item.id}`. See [Performance](performance.md) for measurement and virtualization.
- Prefer JSX for elements, including intrinsic tags selected through a capitalized variable. Use `createElement` when JSX cannot express the operation.
- Components target React 19: accept `ref` as a prop (avoid new `forwardRef` wrappers), return cleanup functions from ref callbacks when detaching observers or listeners, and render `<Context value={...}>` directly instead of `<Context.Provider>`.
- Only upgrade React when requested.

## Styling

- Use Tailwind CSS v4 with `@tailwindcss/vite` and semantic `--ui-*` / `ui-*` tokens.
- Preserve narrow-screen usability, keyboard focus, and reduced-motion behavior. See [Component guidelines](component-guidelines.md) for stylesheet integration and accessibility.

## Code quality and tooling

- Name functions after the work they do and keep them focused on one operation. Reuse reducers, selectors, validators, and helpers that already express the same behavior. Extract a helper when its name makes a distinct operation easier to understand or when there is a concrete reuse case.
- Choose collections for intent and key safety: use `Array` for ordered sequences, plain objects for fixed serializable records, `Set` for membership and uniqueness, and `Map` for dynamic, non-string, or untrusted keys (avoiding prototype key collisions). Use `ReadonlySet` and `ReadonlyMap` for read-only contracts. See [Performance](performance.md#data-structures-and-algorithmic-complexity) for `O(1)` vs `O(n)` tradeoffs and indexing hot paths.
- Handle failures explicitly. Narrow caught values before reading their fields, and recover with a documented fallback or pass the failure to the owning error handler. Remove dead code and unused imports or dependencies in the scope of the change.
- Follow [Prettier](../.prettierrc.json) for two-space indentation, single quotes in JavaScript and TypeScript, semicolons, trailing commas, and LF line endings. Format changed files only. The root lint script uses [Oxlint](../.oxlintrc.json), which checks the Rules of Hooks, dependency cycles, accessibility warnings, and boundary-crossing imports. Select checks using the [testing strategy](testing-strategy.md#choosing-checks).

## Dependencies and review

- Use npm and a single root `package-lock.json`. Justify a new dependency by explaining what it provides beyond existing code or packages. Follow the [install instructions](../README.md#install) for supported Node versions and [Security](security.md#dependency-overrides) when changing a security override.
- Use short lowercase commit subjects and add a scope when helpful, as in `fix(ui): restore button focus after close`. Pull requests describe the change and its user impact, record checks actually run, link an issue when applicable, and include screenshots for visible UI changes.

## Migration and exceptions

Apply these standards to new and substantially modified code. Migrate older files incrementally during focused changes. Rename a file when doing so serves the change, and preserve public entry points for existing callers. When a framework, tool, or compatibility requirement calls for an exception, record the reason near the affected code or boundary. For a temporary exception, record what would allow its removal.

Import grouping, filename conventions, type-only import style, and the safety of individual assertions rely on code review. Oxlint checks dependency cycles through `import/no-cycle`. See [Architecture](architecture.md#exceptions-and-incremental-adoption) for lint coverage of import boundaries.
