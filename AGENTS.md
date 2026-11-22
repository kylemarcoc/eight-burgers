# Repository Agent Instructions

## Project Context

This repository is an npm-workspaces monorepo (`apps/*`, `packages/*`) using contract-driven TypeScript, validated with Vitest, React Testing Library, Oxlint, Prettier, and local Supabase CLI:

- `apps/web` (`@eight-burgers/web`): Vite 8 + React 19 + Tailwind CSS v4 frontend SPA under `apps/web/src/{app,routes,features,shared}/`. Local dev proxy in `apps/web/vite.config.js` forwards `/api`, `/healthz`, and `/readyz` to `:8787` and `/storage` to `:54321`. Global theme tokens in `apps/web/src/app/styles/globals.css` expose semantic `--ui-*` CSS variables and `ui-*` utilities toggled via root `data-ui-theme` (`light` / `dark`).
- `apps/api` (`@eight-burgers/api`): Hono REST BFF under `apps/api/src/{config,middleware,routes,lib}/`.
- `packages/contracts` (`@eight-burgers/contracts`): Pure shared Zod v4 contracts and domain helpers under `packages/contracts/src/` with zero runtime dependency on `apps/web` or `apps/api`. `packages/contracts/tsconfig.json` includes `"lib": ["ES2022", "DOM"]` so pure helpers can call standard Web APIs (such as `URL`) without `@types/node`, while `.oxlintrc.json` blocks UI and server imports.
- `supabase/`: PostgreSQL 17 declarative `migrations/`, Row-Level Security (RLS) policies, SQL RPCs, Storage bucket configuration, and environment-split `seeds/`.
- **Documented `shared/` exception:** In `apps/web/src/shared/`, `shared/shop/`, `shared/components/FoodImage.tsx`, and `shared/store/useCartStore.ts` hold cross-feature storefront and admin domain helpers alongside feature-independent primitives (`ErrorBoundary.tsx`, `shared/lib/`).

## Development Principles

- Inspect the working tree, root and workspace `package.json` files, framework and TypeScript configurations, `.oxlintrc.json`, and relevant source and tests before editing. Preserve unrelated edits, working behavior, and public APIs unless the task calls for a change.
- Keep frontend feature logic, tests, and public APIs inside `apps/web/src/features/<feature>/`, exposed via `index.ts`.
- Keep `apps/web/src/shared/` independent of `app/`, `routes/`, `features/`, and backend server code.
- Keep `apps/api/src/` independent of `apps/web` UI modules, keep `packages/contracts/src/` pure and independent of both frontend and server runtimes, and evolve database schemas via append-only migrations in `supabase/migrations/`.
- Make incremental changes. Follow nearby patterns, reuse existing utilities, and justify any new dependency or abstraction before adding it to `package.json`. Upgrade React only when requested.
- Preserve deployment base paths, accessibility, responsive behavior, theme parity, and loading, empty, and error states. Keep user-facing copy English-only (localization is not configured in this repository).
- Colocate tests with the modules they exercise and verify documentation against actual source and configuration.

## Documentation

Read only the guides relevant to the task and the checks it needs. The `docs/*.md` files hold domain-agnostic engineering standards for this stack (Vite 8, React 19, Hono, Zod v4, TanStack Query v5, Zustand, and Supabase/PostgreSQL 17, with optional-layer scope noted where applicable); treat rules not yet retrofitted in existing source or SQL files as target standards for new and hardened work rather than already-implemented guarantees, including:

- Trusted-proxy IP checks, rate-limiter bucket eviction, and per-account login throttling
- Dedicated receipt signing secrets (instead of passing `SUPABASE_SERVICE_ROLE_KEY` directly into HMAC)
- Transactional `UPSERT` baseline resets and single-RPC stage counts
- PostgreSQL `23505` unique-slug collision handling and cross-URL (relative + absolute) storage reference cleanup
- Redacting raw `err.message` on unhandled `500` server error logs

- [Architecture](docs/architecture.md) — Layering, dependency boundaries, routing, and deployment
- [Coding standards](docs/coding-standards.md) — TypeScript, naming, imports, and code quality
- [Feature structure](docs/feature-structure.md) — Feature layout, module ownership, and translations
- [State management](docs/state-management.md) — Local, client, server, form, and URL state defaults
- [API design](docs/api-design.md) — API clients, queries, mutations, errors, and server routes
- [Database and storage](docs/database-and-storage.md) — PostgreSQL schema, migrations, RLS, RPCs, storage, and seeds
- [Component guidelines](docs/component-guidelines.md) — Components, hooks, styling, and accessibility
- [Performance](docs/performance.md) — Profiling, complexity, rendering, and bundle costs
- [Testing strategy](docs/testing-strategy.md) — Test design, validation matrix, and release checks
- [Security](docs/security.md) — Authentication, credentials, private data, and trust boundaries

## Skills

Workflow-focused, stack- and repo-agnostic agent skills live under `.agents/skills/`. Each `SKILL.md` discovers conventions from `AGENTS.md`, `docs/`, and project manifests/configs, loading stack-specific playbooks in `references/` only when the matching stack is present. Use an available skill when its workflow fits the task.

## Validation

Run authorized checks from the repository root. Use `npm ci` for locked installs from `package-lock.json`.

- Root scripts in [package.json](package.json) include `npm run lint`, `npm run format:check`, `npm run test`, `npm run typecheck`, `npm run build`, and local Supabase commands (`npm run db:start`, `npm run db:reset`, `npm run db:lint`, `npm run db:status`, `npm run db:stop`).
- Run a single test file against its owning workspace, for example `npm run test --workspace=@eight-burgers/web -- src/app/App.test.tsx` or `npm run test --workspace=@eight-burgers/api -- src/app.test.ts`, and start the built BFF with `npm run start --workspace=@eight-burgers/api`.
- For documentation-only edits, check changed files with `npx --no-install prettier --check <changed-files>` and verify relative links and heading fragments. Use `npm.cmd` and `npx.cmd` if PowerShell blocks `.ps1` launchers.
- Summarize the changes and report checks actually run, failures, skipped checks, unverified assumptions, and any remaining issues.

## Commits and Pull Requests

Use short lowercase commit subjects and add a scope when helpful. Pull requests should explain the change and user impact, record validation results, link the relevant issue, and include screenshots for visible UI changes.
