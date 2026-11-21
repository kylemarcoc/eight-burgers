# Vite + React Feature Checklist

Use this checklist when adding a feature to a Vite + React application. Inspect `package.json`, `vite.config.*`, and `src/app/` before editing to confirm exact installed dependencies and conventions.

## 1. Discover configuration

Check these locations before designing the slice:

| Concern         | Where to inspect in `src`                                                       |
| --------------- | ------------------------------------------------------------------------------- |
| Package & stack | `package.json` (installed router, form, i18n, state, and test libraries)        |
| Public base     | `vite.config.*` (`base`, `@` alias, dev/preview ports, Vitest environment)      |
| Providers       | `src/app/providers/` (theme, toast, i18n, query client providers if configured) |
| Routing         | `src/app/router/` and `src/routes/` (if multi-route with React Router)          |
| App-local code  | `src/shared/` (components, content, helpers, or cross-feature client stores)    |
| Translations    | `src/app/locales/` or `src/app/i18n.*` (only if `i18next` is configured)        |

## 2. Routing and composition

- Keep `BrowserRouter` `basename={import.meta.env.BASE_URL}` (when React Router is used) intact so subpath deployments continue to work.
- Keep small, single-route UI colocated under `src/routes/<PageName>/` (or `src/app/`). Create `src/features/<kebab-case-name>/` with a public `index.ts` when the capability has independent business logic, external/realtime state, or multiple route consumers.
- Compose sibling features in the owning route or `src/app/`, passing data via props and actions via callbacks.
- Respect any static-host SPA fallback rules (such as GitHub Pages `404.html` or Vercel rewrites) configured for the app.

## 3. State, API, and forms

- **Forms**: Prefer React Hook Form + Zod for complex forms and schema validation (keep simple forms on lightweight React state). Use typed `defaultValues`, `isSubmitting` protection, accessible `aria-invalid` / `aria-describedby` messages, and preserved input on failure.
- **External / realtime adapters**: Put transport logic in `src/features/<feature>/api/<kebab-case>.ts`. Validate incoming payloads from `unknown` with focused type guards or schemas before returning domain types, clean up subscriptions and forward `AbortSignal`, and keep credentials out of logs and public payloads. Treat `VITE_*` variables as public.
- **Feature state**: Start with `useState`, `useReducer`, and React Context. Introduce Zustand only when shared client state across distant components or features justifies it—place feature stores in `src/features/<feature>/store/` (or `src/shared/store/` for cross-feature stores, never `src/app/store/` for feature imports), with typed actions, focused selectors, and an explicit `reset` action.
- **Server state (when adopting HTTP caching)**: Prefer TanStack Query v5 (`QueryClientProvider` in `src/app/providers/`), serializable query keys, `skipToken`/`enabled` for conditional reads, `AbortSignal` forwarding, and `useMutation` for writes; never mirror remote query data into Zustand, Redux, or Context.
- **URL state**: Use `useSearchParams` (from `react-router-dom`) when filters, search, sorting, or pagination should survive reload or Back navigation; validate/default parameters at the route and preserve unrelated parameters.

## 4. Naming, styling, and translations

- Use `PascalCase.tsx` for component files, `useSomething.ts` for hook files, `kebab-case/` for feature folders, and `kebab-case.ts` for new API/utility files.
- Style with Tailwind CSS v4 utilities and semantic `--ui-*` / `ui-*` tokens.
- If the app uses `i18next`, add matching keys to **every** configured locale resource together for all user-visible text, accessible labels, validation errors, and status announcements. Keep English-only apps English-only.
- If the app provides theme or language controls, keep them functional on new routes and verify light and dark contrast.

## 5. Colocated tests

- Place `ComponentName.test.tsx` beside components/routes, `useSomething.test.ts(x)` beside hooks, and `<module>.test.ts` beside API/utility modules.
- Import Vitest APIs explicitly (`afterEach`, `describe`, `expect`, `it`, `vi`), call `afterEach(cleanup)`, and use Testing Library `fireEvent` (unless `@testing-library/user-event` is declared).
- Wrap route/hook tests in fresh router (`MemoryRouter`), i18n, and (when adopted) `QueryClient` (`retry: false` for non-retry scenarios) instances per test; reset Zustand stores, inject transport doubles, and restore mocks/stubs after each test.
