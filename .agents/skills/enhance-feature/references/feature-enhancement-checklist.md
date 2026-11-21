# Feature Enhancement Checklist & Validation

Use this reference when enhancing, hardening, or cleaning up an existing feature or React component.

## 1. Common enhancement focus areas

- **State & effect hygiene**:
  - Eliminate duplicated sources of truth (replace state-syncing `useEffect` blocks with render-time derivation, pure selectors, key-based resets (`key={id}`), or prop-derived fallback state such as `failedSrc === src` for resilient media fallbacks).
  - Keep `useReducer` transitions pure, deterministic, and unit-testable with discriminated union actions.
  - Keep ephemeral UI flags out of persisted client stores (or `partialize` durable slices only), sanitize hydrated payloads from `unknown`, and handle storage quota or unavailable-storage errors cleanly.
  - Guard against race conditions: cancel superseded requests via `AbortSignal`, ignore stale async responses after reset/unmount/revision change, and revoke created object URLs on cleanup.
- **Validation & error recovery**:
  - Parse untrusted external payloads from `unknown` at the adapter or action boundary before mapping to domain types.
  - Surface clear, user-safe errors without leaking stack traces, raw schema dumps, credentials, signed URLs, or private payloads.
  - Preserve user edits on submission failures and block duplicate submits while pending.
- **UX edge states & accessibility**:
  - Verify loading, empty, error, disabled, and confirmation states at narrow and wide viewports.
  - Ensure visible labels, `aria-invalid`/`aria-describedby` error wiring, keyboard accessibility, focus restoration on modals, and `role="status"` / `role="alert"` announcements (including graceful fallback feedback when browser APIs such as `navigator.clipboard.writeText` are unavailable or denied).
- **Evidence-based performance**:
  - Separate data-computation cost from DOM rendering cost before optimizing.
  - Evaluate virtualization or lazy boundaries only when measurements justify them.

## 2. Stack-specific guardrails

### Vite + React

- **Routing & URL state**: Keep `BrowserRouter` base path (`import.meta.env.BASE_URL`) and subpath-safe `public/` asset URLs intact when React Router is used. Validate and default `useSearchParams` at the route boundary and preserve unrelated params on update. Avoid nested `<main>` landmarks inside layout `<Outlet />` routes.
- **Forms & adapters**: Keep simple forms lightweight and use typed `defaultValues` + `isSubmitting` protection when using React Hook Form. Keep HTTP/realtime transport logic inside `src/features/<feature>/api/` with clean subscription teardown.
- **Localization & theme**: If `i18next` locale resources exist, update every configured locale file together for all visible text, accessible labels, and validation/status messages. Verify light and dark theme parity when `ThemeProvider` is used.
- **Testing**: Colocate `*.test.ts(x)` files with explicit Vitest imports (`afterEach`, `describe`, `expect`, `it`, `vi`), `afterEach(cleanup)`, `async`/`findBy*` assertions for lazy-loaded routes/panels, fresh router/i18n/store providers per test, and injected transport doubles.

## 3. Oxlint & architectural boundaries (`.oxlintrc.json`)

Every modified file must satisfy:

- **Feature barrel discipline (`no-restricted-imports`)**: Outside a feature, import only from `@/features/<name>`. Inside `src/features/<name>/`, use relative sibling imports (`./...`, `../...`) and never import your own `index.ts` (`import/no-cycle`).
- **One-way layering (`no-restricted-imports`)**:
  - `src/{features,lib,server}/**/*` must not import from `app/` or `routes/`.
  - `src/shared/**/*` must not import from `app/`, `features/`, or `routes/`.
- **Hooks & type safety**: Respect `react/rules-of-hooks`, `react/only-export-components`, `jsx-a11y/alt-text`, `typescript/no-explicit-any`, and `typescript/no-non-null-assertion`.

## 4. Verification command matrix

Run from the repository root. Use `npm.cmd` and `npx.cmd` on Windows PowerShell if `.ps1` launchers are blocked.

### Format changed files only

```sh
npx --no-install prettier --write <changed-files>
npx --no-install prettier --check <changed-files>
```

### Full check suite

```sh
npm run lint
npm run format:check
npm run test
npm run typecheck
npm run build
```
