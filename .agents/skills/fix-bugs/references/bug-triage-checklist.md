# Bug Triage Checklist & Validation

Use this procedural checklist alongside `AGENTS.md` and relevant repository guides under `docs/` when diagnosing, reproducing, fixing, and verifying defects across single-app or multi-package codebases (client/frontend, and when present, shared contracts, backend API, and database layers).

## 1. Root-cause diagnostic checklist by symptom class

- **State, lifecycle, and async races (client):**
  - Check for stale closures capturing outdated props/state, missing effect dependencies, or state-syncing effects causing render loops or overwriting user edits.
  - Check for missing cleanup on unmount or parameter change: in-flight request cancellation signals, timers/intervals, event listeners, subscriptions, and temporary object URL revocation.
  - Check for out-of-order async responses overwriting newer state (cancellation signals or sequence/revision guards) and missing session-expiry (`401`) cache/state cleanup.
  - Check for impure render-time mutations and unstable collection keys when items reorder, insert, or delete.
  - Check persistent client stores for unvalidated hydrated payloads, schema-version drift, storage-quota/unavailable errors, deprecated sensitive keys left behind on migration, or ephemeral UI flags accidentally persisted.
- **Data boundaries, validation, and error handling:**
  - Check external payloads, URL parameters, storage entries, form inputs, and route arguments for unguarded assumptions (`null`, empty collections, unexpected shapes, out-of-range numbers).
  - Check error paths for swallowed exceptions, stuck pending/loading flags, lost user edits on failed submits or version conflicts, duplicate writes missing idempotency protection, or leaked sensitive internals.
- **UI, layout, styling, and accessibility:**
  - Check portals, modals, drawers, and sticky overlays for stacking-context clipping, scroll-lock leaks on unmount, missing Escape/backdrop dismissal, or broken trigger focus restoration.
  - Check narrow-to-wide overflow, flex/grid truncation, theme contrast across configured modes, and broken image fallback loops (derive fallback state cleanly from the current source).
  - Check broken interactive semantics (clickable non-semantic tags, missing non-submit button types inside forms, missing accessible labels or live status updates).
- **Static checks, types, and build failures:**
  - Check circular dependencies, deep imports bypassing feature public entry points, tier/layer violations, strict null narrowing, and stale build artifacts.

## 2. Common cross-layer bug traps

### Client traps

- **Base paths, proxy & assets:** Check hardcoded root-relative URLs that break under non-root public base paths, missing router base paths, dev proxy rules, and stale lazy chunks after deployments (ensure preload recovery cannot loop infinitely).
- **URL state & query cache:** Check search-parameter updates that drop unrelated params, and paginated polling queries that keep polling stale deeper pages or omit cursor resets on filter changes.
- **Test isolation:** Check missing UI/DOM cleanup between tests, leaked client stores or storage keys, shared query caches (disable automatic error retries when testing error flows), uncancelled fake timers, and lazy/async boundaries requiring async queries.

### Optional backend API, contracts & database traps (when present)

- **Auth cookies, CSRF & refresh races:** Check missing CSRF checks on mutating routes, HTTPS-only cookie flags breaking local HTTP dev, missing single-flight refresh guards causing concurrent requests to race on rotated refresh tokens, or protected routes mishandling expired tokens.
- **Optimistic locking & idempotency:** Check `409 Conflict` handling when expected versions mismatch concurrent writes, idempotency conflicts when a reused key arrives with a different payload, and stale precondition/invariant drift during transactional writes.
- **Query escaping & DB/storage integrity:** Check unescaped filter syntax delimiters or pattern wildcards in dynamic search expressions, destructive full-table resets violating foreign keys, silent default fallbacks masking disabled references, unhandled unique-constraint collisions on generated identifiers/slugs, and storage cleanup mismatches across stored URL formats.
- **Gateway test-double drift:** Verify in-memory backend test doubles match real database constraints, error codes, and authorization rules rather than masking real persistence bugs.

## 3. Anti-patterns to reject during bug fixes

- **Symptom suppression:** Arbitrary sleep/delay workarounds, swallowed empty error catches, or broad fallback returns that mask root failures.
- **Guardrail bypasses:** Unsafe type escapes, type-suppression comments, or linter-disable pragmas instead of fixing the underlying boundary bug.
- **Test weakening:** Deleting, skipping, or loosening assertions to turn a failing test green without proving the test expectation was wrong.
- **Scope creep:** Mixing unrelated refactors, reformatting untouched files, or introducing unapproved dependencies.

## 4. Preservation & verification steps

1. Inspect configured architecture and linter rules (`AGENTS.md`, linter configs) to preserve feature entry-point discipline and strict client/contracts/server separation.
2. Format only changed files using the repository's configured formatter.
3. Run the narrowest targeted failing test first via the project's test runner, then run the repository's full configured lint, format-check, test, type-check, and build suite (plus local DB reset/lint commands when database files changed and local DB tooling is running).
