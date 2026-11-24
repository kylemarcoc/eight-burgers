# Repository Agent Instructions

## Project Context

This repository (`menu-kiosk`) is a white-label F&B ordering storefront, Staff Portal, REST BFF, and PostgreSQL 17 backend organized as an npm-workspaces monorepo (`apps/*`, `packages/*`) using contract-driven TypeScript, validated with Vitest, React Testing Library, Oxlint, Prettier, and local Supabase CLI:

- `apps/web` (`@menu-kiosk/web`): Vite 8 + React 19 + Tailwind CSS v4 frontend SPA under `apps/web/src/{app,routes,features,shared}/`. Local dev proxy in `apps/web/vite.config.js` forwards `/api`, `/healthz`, and `/readyz` to `:8787` and `/storage` to `:55321`. Global theme tokens in `apps/web/src/app/styles/globals.css` expose semantic `--ui-*` CSS variables and `ui-*` utilities toggled via root `data-ui-theme` (`light` / `dark`), with DB-driven WCAG-AA accent variables applied by `ThemeProvider` and restored pre-paint from `localStorage`.
- `apps/api` (`@menu-kiosk/api`): Hono REST BFF under `apps/api/src/{config,middleware,routes,lib}/` with `mk_access_token` / `mk_refresh_token` `HttpOnly` session cookies, dedicated HMAC receipt signing (`RECEIPT_SIGNING_SECRET`, `mk-receipt:` prefix), trusted-proxy IP extraction (`TRUST_PROXY`), bounded sliding-window rate limiting with per-account login throttling, Sharp WebP optimization (including lossless `payment-qr` uploads and cross-URL orphan cleanup across `menu_items` and `store_settings`), redacted unhandled `500` error logs, and `ENABLE_DEMO_RESET`-gated transactional resets.
- `packages/contracts` (`@menu-kiosk/contracts`): Pure shared Zod v4 contracts, WCAG-AA theme accent token helpers, dynamic category/option validation, `"From ₱X"` display pricing, and delivery pricing math under `packages/contracts/src/` with zero runtime dependency on `apps/web` or `apps/api`. `packages/contracts/tsconfig.json` includes `"lib": ["ES2022", "DOM"]` so pure helpers can call standard Web APIs (such as `URL`) without `@types/node`, while `.oxlintrc.json` blocks UI and server imports.
- `supabase/`: PostgreSQL 17 declarative `migrations/`, Row-Level Security (RLS) policies, `01_`-prefixed column-level role-guard triggers (`trg_store_settings_01_role_guard`, `trg_menu_items_01_role_guard`, `trg_option_choices_01_role_guard`, `trg_orders_01_role_guard`), `SECURITY DEFINER` SQL RPCs (`place_order`, `submit_payment_reference_by_receipt`, `cancel_order_by_receipt`, `cancel_public_order_by_queue`, `get_admin_order_stage_counts`, `reset_demo_catalog`), Storage bucket configuration, and environment-split `seeds/` (`catalog.sql`, `blank.sql`, `dev_admin.sql`).
- `scripts/init-shop.mjs` (`npm run shop:init`): REST-only interactive & non-interactive shop/Owner bootstrap CLI operating over Supabase Auth Admin and PostgREST APIs (no `psql` required).
- `scripts/capture-screenshots.mjs` (`npm run screenshots`): Deterministic Playwright + Sharp WebP screenshot generator capturing all 13 `1440x900` Light-theme README views into `docs/screenshots/`. Use `http://localhost:5173` (never `127.0.0.1:5173`) for local browser flows and scripts so `Origin` matches the API `APP_ORIGIN` CSRF policy.
- **Documented `shared/` exception:** In `apps/web/src/shared/`, `shared/shop/`, `shared/components/FoodImage.tsx`, and `shared/store/useCartStore.ts` hold cross-feature storefront and admin domain helpers alongside feature-independent primitives (`ErrorBoundary.tsx`, `shared/lib/`).

## Development Principles

- Inspect the working tree, root and workspace `package.json` files, framework and TypeScript configurations, `.oxlintrc.json`, and relevant source and tests before editing. Preserve unrelated edits, working behavior, and public APIs unless the task calls for a change.
- Keep frontend feature logic, tests, and public APIs inside `apps/web/src/features/<feature>/`, exposed via `index.ts`.
- Keep `apps/web/src/shared/` independent of `app/`, `routes/`, `features/`, and backend server code.
- Keep `apps/api/src/` independent of `apps/web` UI modules, keep `packages/contracts/src/` pure and independent of both frontend and server runtimes, and evolve database schemas via append-only migrations in `supabase/migrations/`.
- Make incremental changes. Follow nearby patterns, reuse existing utilities, and justify any new dependency or abstraction before adding it to `package.json`. Upgrade React only when requested.
- Preserve deployment base paths, accessibility, responsive behavior, theme parity, and loading, empty, and error states. Keep user-facing copy English-only (localization is not configured in this repository) and brand-neutral across all production code paths.
- Colocate tests with the modules they exercise and verify documentation against actual source and configuration.

## Documentation

Read only the guides relevant to the task and the checks it needs. The `docs/*.md` files hold domain-agnostic engineering standards for this stack (Vite 8, React 19, Hono, Zod v4, TanStack Query v5, Zustand, and Supabase/PostgreSQL 17, with optional-layer scope noted where applicable):

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

- Root scripts in [package.json](package.json) include `npm run lint`, `npm run format:check`, `npm run test`, `npm run typecheck`, `npm run build`, `npm run shop:init`, `npm run screenshots`, and local Supabase commands (`npm run db:start`, `npm run db:reset`, `npm run db:lint`, `npm run db:status`, `npm run db:stop`).
- Run a single test file against its owning workspace, for example `npm run test --workspace=@menu-kiosk/web -- src/app/App.test.tsx` or `npm run test --workspace=@menu-kiosk/api -- src/app.test.ts`, and start the built BFF with `npm run start --workspace=@menu-kiosk/api`.
- For documentation-only edits, check changed files with `npx --no-install prettier --check <changed-files>` and verify relative links and heading fragments. Use `npm.cmd` and `npx.cmd` if PowerShell blocks `.ps1` launchers.
- Summarize the changes and report checks actually run, failures, skipped checks, unverified assumptions, and any remaining issues.

## Commits and Pull Requests

Use short lowercase commit subjects and add a scope when helpful. Pull requests should explain the change and user impact, record validation results, link the relevant issue, and include screenshots for visible UI changes.
