# Eight Burgers (Chino Roces Avenue)

MVP ordering storefront and owner menu manager for **8Burgers — Chino Roces Avenue, Makati**, built with React 19, TypeScript, Vite 8, Tailwind CSS v4, React Router, Vitest, Oxlint, and Prettier.

## Implemented Capabilities

- **Storefront (`/`)**: Category filtering (_Classic Burgers_, _Specialty Burgers_, _Heavyweights & Sandwiches_, _Sides & Snacks_), keyword search, in-stock filter, optional burger add-ons (_Sliced Cheese +₱20_, _Crispy Bacon +₱20_, _Extra Veggies +₱26_, _Grilled Pineapple +₱26_), and instant add-to-cart actions.
- **Bottom-Right Floating Cart & React Portal Drawer**: Fixed bottom-right cart launcher showing live item count and `₱` subtotal, opening a right-side sliding drawer rendered via `createPortal(..., document.body)` with quantity steppers, item removal, checkout form, and itemized queue ticket receipts.
- **Owner Admin (`/admin`)**: Create, edit, toggle sold-out status, or remove menu items (with image URL preview and presets), restore the default Chino Roces menu, and update incoming customer order statuses.
- **Browser Persistence**: Menu listings, active cart items, and placed orders persist under `localStorage` key `eight-burgers:state:v1`; theme preference (`light` / `dark`) persists under `eight-burgers-theme`.

## Technology stack

- **Frontend** — React 19, TypeScript, Vite 8, Tailwind CSS v4, and React Router.
- **Testing & tooling** — Vitest and React Testing Library, Oxlint, and Prettier.

## Install

Use Node.js **22.22.2+** (matching [CI](./.github/workflows/ci.yml)) and npm.

Install dependencies from the repository root:

```sh
npm install
```

Use `npm ci` once a `package-lock.json` is committed. If PowerShell blocks the `npm` or `npx` launchers, use `npm.cmd` or `npx.cmd`.

## Development

Run the local development server from the repository root:

```sh
npm run dev
```

Open <http://localhost:5173/> in a browser.

## Project structure

```text
src/
  app/                  bootstrap, layout, providers, and global styles
  routes/               page composition and route-specific UI (/ and /admin)
  features/             domain capabilities (menu-catalog, cart-portal) with index.ts entry points
  shared/               feature-independent UI, seed data, and shop state
docs/                   engineering guides
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
