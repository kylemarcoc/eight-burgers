# Vite + React Feature Checklist

> **Conditional stack playbook:** Load only when the repository uses Vite + React. Defer repository-specific conventions to `AGENTS.md` and `docs/` when present.

## 1. Inspect project configuration

- **Manifests & scripts (`package.json`):** Installed routing, query, state, validation, styling, and testing libraries plus workspace scripts.
- **Build & proxy (`vite.config.*`):** Configured public `base`, path aliases, dev proxies, and Vitest environment settings.
- **App entry & shell:** Entry module (`main.tsx`), router `basename`, layout `<main>` ownership, theme/query providers, and `vite:preloadError` recovery.

## 2. Vite + React routing & composition rules

- Keep router `basename` (e.g., `import.meta.env.BASE_URL`) and static `public/` asset URLs (`${import.meta.env.BASE_URL}...` / `%BASE_URL%`) subpath-safe.
- Keep single-route UI colocated with its route until an independent workflow or second route warrants a `features/<name>/` folder with a public `index.ts`.
- Keep one `<main>` landmark per rendered view (`<section>` / `<div>` inside routes when a shell owns `<main>`).
- Pair module-scope `React.lazy` splits with `<Suspense>` (`role="status"` space-preserving fallback) and a reusable `ErrorBoundary` (`role="alert"` + recovery), keeping any `vite:preloadError` reload guard single-retry via `sessionStorage`.

## 3. State, hooks, and styling

- Prefer pure render derivation, `useState`, `useReducer`, and `<Context value={...}>` before introducing external stores; pass `ref` directly as a prop on React 19+.
- Route browser calls through the repo HTTP client with `AbortSignal`, keep server cache in TanStack Query (never mirrored into Zustand), and sanitize hydrated storage payloads from `unknown` with zero secrets or PII persisted.
- Reuse configured semantic styling tokens/utilities across all active themes and follow existing single-language vs. localization patterns.

## 4. Colocated Vitest + Testing Library checks

- Colocate `*.test.ts` / `*.test.tsx` beside source modules; call `afterEach(cleanup)` explicitly, reset stores/storage, wrap tests in fresh router + `QueryClient` (`retry: false`), and await async `findBy*` queries for lazy routes/portals.
- Stub external I/O at one boundary per test (e.g., `globalThis.fetch` in browser tests; in-memory gateway doubles in backend route tests when a BFF exists).
