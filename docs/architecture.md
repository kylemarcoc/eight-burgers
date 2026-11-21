# Architecture

## Project structure and tooling

This repository uses a feature-sliced React architecture under `src/` with TypeScript, Tailwind CSS v4, Vitest, [Oxlint](../.oxlintrc.json), and [Prettier](../.prettierrc.json). Follow the [install instructions](../README.md#install) for supported Node versions and setup.

## Application layers and dependency rules

### Stack layering

Organize code around user capabilities so a change usually stays within one feature.

- **Vite + React apps:** `src/app/` owns bootstrap, router setup, layouts, app-wide providers, global styles, and optional localization resources. `src/routes/` holds page composition and route-specific UI when multi-route navigation is enabled. `src/features/<feature>/` owns independent user capabilities and exposes a public `index.ts`. Optional `src/shared/` holds feature-independent UI, content, helpers, or client stores reused within the app.

### Layer responsibilities

- **`app/`** owns bootstrap, routing, layouts, app-wide providers, and their configuration. It composes features into pages and wires integrations between them. Vite keeps page composition in `routes/` when routing is split out.
- **`features/`** owns user capabilities. Keep business rules and feature-specific UI, hooks, data adapters, schemas, and contracts with the owning feature. Expose only the entry points outside consumers need through its public `index.ts`.
- **`shared/`** is an optional home for feature-independent code reused within one app. Add it when there is a concrete second consumer. Keep feature-owned contracts in their feature, even when multiple modules use them.

### Imports and cross-feature communication

- Keep dependencies flowing one way: `app/` and `routes/` may import feature public entry points (`index.ts`) and `shared/`. Features may import their own modules (via relative paths) and `shared/`. Shared code depends only on other shared modules and declared packages.
- Compose sibling features in the owning route or app entry point. Pass data down through typed props and pass actions through callbacks. For state that outlives one page, keep one owner and use its public hooks, actions, or selectors. See [State management](state-management.md) for choosing that owner.
- A feature may call another feature directly when the operation belongs to the called feature and the dependency is one-way. Import its public `index.ts` and keep private modules and dependency cycles out of that path. Use relative imports for feature internals. Prefer direct composition before adding a wrapper or an event bus. See [Coding standards](coding-standards.md#imports-and-code-clarity).

### Exceptions and incremental adoption

- Keep small, route-specific behavior colocated. Extract a feature when a capability gains an independent workflow or a second route needs it. Move app-local shared code when reuse is clear. Introduce folders and public exports as callers need them.
- [Oxlint](../.oxlintrc.json) restricts deep feature imports, imports from `features/`, `lib/`, and `server/` into `app/` and `routes/`, and imports from `shared/` into `app/`, `routes/`, and `features/`. Its `import/no-cycle` rule checks for cycles. Review boundary imports that fall outside configured patterns and record temporary exceptions at the boundary with their reason and removal criteria.

See [Feature structure](feature-structure.md) for folder conventions, [Component guidelines](component-guidelines.md) for React composition, and [Performance](performance.md) for rendering and loading guidance.

## Build configuration

- Scripts in [package.json](../package.json) run lint, formatting checks, tests, type-checking, and production builds.
- Vite writes production output to `dist/`.
- Treat client build-time variables (`VITE_*` / `NEXT_PUBLIC_*`) as public and keep runtime secrets strictly server-side. See [Security](security.md#secrets-and-deployment) for configuration boundaries and [Testing strategy](testing-strategy.md#choosing-checks) for build checks.

## Routing and deployment

Follow the hosting provider's documentation for the chosen deployment target when adding production hosting configuration. Preserve configured public base paths (`base` / `basePath`) and client-side fallback behavior.

### Release workflow

1. Complete the checks in [Testing strategy](testing-strategy.md) before opening or merging a pull request.
2. [CI](../.github/workflows/ci.yml) runs on pull requests targeting `main` and pushes to `main`. It installs with `npm ci`, then runs `lint`, `format:check`, `test`, `typecheck`, and `build`.
