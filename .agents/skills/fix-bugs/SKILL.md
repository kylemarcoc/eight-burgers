---
name: fix-bugs
description: >-
  Diagnose, reproduce, isolate root cause, and fix software defects,
  regressions, failing tests, runtime crashes, broken UI or state flows,
  build/typecheck errors, and existing API/query defects with minimal,
  well-tested changes. Use when investigating reported defects, unexpected
  behavior, console or runtime errors, async race conditions, routing/API bugs,
  or broken tests; not for net-new features (use create-feature), routine UX
  polish without a defect (use enhance-feature), database schema/RLS redesign
  (use manage-database), cross-module architectural refactors (use
  refactor-architecture), or dedicated security audits (use audit-security).
---

# Fix Bugs

Diagnose and resolve **defects at their verified root cause** using the smallest safe change across the repository's active layers (client/frontend, and when present, shared contracts, backend API, or database) that restores expected behavior, preserves public contracts and architectural boundaries, and prevents recurrence with colocated regression tests.

## 1. Triage and gather evidence

1. Read `AGENTS.md` (when present) and inspect project manifests, framework/build configs, linter configs, and database configs (when present) to detect repository topology, component/package names, and configured check scripts.
2. Inspect current working-tree state (`git status`, targeted `git diff`) when relevant so in-progress changes are understood and preserved rather than overwritten.
3. Capture exact failure details before touching code: error message, stack trace, HTTP status/error code, expected vs. actual behavior, reproduction conditions, and nearby consumers/contracts/tests.
4. Confirm execution mode:
   - **Diagnosis only:** Inspect source and run read-only checks without editing files.
   - **Reproduce & Fix (default):** Reproduce the defect, isolate root cause, apply the minimal fix, add regression tests, and validate.

## 2. Load bug triage checklist and relevant guides

- Load [Bug triage checklist](./references/bug-triage-checklist.md) for symptom-class diagnostics, failure traps, anti-patterns to reject, and verification steps.
- Discover `docs/` and read only the guides present and relevant to the layer involved in the defect.

## 3. Reproduce and isolate root cause

1. **Reproduce first:** Run the narrowest failing test or check using the repository's configured test/build runner, or write a focused failing regression test proving the defect before editing production code. If automatic reproduction is blocked (live browser layout, missing local DB daemon, or external host), trace and verify the exact failing code path from source and state the gap honestly.
2. **Trace to the authoritative owner:** Follow data, state, transport envelopes, DB constraints, and types from the symptom back to the origin. Reject symptom-masking patches (arbitrary sleep/delay workarounds, swallowed errors, unsafe type escapes, or disabling lint rules).
3. **Check sibling occurrences:** Search nearby modules, gateway methods, and test doubles for the same faulty pattern so closely related bugs in scope are fixed together.
4. **State the fix slice briefly before editing:** Observed symptom/reproduction, verified root cause (`file:line`), minimal fix & preserved public contracts, and regression test & validation plan.

## 4. Apply the minimal root-cause fix

1. **Fix at the right layer:**
   - **Client state & async flows:** Fix authoritative state ownership, pure transitions, missing cleanup (timers, listeners, subscriptions, temporary object URLs), stale closures, or out-of-order async races (cancellation signals or revision guards).
   - **Validation, backend API & persistence (when present):** Validate untrusted external payloads safely before domain use; fix auth/CSRF/cookie/refresh races, query filter escaping, transactional/FK integrity, or storage cleanup mismatches; keep error payloads standardized and redacted; preserve unsaved user input and prevent duplicate submits.
   - **Routing, UI, accessibility & themes:** Preserve base paths, native semantic controls, keyboard/focus restoration, narrow-to-wide layouts, theme parity, reduced-motion behavior, and localization conventions.
2. **Stay strictly scoped:** Avoid unrelated refactors, mass renames, speculative memoization, or formatting untouched files; preserve configured linter boundaries; never weaken security invariants, DB policies, runtime validation, or test assertions.

## 5. Lock in regression tests

1. Add or update colocated unit, contract, route, adapter, hook/controller, or component tests covering the failing trigger and adjacent edge cases, confirming failure before and pass after (when practical).
2. Substitute external I/O at one boundary per test (such as stubbing the transport boundary or passing an in-memory gateway double) and restore mocks, fake timers, DOM, storage, and store state after each test.

## 6. Validate within repository guardrails

1. Inspect `git diff` to confirm only intended source files, direct consumers, and tests changed.
2. Format changed files using the repository's configured formatter, run targeted tests first, then run the repository's full configured verification suite.
3. **Approval gates:** Do not install or upgrade dependencies, alter security-sensitive auth/storage policies outside the bug's explicit scope, push remote migrations, modify CI/deployment workflows unless the bug lives there and changes are scoped, or commit, push, or deploy without explicit user approval.

## 7. Deliver concise handoff

Report in this order:

1. Bug symptom, reproduction, and verified root cause (`file:line`).
2. Minimal fix applied and files modified with a brief role for each.
3. Regression tests added or updated.
4. Exact commands executed and observed results (plus any unverified browser or live-DB checks).
5. Remaining risks, adjacent edge cases, or recommended follow-up.

## Skill boundaries

- Use **this skill** (`fix-bugs`) to diagnose, reproduce, fix, and regression-test defects, regressions, crashes, or failing checks.
- Use `manage-database` to design or audit database schemas, migrations, access-control/RLS policies, database functions, storage buckets, and seeds.
- Use `enhance-feature` to refine, harden, or polish working features/components without an active defect investigation.
- Use `create-feature` to design, implement, and wire a net-new user-facing feature or route.
- Use `refactor-architecture` when fixing structural layering, module ownership, or cross-module dependency boundaries across the codebase.
- Use `audit-performance` for production-build profiling, bundle budgets, DB roundtrips, and evidence-based performance optimizations.
- Use `audit-accessibility` for WCAG 2.2, keyboard/focus, ARIA, contrast, and reduced-motion audits.
- Use `audit-security` for trust-boundary, auth/session, storage/redaction, header, or CI workflow security audits and hardening.
- Use `triage-dependabot` for dependency security advisories, Dependabot alerts, and lockfile remediation.
- Use `verify-release` for pre-release CI parity, deployment routing, and built-app release verification.
- Use `sync-docs` when documentation needs synchronization after verified behavior or contract changes.
