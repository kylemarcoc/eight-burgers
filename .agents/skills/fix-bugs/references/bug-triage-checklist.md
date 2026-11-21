# Bug Triage Checklist & Validation

Use this reference when diagnosing, reproducing, fixing, and verifying defects.

## 1. Root-cause diagnostic checklist by symptom class

- **State, effects, and async races**:
  - Check for stale closures capturing outdated props/state, missing `useEffect` dependency items, or state-syncing effects causing render loops or overwriting user edits.
  - Check for missing cleanup on unmount or parameter change: `AbortController`/`AbortSignal` for in-flight fetches, `clearTimeout`/`clearInterval`, event listener removal, subscription teardown, and `URL.revokeObjectURL`.
  - Check for out-of-order async responses overwriting newer state (use `AbortSignal` or monotonic request/revision guards).
  - Check for impure renders (mutating props/state/arrays in place or reading/writing `ref.current` during render) and missing or unstable list `key` values (avoid array indices when items reorder, insert, or delete).
  - Check persisted client stores for unvalidated `unknown` hydration payloads, schema-version drift, quota/storage-unavailable exceptions, or ephemeral flags accidentally persisted.
- **Data boundaries, validation, and error handling**:
  - Check external JSON, URL search params, storage entries, form payloads, and realtime/postMessage events for unguarded assumptions (`null`, `undefined`, `NaN`, empty arrays, unexpected shapes).
  - Check error paths for silent failures (`catch {}`), stuck loading/submitting states (`try`/`finally`), lost user edits on failed submits, duplicate submissions, or leaked sensitive details.
- **UI, layout, styling, and accessibility**:
  - Check portals, modals, drawers, and sticky headers for `z-index`/stacking-context clipping, body scroll-lock leaks on unmount, missing Escape/backdrop dismissal, or broken focus restoration.
  - Check responsive narrow-to-wide overflow, flex/grid `min-w-0` truncation issues, light/dark theme token contrast (`data-ui-theme`, `--ui-*`), and broken media fallback loops (reset fallback state when `src` changes).
  - Check broken interactive semantics (clickable `<div>` instead of `<button>`, missing button `type="button"` inside `<form>` triggering accidental submits, missing accessible labels or live status updates).
- **TypeScript, lint, and build errors**:
  - Check circular imports (`import/no-cycle`), deep imports across feature boundaries (`no-restricted-imports`), mismatched `type`-only imports, strict null narrowing, and stale generated artifacts.

## 2. Stack-specific bug traps

### Vite + React

- **Base paths & assets**: Check hardcoded `/images/...` or root-relative paths that break under non-root `import.meta.env.BASE_URL`, missing `BrowserRouter` `basename={import.meta.env.BASE_URL}`, and stale `React.lazy` chunks after deploy (`vite:preloadError` single-retry guard without infinite reload loops).
- **URL state & forms**: Check `useSearchParams` updates that accidentally drop unrelated query parameters or fail on invalid/missing param values.
- **Test isolation (Vitest + jsdom)**: Check missing `afterEach(cleanup)`, leaked Zustand store state or `localStorage`/`sessionStorage` values between tests, uncancelled fake timers (`vi.useRealTimers()`), and async lazy routes/portals needing `await screen.findBy*`.

## 3. Anti-patterns to reject during bug fixes

- **Symptom suppression**: Adding arbitrary `setTimeout` delays, empty `catch {}` blocks, or broad fallback returns that hide real bugs.
- **Guardrail bypasses**: Introducing `any`, non-null assertions (`!`), `@ts-expect-error`/`@ts-ignore`, or Oxlint disable comments instead of fixing the underlying type or boundary violation.
- **Test weakening**: Deleting, skipping (`it.skip`), or loosening assertions to make a failing test pass without proving the test expectation itself was wrong.
- **Scope creep**: Mixing unrelated refactors, reformatting untouched files, or introducing new dependencies without approval.

## 4. Oxlint & architectural boundaries (`.oxlintrc.json`)

Every bug fix must preserve:

- **Feature barrel discipline (`no-restricted-imports`)**: Outside a feature, import only from `@/features/<name>`. Inside `src/features/<name>/`, use relative sibling imports (`./...`, `../...`) and never import the feature's own `index.ts` (`import/no-cycle`).
- **One-way layering (`no-restricted-imports`)**:
  - `src/{features,lib,server}/**/*` must not import from `app/` or `routes/`.
  - `src/shared/**/*` must not import from `app/`, `features/`, or `routes/`.

## 5. Verification command matrix

Run from the repository root. Use `npm.cmd` and `npx.cmd` on Windows PowerShell if `.ps1` launchers are blocked.

### Targeted reproduction & regression test

```sh
npm run test -- <test-file-path>
```

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
