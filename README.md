# Eight Burgers (Chino Roces Avenue)

MVP ordering storefront and owner menu manager for **8Burgers — Chino Roces Avenue, Makati**, built with React 19, TypeScript, Vite 8, Tailwind CSS v4, React Router, Zustand, Immer, Vitest, Oxlint, and Prettier.

## Implemented Capabilities

- **Storefront (`/`)**: Self-hosted WebP menu imagery (`public/images/menu/` with route-scoped hero preloading on `/`), category filtering (_Classic Burgers_, _Specialty Burgers_, _Heavyweights & Sandwiches_, _Sides & Snacks_), keyword search, in-stock filter, optional burger add-ons (_Sliced Cheese +₱20_, _Crispy Bacon +₱20_, _Extra Veggies +₱26_, _Grilled Pineapple +₱26_), and instant add-to-cart actions.
- **Bottom-Right Floating Cart & React Portal Drawer**: Fixed bottom-right cart launcher showing live item count and `₱` subtotal, opening a right-side sliding drawer rendered via `createPortal(..., document.body)` with quantity steppers, item removal, checkout form, itemized queue ticket receipts, and order handoff actions (**Copy Order Summary** via Clipboard API with fallback status, **Send via SMS**, and **Open Facebook Page**).
- **Owner Admin (`/admin`) & Lazy Routing**: Lazy-loaded `/admin` (`AdminPage` + `AdminCatalogManager`) and `*` fallback (`NotFoundPage`) routes wrapped in `RouteErrorBoundary` and `Suspense` with `sessionStorage`-guarded `vite:preloadError` single-retry recovery (`eight-burgers:preload-retried`). Supports creating, editing, toggling sold-out status, or removing menu items (with image URL preview and presets), restoring the default Chino Roces menu, and updating incoming customer order statuses.
- **Client-Only Browser Persistence & Threat Model**: Because this MVP runs without a backend server, `src/shared/store/useShopStore.ts` (Zustand `persist` + `immer`) persists menu listings, active cart items, queue sequence, and placed orders (including guest name, mobile contact number, and Makati delivery address/notes) locally under `localStorage` key `eight-burgers:state:v1`, sanitizing hydrated payloads from `unknown`. Theme preference (`light` / `dark`) persists under `eight-burgers-theme`. Do not store credentials or payment secrets in browser storage.

## Technology stack

- **Frontend** — React 19, TypeScript, Vite 8, Tailwind CSS v4, React Router, Zustand, and Immer.
- **Testing & tooling** — Vitest and React Testing Library, Oxlint, and Prettier.

## Install

Use Node.js **22.22.2+** (matching [CI](./.github/workflows/ci.yml)) and npm.

Install dependencies from the repository root:

```sh
npm ci
```

Use `npm install` when updating dependencies. If PowerShell blocks the `npm` or `npx` launchers, use `npm.cmd` or `npx.cmd`.

## Environment configuration

Public build-time flags are documented in [.env.example](./.env.example):

- `VITE_HIDE_PUBLIC_ADMIN` (`false` by default): Set to `true` in hosting/production environments (or `.env.production.local`) to hide the `"Owner Admin"` navigation link in the header. This is a **public UI visibility toggle only**, not authentication—`/admin` remains directly routable until server-backed authentication is introduced. Keep local `.env.local` overrides gitignored and verify they do not unintentionally alter production preview/release builds.

## Development

Run the local development server from the repository root:

```sh
npm run dev
```

Open <http://localhost:5173/> in a browser.

## Project structure

```text
public/
  images/menu/          self-hosted WebP hero banner and menu photos
src/
  app/                  bootstrap, layout shell, router, providers, and global styles
  routes/               page composition and route-specific UI (/, /admin, and * fallback)
  features/             domain capabilities (menu-catalog, cart-portal) with index.ts entry points
  shared/               feature-independent UI, seed data, storage helpers, and Zustand store (store/useShopStore.ts)
docs/                   engineering guides
.agents/skills/         repo-agnostic agent skills
```

## Checks and builds

| Command                | Purpose                         |
| ---------------------- | ------------------------------- |
| `npm run lint`         | Lint the repository with Oxlint |
| `npm run format:check` | Check formatting with Prettier  |
| `npm run test`         | Run Vitest suites               |
| `npm run typecheck`    | Run TypeScript type-checking    |
| `npm run build`        | Create production build output  |
| `npm run preview`      | Serve the built Vite preview    |
| `npm run format`       | Format repository files         |

[CI](./.github/workflows/ci.yml) runs on pull requests targeting `main` and pushes to `main`. It installs from the lockfile with `npm ci`, then runs `lint`, `format:check`, `test`, `typecheck`, and `build`.

## Documentation

- [Architecture](./docs/architecture.md) — Layering, boundaries, routing, and deployment
- [Coding standards](./docs/coding-standards.md) — TypeScript, naming, imports, and formatting
- [Feature structure](./docs/feature-structure.md) — Feature ownership, public APIs, and translations
- [State management](./docs/state-management.md) — Local, client, server, form, and URL state
- [API design](./docs/api-design.md) — API clients, queries, mutations, and server routes
- [Component guidelines](./docs/component-guidelines.md) — Reusable UI, hooks, and accessibility
- [Performance](./docs/performance.md) — Profiling, complexity, rendering, and loading limits
- [Testing strategy](./docs/testing-strategy.md) — Test coverage, local checks, CI, and release checks
- [Security](./docs/security.md) — Authorization, credentials, and data handling

## Contributing

Use short lowercase commit subjects.
Complete the checklist in [the pull request template](./.github/PULL_REQUEST_TEMPLATE.md), record checks actually run, and include screenshots for visible UI changes.
For AI-assisted development, start with [AGENTS.md](./AGENTS.md) and open the guides relevant to the task.
