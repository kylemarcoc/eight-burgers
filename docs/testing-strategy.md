# Testing strategy

Use the smallest test that can catch a meaningful failure. Prioritize user-visible behavior, business invariants, and realistic failure and recovery paths. Add regression coverage for confirmed bugs at the layer that can reproduce them. Cover a behavior at multiple layers only when each check protects a different boundary. See [AGENTS.md](../AGENTS.md) for project instructions.

## Tooling by environment

Inspect `package.json` and test configs for installed versions and test environment defaults.

- **Vitest + React Testing Library (`jsdom`):** Import Vitest APIs explicitly (`afterEach`, `describe`, `expect`, `it`, `vi`), call `afterEach(cleanup)`, and use `fireEvent` unless `@testing-library/user-event` is explicitly installed.

If adopting `@testing-library/user-event`, declare it in `package.json`, create a `userEvent.setup()` instance per test, and await its interactions. See [Testing Library user-event](https://testing-library.com/docs/user-event/intro/).

## Unit, integration, and end-to-end coverage

| Layer              | Choose it when                                                                                                                          | Reference pattern                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Unit               | A pure rule, calculation, parser, schema, or reducer can be checked with inputs and observable outputs.                                 | Colocated `<module>.test.ts` exercising pure domain rules or Zod schemas.                      |
| Component          | A component owns accessible markup, interaction, focus, or a meaningful UI state.                                                       | Colocated `ComponentName.test.tsx` checking roles, accessible names, and user actions.         |
| Integration        | A regression depends on modules working together, such as a route and its providers, a form and adapter, or a workflow and persistence. | Route tests wrapping providers/router, or server tests combining actions and isolated storage. |
| Browser end to end | A critical journey depends on real navigation, browser behavior, or service wiring.                                                     | Manual [release checks](#release-checks) (or an opted-in Playwright suite when justified).     |

## Test organization

Colocate unit and component tests with their source and match the module's stem. Use `ComponentName.test.tsx` in Vite apps, and match the owning module's filename casing. Use `kebab-case.test.ts` for new utility and API modules. Keep reusable test helpers in `src/test/` only when multiple suites need them, and keep future Playwright specs in `e2e/` (`*.spec.ts`).

See [Feature structure](feature-structure.md#ui-hooks-state-and-tests), [Coding standards](coding-standards.md#naming), and [Architecture](architecture.md#imports-and-cross-feature-communication).

```ts
import { expect, it } from 'vitest';
import { calculateOrderTotal } from './order-totals';

it('sums line items and applies a valid percentage discount', () => {
  expect(calculateOrderTotal([{ priceCents: 1000, quantity: 2 }], 10)).toBe(1800);
});
```

## Frontend validation

### Components and hooks

- Exercise interactions and assert the visible result, accessible state, or public callback. Cover loading, empty, error, and success when the component owns those states. Use roles with accessible names and labels for form controls. Scope repeated controls with `within`.
- Use `getByRole` for present elements, `findBy*` for asynchronous appearance, and `queryBy*` for absence. Use `waitFor` for assertions without a matching query, triggering actions outside `waitFor`. [Testing Library queries](https://testing-library.com/docs/queries/about/).
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

- Exercise request adapters against realistic transport responses, verifying inputs, normalization, malformed data, cancellation, and `401`/`403`/`404` error handling. [API design](api-design.md#testing), [Security](security.md#authentication-and-authorization).
- Render stateful features with fresh providers, fresh `QueryClient` (`retry: false` when not testing retries), and reset stores per test. [State management](state-management.md#testing-and-incremental-adoption).
- Drive forms through labeled inputs and submit controls, verifying validation errors, pending state, submission failure recovery, and resets.

### Accessibility and browser review

Use semantic queries and check keyboard activation, tab order, visible focus, dialog focus entry and restoration, labels, and how validation or async results are announced. Inspect visible UI changes in a real browser at narrow and wide viewports across supported themes, and report unrun browser or assistive-technology checks honestly. [Component guidelines](component-guidelines.md#interaction-and-accessibility).

## Mocking and test data

- Substitute external I/O at one boundary per test—such as an injected transport double, a restored `fetch` stub, or an isolated test database. Keep collaborating code real in integration tests. [Vitest mocking](https://vitest.dev/guide/mocking).
- Use synthetic non-sensitive fixtures, restore spies and globals, and clear storage, caches, and timers after each test.

## Coverage and anti-patterns

| Fragile check                                                                       | Prefer                                                                                                                   |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Assert a private state setter, spy on React internals, or snapshot an entire route. | Assert the visible result or public contract. Reserve small snapshots for stable, intentional output.                    |
| Stub every collaborator in an integration test.                                     | Replace the remote boundary and let the feature, providers, and data mapping run.                                        |
| Sleep after a click or find a field by a CSS class and array index.                 | Query by role or label and await the resulting state. Advance a controlled clock only when time is part of the behavior. |
| Depend on a previous test's room, session, or mock response.                        | Create fresh data and restore state after each test.                                                                     |
| Repeat the same expected result at every layer.                                     | Put the rule in the smallest capable test and reserve broad checks for the wiring they uniquely exercise.                |

## Project checks

See [README.md](../README.md#checks-and-builds) and [Development](../README.md#development) for check commands and local server URLs. Start with affected checks:

- Run `npm run test -- src/app/App.test.tsx` to execute a single test file quickly.
- Run `npm run lint`, `npm run format:check`, `npm run test`, `npm run typecheck`, and `npm run build` before finalizing changes.
- Format changed files with `npx --no-install prettier --write <changed-files>`. Use `npm.cmd` and `npx.cmd` on Windows PowerShell if `.ps1` launchers are blocked.
- For documentation-only changes, check formatting (`npx --no-install prettier --check <changed-files>`) and verify relative file links and heading fragments.

## Choosing checks

| Change                        | Required checks                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| Documentation only            | Prettier on changed files; verify relative file links and heading fragments            |
| Feature or component change   | Affected tests, lint, typecheck, and build; inspect visible UI changes in a browser    |
| Shared exports or root config | Full `lint`, `format:check`, `test`, `typecheck`, and `build` across all packages/apps |
| Build tooling or deployment   | Full `lint`, `format:check`, `test`, `typecheck`, and `build`; verify base-path output |

## CI coverage and handoff

[CI](../.github/workflows/ci.yml) runs on pull requests targeting `main` and on pushes to `main`. It installs from `package-lock.json` with `npm ci`, then runs `npm run lint`, `npm run format:check`, `npm run test`, `npm run typecheck`, and `npm run build`.

Before handing off:

- Review the diff for unintended changes, generated files, and unrelated edits. Format only changed files.
- Report commands actually run and their outcomes honestly, separating environment/sandbox blocks from code failures and reporting unverified browser or live-host checks clearly.

## Release checks

Check each built app at its target base path and record any checks not run:

- Serve built output locally (`npm run preview`) and reload deep routes, inspecting console and network panels for missing scripts, styles, or base-path errors.
- Verify narrow and wide layouts, theme toggling/persistence (where supported), and configured locales (in localized apps).
- Verify interactive forms, error recovery, and dialog keyboard accessibility as described in [Component guidelines](component-guidelines.md#interaction-and-accessibility).
- Verify unknown-route fallbacks and deployment routing rules from [Routing and deployment](architecture.md#routing-and-deployment).
