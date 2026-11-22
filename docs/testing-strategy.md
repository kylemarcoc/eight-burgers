# Testing strategy

Use the smallest test that can catch a meaningful failure. Prioritize user-visible behavior, business invariants, and realistic failure and recovery paths. Add regression coverage for confirmed bugs at the layer that can reproduce them. Cover a behavior at multiple layers only when each check protects a different boundary. See [AGENTS.md](../AGENTS.md) for project instructions.

## Tooling by environment

Inspect root and workspace `package.json` and Vite/Vitest configs for installed versions and test environment defaults:

- **`apps/web` (`jsdom` via `apps/web/vite.config.*`):** Vitest + React Testing Library. Import Vitest APIs explicitly (`afterEach`, `describe`, `expect`, `it`, `vi`), call `afterEach(cleanup)`, and use `fireEvent` unless `@testing-library/user-event` is installed. Share reusable test providers (such as a fresh `QueryClient` provider wrapper and API doubles) under `apps/web/src/shared/test/`.
- **`apps/api` (`node` via `apps/api/vite.config.*`):** Hono HTTP middleware and route tests (for example, `apps/api/src/app.test.ts`) using `createApp(deps)` with an in-memory backend gateway test double (independent of Docker or live Supabase credentials).
- **`packages/contracts` (Vitest default `node` environment):** Pure Zod schema, domain invariant, and helper unit tests (`*.test.ts`).

If adopting `@testing-library/user-event`, declare it in the owning `package.json`, create a `userEvent.setup()` instance per test, and await its interactions. See [Testing Library user-event](https://testing-library.com/docs/user-event/intro/).

## Unit, integration, and end-to-end coverage

| Layer             | Choose it when                                                                                                            | Reference pattern                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Unit              | A pure rule, calculation, parser, schema, rate limiter, or path helper can be checked with inputs and observable outputs. | Colocated `<module>.test.ts` exercising `packages/contracts/src/` or `apps/api/src/lib/`.          |
| Component         | A React component owns accessible markup, interaction, focus, or a meaningful UI state.                                   | Colocated `ComponentName.test.tsx` checking roles, accessible names, and user actions.             |
| API / Integration | Behavior depends on routes + middleware + validation (`apps/api`), or a React route + TanStack Query + router + store.    | Colocated API integration tests against `createApp(deps)` or route/feature tests with mocked HTTP. |
| Database / E2E    | Behavior depends on live PostgreSQL 17 SQL, RLS policies, triggers, `SECURITY DEFINER` RPCs, or real browser wiring.      | Local `npm run db:reset` + `npm run db:lint` plus manual [release checks](#release-checks).        |

## Test organization

Colocate unit, route, API, and component tests with their source and match the module's stem:

- Use `ComponentName.test.tsx` for React components and routes under `apps/web/src/`.
- Use `kebab-case.test.ts` (or `useSomething.test.ts(x)`) for utilities, API adapters, contracts, hooks, and backend routes/helpers under `apps/*/src/` and `packages/*/src/`.
- Keep reusable web test wrappers and HTTP doubles in `apps/web/src/shared/test/` only when multiple suites need them, and keep future Playwright specs in `e2e/` (`*.spec.ts`).

See [Feature structure](feature-structure.md#ui-hooks-state-and-tests), [Coding standards](coding-standards.md#naming), and [Architecture](architecture.md#imports-and-cross-feature-communication).

```ts
import { expect, it } from 'vitest';
import { calculateTotal } from './pricing-totals';

it('sums line items and applies a valid percentage discount', () => {
  expect(calculateTotal([{ priceCents: 1000, quantity: 2 }], 10)).toBe(1800);
});
```

## Frontend validation

### Components and hooks

- Exercise interactions and assert the visible result, accessible state, or public callback. Cover loading, empty, error, and success when the component owns those states. Use roles with accessible names and labels for form controls. Scope repeated controls with `within`.
- Use `getByRole` for present elements, `findBy*` (in `async` tests) for asynchronous appearance and `React.lazy` route/panel resolution, and `queryBy*` for absence. Use `waitFor` for assertions without a matching query, triggering actions outside `waitFor`. [Testing Library queries](https://testing-library.com/docs/queries/about/).
- Test hooks through a consuming component or `renderHook` with required providers (`wrapper`). Assert cleanup when cancellation or unmount matters. [React Testing Library API](https://testing-library.com/docs/react-testing-library/api/).

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(cleanup);

it('calls onAction when activated', () => {
  const onAction = vi.fn();
  render(
    <button type="button" onClick={onAction}>
      Save changes
    </button>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(onAction).toHaveBeenCalledOnce();
});
```

### APIs, state, and forms

- Exercise frontend request adapters against realistic transport responses, verifying inputs, normalization, malformed data, timeouts, cancellation (`AbortSignal`), `Retry-After` parsing, and `400`/`401`/`403`/`404`/`409`/`422`/`429` error handling. [API design](api-design.md#testing), [Security](security.md#authentication-and-authorization).
- Render stateful features with fresh providers, fresh `QueryClient` (`retry: false` when not testing retries), and reset Zustand stores per test. [State management](state-management.md#testing-and-incremental-adoption).
- Drive forms through labeled inputs and submit controls, verifying validation errors, pending state, optimistic-lock `409` recovery, submission failure preservation, and resets.

### Accessibility and browser review

Use semantic queries and check keyboard activation, tab order, visible focus, dialog focus entry and restoration, labels, and how validation or async results are announced. Inspect visible UI changes in a real browser at narrow and wide viewports across supported themes, and report unrun browser or assistive-technology checks honestly. [Component guidelines](component-guidelines.md#interaction-and-accessibility).

## Backend and database validation

- **Hono routes & middleware (`apps/api/src/`):** Test via `app.request(...)` on `createApp({ config, gateway, ... })` covering Zod input validation, CSRF and origin checks, rate-limit `429` + `Retry-After`, cookie attributes and single-flight refresh deduplication, idempotent replay vs `409` conflict/optimistic locking, capability token isolation (`404` on mismatch), upload bounds (`400`/`413`/`415`), and RFC 9457 `application/problem+json` envelopes. See [API design](api-design.md) and [Security](security.md).
- **Database migrations, RLS & RPCs (`supabase/`):** Validate schema resets and PL/pgSQL linting locally with `npm run db:reset` and `npm run db:lint` when Docker + Supabase CLI are available. Keep in-memory backend gateway test doubles aligned with real SQL semantics and clearly report when SQL/RLS changes could not be run against a live PostgreSQL instance. See [Database and storage](database-and-storage.md#verification).

## Mocking and test data

- Substitute external I/O at one boundary per test—such as a stubbed `globalThis.fetch`, an in-memory backend gateway test double, or an isolated local Supabase instance. Keep collaborating code real in integration tests. [Vitest mocking](https://vitest.dev/guide/mocking).
- Use synthetic non-sensitive fixtures, restore spies and globals, and clear storage, caches, and timers after each test.

## Coverage and anti-patterns

| Fragile check                                                                       | Prefer                                                                                                                   |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Assert a private state setter, spy on React internals, or snapshot an entire route. | Assert the visible result or public contract. Reserve small snapshots for stable, intentional output.                    |
| Stub every collaborator in an integration test.                                     | Replace the remote boundary and let the feature, providers, and data mapping run.                                        |
| Sleep after a click or find a field by a CSS class and array index.                 | Query by role or label and await the resulting state. Advance a controlled clock only when time is part of the behavior. |
| Depend on a previous test's room, session, or mock response.                        | Create fresh data and restore state after each test.                                                                     |
| Repeat the same expected result at every layer.                                     | Put the rule in the smallest capable test and reserve broad checks for the wiring they uniquely exercise.                |
| Let fake backend gateway doubles drift from PostgreSQL RPC/RLS behavior.            | Mirror real SQL checks, errors, and state transitions in gateway test doubles and verify with `db:reset` / `db:lint`.    |

## Project checks

See [README.md](../README.md) and [AGENTS.md](../AGENTS.md) for workspace names, full command tables, and local server URLs. Start with affected checks:

- Run a single test file against its owning workspace (checking `AGENTS.md` or workspace `package.json` for exact workspace names), for example:
  `npm run test --workspace=<web-workspace> -- <workspace-relative-test-path>`.
- Run `npm run lint`, `npm run format:check`, `npm run test`, `npm run typecheck`, and `npm run build` before finalizing changes. Use `npm.cmd` and `npx.cmd` on Windows PowerShell if `.ps1` launchers are blocked.

## Choosing checks

| Change                               | Required checks                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Documentation only                   | Prettier on changed files; verify relative file links and heading fragments                     |
| Frontend feature or component change | Affected frontend tests, `lint`, `typecheck`, `build`; inspect visible UI changes in browser    |
| Backend route, gateway, or contracts | Full `lint`, `format:check`, `test`, `typecheck`, and `build` across all workspaces             |
| Database migrations, RLS, or RPCs    | `npm run db:reset` and `npm run db:lint` (with local Supabase) plus full CI checks              |
| Build tooling or deployment          | Full `lint`, `format:check`, `test`, `typecheck`, and `build`; verify base-path & proxy routing |

## CI coverage and handoff

[CI](../.github/workflows/ci.yml) runs on pull requests targeting `main` and on pushes to `main`. It installs from `package-lock.json` with `npm ci`, then runs `npm run lint`, `npm run format:check`, `npm run test`, `npm run typecheck`, and `npm run build` without requiring Docker or live Supabase credentials.

Before handing off:

- Review the diff for unintended changes, generated files, and unrelated edits. Format only changed files.
- Report commands actually run and their outcomes honestly, separating environment/sandbox blocks (such as unavailable Docker/Supabase daemons) from code failures and reporting unverified browser or live-host checks clearly.

## Release checks

Check each built app at its target base path and verify backend connectivity; record any checks not run:

- Start the built API (`npm run start --workspace=<api-workspace>`) and local preview (`npm run preview`) or full production stack, and probe configured health and readiness endpoints (for example, `/healthz` and `/readyz`).
- Reload deep routes, inspecting console and network panels for missing scripts, styles, API/storage proxy failures, or base-path errors.
- Verify narrow and wide layouts, configured color themes and persistence, and end-to-end interactive flows (primary user workflows, status polling, authenticated mutations, and error recovery).
- Verify interactive forms, error recovery, and dialog keyboard accessibility as described in [Component guidelines](component-guidelines.md#interaction-and-accessibility).
- Verify unknown-route fallbacks and deployment routing rules from [Routing and deployment](architecture.md#routing-and-deployment).
