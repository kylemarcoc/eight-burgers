# Architecture

## Project structure and tooling

This repository is a contract-driven TypeScript npm-workspaces monorepo (`apps/*`, `packages/*`) built with Vite 8, React 19, Hono, Tailwind CSS v4, Vitest, [Oxlint](../.oxlintrc.json), [Prettier](../.prettierrc.json), and local Supabase CLI. Shared contracts (`packages/contracts`), backend BFF (`apps/api`), and database (`supabase/`) layers apply when configured in the workspace. Inspect root [package.json](../package.json) (`workspaces`) and workspace manifests (`apps/*/package.json`, `packages/*/package.json`) for workspace scripts and dependencies, and follow [README.md](../README.md) for supported Node versions and setup.

## Application layers and dependency rules

### Stack layering

Organize code around user capabilities and explicit tier boundaries so changes stay isolated to their owning layer:

| Layer              | Path                                         | Responsibility                                                                    |
| ------------------ | -------------------------------------------- | --------------------------------------------------------------------------------- |
| Frontend SPA       | `apps/web/src/{app,routes,features,shared}/` | Bootstrap, routing, layouts, user features, and feature-independent client UI/lib |
| Shared contracts   | `packages/contracts/src/`                    | Shared Zod v4 schemas (`*.schema.ts`), domain types, and pure helpers             |
| Backend REST BFF   | `apps/api/src/`                              | Hono routes, security/auth middleware, env validation, and data gateways          |
| Database & Storage | `supabase/{config.toml,migrations/,seeds/}`  | Declarative PostgreSQL 17 migrations, RLS policies, SQL RPCs, Storage, and seeds  |

- **Frontend SPA (`apps/web/src/`):** `app/` owns bootstrap, router setup, layouts, app-wide providers, and global styles. `routes/` holds page composition and route-specific UI. `features/<feature>/` owns independent user capabilities and exposes a public `index.ts`. `shared/` holds feature-independent UI, helpers, HTTP client utilities, and cross-feature client stores.
- **Shared contracts (`packages/contracts/src/`):** Owns Zod v4 schemas (`*.schema.ts`), inferred TypeScript types, and pure domain helpers shared across frontend and backend with zero runtime dependency on either tier.
- **Backend REST BFF (`apps/api/src/`):** `app.ts` and `index.ts` wire server dependencies and routes; `config/` parses and validates runtime environment variables; `middleware/` enforces request IDs, security headers, CSRF checks, and session verification; `routes/` provides thin HTTP handlers; and `lib/` encapsulates data gateways, auth cookies/single-flight refresh, rate limiting, RFC 9457 Problem Details, and media optimization.
- **Database & Storage (`supabase/`):** Owns declarative PostgreSQL 17 `migrations/`, Row-Level Security (RLS) policies, atomic SQL RPCs, `storage.buckets` configuration, and environment-split `seeds/`. See [Database and storage](database-and-storage.md).

### Layer responsibilities

- **`apps/web/src/app/`** owns bootstrap, routing, layouts, app-wide providers, and their configuration. It composes features into pages and wires integrations between them.
- **`apps/web/src/features/`** owns client capabilities. Keep business UI, hooks, feature API adapters, and feature-local helpers with the owning feature, exposing only supported entry points through `index.ts`.
- **`apps/web/src/shared/`** holds feature-independent client code reused across multiple features (`components/`, `lib/`, `store/`, `test/`). Keep feature-owned contracts in their owning feature, or in `packages/contracts/src/` when shared with the backend.
- **`apps/api/src/`** owns server-side authorization, CSRF validation, rate limiting, uploaded media processing, and persistence mediation. It consumes shared contracts and never imports frontend UI modules.

### Imports and cross-feature communication

- Keep dependencies flowing one way:
  - **Frontend (`apps/web/src/`):** `app/` and `routes/` may import feature public entry points (`index.ts`) and `shared/`. Features may import their own modules (via relative paths), `shared/`, and shared contracts (`@<scope>/contracts`). Shared code depends only on other shared modules, shared contracts, and declared client packages. Frontend code must never import backend server modules or server-only packages.
  - **Across workspaces:** Both `apps/web` and `apps/api` may import shared contracts (`@<scope>/contracts`); `packages/contracts` must import neither frontend nor backend modules; `apps/api` never imports frontend UI modules or `react`/`react-dom`.
- Compose sibling features in the owning route or app entry point. Pass data down through typed props and pass actions through callbacks. For state that outlives one page, keep one owner and use its public hooks, actions, or selectors. See [State management](state-management.md) for choosing that owner.
- A feature may call another feature directly when the operation belongs to the called feature and the dependency is one-way. Import its public `index.ts` and keep private modules and dependency cycles out of that path. Use relative imports for feature internals. See [Coding standards](coding-standards.md#imports-and-code-clarity).

### Exceptions and incremental adoption

- Keep small, route-specific behavior colocated. Extract a feature when a capability gains an independent workflow or a second route needs it. Move app-local shared code when reuse is clear. Introduce folders and public exports as callers need them.
- [Oxlint](../.oxlintrc.json) enforces module, feature, and workspace boundaries across all layers:
  - Global deep-import block into `features/<name>/<submodule>` and cycle detection (`import/no-cycle`).
  - `apps/web/src/**/*`: blocks imports from `@<scope>/api` (and relative `../api` cross-workspace paths) and server-only packages (`hono`, `@hono/*`, `sharp`, `@supabase/supabase-js`, `node:*`).
  - `apps/web/src/routes/**/*`: additionally blocks imports from `app/`.
  - `apps/web/src/features/**/*`: additionally blocks imports from `app/` and `routes/`.
  - `apps/web/src/shared/**/*`: additionally blocks imports from `app/`, `features/`, and `routes/`.
  - `packages/contracts/src/**/*`: blocks imports from `@<scope>/web`, `@<scope>/api` (and relative `../apps` cross-workspace paths), and UI or server runtime packages (`react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `zustand`, `immer`, `hono`, `@hono/*`, `sharp`, `@supabase/supabase-js`, `node:*`, and other client-only packages configured in `.oxlintrc.json`).
  - `apps/api/src/**/*`: blocks imports from `@<scope>/web` (and relative `../web` cross-workspace paths) and frontend UI/client packages (`react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `zustand`, `immer`, and other client-only packages configured in `.oxlintrc.json`).
- Review boundary imports that fall outside configured patterns and record temporary or repository-specific exceptions in [AGENTS.md](../AGENTS.md) (with their reason and removal criteria where applicable).

See [Feature structure](feature-structure.md) for folder conventions, [Component guidelines](component-guidelines.md) for React composition, [API design](api-design.md) for REST/BFF transport, and [Performance](performance.md) for rendering and loading guidance.

## Build configuration

- Scripts in root [package.json](../package.json) run lint, formatting checks, tests, type-checking, and production builds across workspaces.
- **`apps/web` output:** Static client assets write to `apps/web/dist/`.
- **`apps/api` output:** The Node 22 server bundle writes to `apps/api/dist/index.js` via Vite 8 `build.rolldownOptions` (externalizing Node built-ins and runtime dependencies such as `sharp`).
- Treat client build-time variables (`VITE_*`) as public and keep runtime secrets strictly in server runtime environment variables. See [Security](security.md#secrets-and-deployment) for configuration boundaries and [Testing strategy](testing-strategy.md#choosing-checks) for build checks.

## Routing and deployment

Follow the hosting provider's documentation for the chosen deployment target when adding production hosting configuration.

- Preserve configured public base paths (`base`) and SPA client-side fallback behavior.
- **Same-origin API and storage proxying:** In local development, `apps/web/vite.config.*` typically proxies API, health/readiness, and storage prefixes (such as `/api`, `/healthz`, `/readyz`, and `/storage`) to local backend and storage services (see [AGENTS.md](../AGENTS.md) and [README.md](../README.md) for repository routes, ports, and setup). Production hosting must preserve same-origin API routing (or explicitly configure origin allowlist, `COOKIE_SECURE`, `COOKIE_DOMAIN`, and CORS env vars) alongside storage or hosted CDN URLs.

### Release workflow

1. Complete the checks in [Testing strategy](testing-strategy.md) before opening or merging a pull request.
2. [CI](../.github/workflows/ci.yml) runs on pull requests targeting `main` and pushes to `main`. It installs with `npm ci`, then runs `lint`, `format:check`, `test`, `typecheck`, and `build`.
