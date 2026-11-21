---
name: fix-bugs
description: >-
  Diagnose, reproduce, isolate root cause, and fix software bugs, regressions,
  failing tests, runtime crashes, broken UI or state flows, build/typecheck
  errors, and data/storage defects with minimal, well-tested changes. Use when
  investigating reported defects, unexpected behavior, console or runtime
  errors, async race conditions, routing/hydration bugs, or broken tests; not
  for building net-new features (use create-feature), routine UX polish without
  a defect (use enhance-feature), cross-module architectural refactors (use
  refactor-architecture), or dedicated security audits (use audit-security).
---

# Fix Bugs

Diagnose and resolve **defects at their verified root cause** using the smallest safe change that restores expected behavior, preserves public contracts and architectural boundaries, and prevents recurrence with colocated regression tests.

## 1. Triage and gather evidence

1. Read `AGENTS.md` and inspect `package.json`, framework config, and `.oxlintrc.json`.
2. Inspect current working-tree state (`git status`, targeted `git diff`) when relevant so in-progress changes are understood and preserved rather than overwritten.
3. Capture exact failure details before touching code:
   - Error message, stack trace, or failing command output.
   - Expected vs. actual behavior, reproduction steps, route/URL, viewport, theme, or locale conditions.
   - Recent code paths, direct consumers, and colocated tests around the failure surface.
4. Confirm execution mode:
   - **Diagnosis only:** When asked only to explain or investigate a bug, inspect source and run read-only checks without editing files.
   - **Reproduce & Fix (default):** Reproduce the defect, isolate the root cause, apply the minimal fix, add regression tests, and validate.

## 2. Load bug triage checklist and relevant guides

Load [Bug triage checklist](./references/bug-triage-checklist.md) for symptom-class diagnostics, stack-specific bug traps, anti-patterns to reject, and verification commands.
Consult `docs/` selectively only for the layer involved in the defect:

- Test design, isolation, and validation scope: `docs/testing-strategy.md`
- Local, reducer, Context, URL, form, Zustand, or TanStack Query state: `docs/state-management.md`
- Adapters, Server Actions, schemas, cancellation, and error handling: `docs/api-design.md`
- Component composition, hooks, styling, and accessibility: `docs/component-guidelines.md`
- Layering, routing, build configuration, and base paths: `docs/architecture.md`
- Feature modularity, public barrels, and translations: `docs/feature-structure.md`
- Naming, TypeScript, imports, and Prettier/Oxlint rules: `docs/coding-standards.md`
- Trust boundaries, validation, storage, and error redaction: `docs/security.md`
- Rendering loops, complexity, and bundle/loading behavior: `docs/performance.md`

## 3. Reproduce and isolate root cause

1. **Reproduce first**: Run the narrowest failing check (`npm run test -- <test-file-path>`, targeted `typecheck`, `lint`, or `build`) or write a focused failing Vitest regression test that proves the defect before editing production code. If a bug cannot be reproduced automatically (for example, a live browser layout or external-host issue), verify the exact failing code path from source and explicitly note what could not be executed locally.
2. **Trace to the authoritative owner**: Follow data, state, events, and types from the visible symptom back to the origin. Reject symptom-masking patches (`setTimeout` races, silent `catch {}`, `as any` casts, or disabling lint rules).
3. **Check sibling occurrences**: Search nearby modules or shared helpers for the same faulty pattern so closely related defects in scope are not left behind.
4. **State the fix slice briefly before editing**:
   - **Observed symptom & reproduction**: Failing test/command or traced execution path.
   - **Verified root cause**: Exact file/line reference and failure mechanism.
   - **Minimal fix & contract impact**: Exact files to edit, preserved public APIs (`src/features/<feature>/index.ts`, routes, schemas, storage keys), and direct consumers.
   - **Regression test & validation plan**: New/updated tests and checks to run.

## 4. Apply the minimal root-cause fix

1. **Fix at the right layer**:
   - **State, hooks, and async flows**: Fix authoritative state ownership, pure reducer transitions, missing cleanup (timers, listeners, subscriptions, object URLs), stale closures, or out-of-order async updates (`AbortSignal` or revision guards).
   - **Validation, persistence, and error paths**: Parse untrusted `unknown` external JSON, query params, or persisted storage payloads safely; keep error messages user-safe and redacted; preserve unsaved user input and prevent duplicate submissions while pending.
   - **Routing, UI, accessibility, and localization**: Preserve deployment base paths, native interactive semantics, keyboard/focus restoration, narrow-to-wide responsive layouts, theme parity, and `prefers-reduced-motion`. Update every configured locale resource together if user-visible text changes; keep English-only apps English-only.
2. **Stay strictly scoped**:
   - Avoid unrelated refactors, mass renames, speculative memoization, or formatting untouched files.
   - Respect Oxlint architectural boundaries: use relative sibling imports inside a feature, import features externally only via `@/features/<feature>`, never import `app/` or `routes/` from `features/`, `lib/`, `server/`, or `shared/`.
   - Never weaken security invariants, runtime validation, or test assertions to make an error disappear.

## 5. Lock in regression tests

1. Add or update colocated unit, reducer, schema, adapter, hook, or component tests covering the exact failing trigger and adjacent edge cases.
2. Confirm the regression test fails against the buggy behavior (when practical) and passes after the fix.
3. Substitute external I/O at one boundary per test and restore mocks, fake timers, DOM, storage, and store state after each test so tests never leak across cases.

## 6. Validate within repository guardrails

1. Inspect `git diff` to confirm only intended source files, direct consumers, and tests changed.
2. Format changed files only:
   `npx --no-install prettier --write <changed-files>`
3. Run targeted tests first, then run repository verification checks (`lint`, `format:check`, `test`, `typecheck`, `build`) for the affected scope. Use `npm.cmd` and `npx.cmd` on Windows PowerShell if `.ps1` launchers are blocked. See [Bug triage checklist](./references/bug-triage-checklist.md).
4. **Approval gates**: Do not install or upgrade dependencies, alter security-sensitive auth/storage policies outside the bug's explicit scope, modify CI or deployment workflows unless the bug lives there and changes are scoped, or commit, push, or deploy without explicit user approval.

## 7. Deliver concise handoff

Report in this order:

1. Bug symptom, reproduction, and verified root cause (with exact file/line references).
2. Minimal fix applied and files modified with a brief role for each.
3. Regression tests added or updated.
4. Exact commands executed and observed results (plus any unverified manual/browser checks).
5. Remaining risks, adjacent edge cases, or recommended follow-up.

## Skill boundaries

- Use **this skill** (`fix-bugs`) to diagnose, reproduce, fix, and regression-test software defects, regressions, crashes, broken flows, or failing checks.
- Use `enhance-feature` to refine, harden, or polish working features/components without an active defect investigation.
- Use `create-feature` to design, implement, and wire a net-new user-facing feature or route.
- Use `refactor-architecture` when fixing structural layering, module ownership, or cross-feature dependency boundaries across the codebase.
- Use `audit-performance` for production-build profiling, bundle budgets, and evidence-based performance optimizations.
- Use `audit-accessibility` for comprehensive WCAG 2.2, keyboard/focus, ARIA, contrast, and reduced-motion audits.
- Use `audit-security` for trust-boundary, auth/session, storage/redaction, header, or CI workflow security audits and hardening.
- Use `triage-dependabot` for GitHub Dependabot alerts, `npm audit` advisories, and transitive dependency overrides.
- Use `verify-release` for pre-release CI parity, deployment routing, and built-app release verification.
- Use `sync-docs` when documentation needs synchronization after verified behavior or contract changes.
