---
name: enhance-feature
description: >-
  Refine, harden, clean up, or incrementally enhance an existing feature,
  endpoint, or UI component within its current boundaries. Use when asked to
  improve UX, edge states, component APIs, styling, accessibility, hooks,
  reducers, state hygiene, validation, error handling, cancellation, concurrency
  recovery, or regression test coverage; not for net-new features/routes (use
  create-feature), diagnosing defects/broken tests (use fix-bugs), database
  schema/migration design (use manage-database), cross-module architectural
  refactors (use refactor-architecture), or dedicated audits (use
  audit-security, audit-accessibility, audit-performance).
---

# Enhance Feature

Implement a **bounded, behavior-aware enhancement** inside an existing feature, component, shared module, or (when present) paired contract/backend endpoint while preserving its public entry point, route contracts, deployment base path, security trust boundaries, and unrelated behavior.

## 1. Inspect the existing feature

1. Read `AGENTS.md` (when present) and inspect project manifests, framework/build configs, and linter rules.
2. Inspect the target slice's current implementation: public entry point, components/views, behavior hooks/controllers, data adapters, stores, colocated tests, direct consumers, and (when present) paired shared contracts and backend route/gateway modules.
3. Preserve existing deployment base paths and keep inactive routes or sections inactive unless explicitly asked to activate them.

## 2. Load checklist and relevant guides

- Load [Feature enhancement checklist](./references/feature-enhancement-checklist.md) for procedural quality, boundary, and verification steps.
- Discover `docs/` and read only the guides present and relevant to the layers being modified.

## 3. Define the bounded enhancement slice before editing

Before modifying files, briefly state:

- **Concrete enhancement goal:** Backed by current file-level evidence.
- **Public contract preservation:** Public exports, route params/URLs, API shapes, and consumers that must remain compatible.
- **Target files & verification:** Exact files to modify/add, colocated tests to strengthen, and checks to run.
- **Escalation & dependency check:** Reuse installed packages first and get explicit approval before adding dependencies. Escalate to `refactor-architecture` if cross-module ownership/tier must move, `manage-database` if schema/access migrations are needed, or `create-feature` if building a major net-new capability/route.

## 4. Enhance within existing boundaries

1. **State & async hygiene:** Keep one authoritative owner per piece of state, derive values during render instead of syncing redundant state in effects, keep state transitions pure, and clean up timers, listeners, temporary object URLs, and superseded requests via cancellation signals or revision guards. Preserve working state primitives unless changes are justified.
2. **Boundary validation, concurrency & error recovery:** Parse untrusted external payloads safely using the repository's validation library or guards, preserve idempotency/optimistic-concurrency flows and auth-expiry cleanup per repository conventions, prevent duplicate submits, preserve unsaved user input on failure, and surface safe redacted errors.
3. **Component APIs, accessibility & styling:** Match installed framework and repository component conventions (explicit contracts, discrete variants, clear controlled vs. uncontrolled ownership), preserve native semantics, keyboard/focus handling, live status/alert announcements, theme/viewport parity, reduced-motion behavior, and localization rules.
4. **Evidence-based performance & boundaries:** Profile before adding memoization/virtualization/lazy loading, avoid speculative abstractions or mass renames, keep feature internals on direct internal imports (external callers on the feature's public entry point), and satisfy configured linter layer/cycle rules.

## 5. Strengthen colocated tests

1. Add or update colocated unit, contract, route, adapter, hook/controller, component, and integration tests covering happy paths, edge/boundary cases, malformed payloads, failure/conflict recovery, cancellation/cleanup, and accessible roles/labels/keyboard behavior.
2. Substitute external I/O at one boundary per test (such as stubbing the transport boundary or passing an in-memory gateway double) and restore test state after each test.

## 6. Validate within repository guardrails

1. Inspect the diff to confirm only intended modules, direct consumers, and tests changed.
2. Format changed files using the repository's configured formatter and run verification checks per [Feature enhancement checklist](./references/feature-enhancement-checklist.md).
3. **Approval gates:** Do not install or upgrade dependencies, weaken or alter security-sensitive auth/storage policies without explicit scope, modify CI or deployment workflows unless requested, or commit, push, or deploy without explicit user approval.

## 7. Deliver concise handoff

Report in this order:

1. Feature enhancement objective and file-level evidence.
2. Files modified or created with a brief role for each.
3. State, error-handling, concurrency, accessibility, theme, and boundary checks applied.
4. Exact commands executed and observed results (plus any unrun browser/manual checks).
5. Remaining risks or recommended follow-up.

## Skill boundaries

- Use **this skill** (`enhance-feature`) to refine, harden, clean up, or incrementally enhance an existing feature, endpoint, or component within its current boundaries.
- Use `fix-bugs` to diagnose, reproduce, isolate root cause, and fix reported defects, regressions, crashes, or failing tests.
- Use `create-feature` to design, implement, and wire a net-new user-facing feature or route.
- Use `manage-database` to design or audit database schemas, migrations, access-control/RLS policies, database functions, storage buckets, and seeds.
- Use `refactor-architecture` when source-code ownership, feature/app layering, or cross-module dependency boundaries must change.
- Use `audit-performance` for dedicated production-build profiling and evidence-based performance optimizations.
- Use `audit-accessibility` for dedicated WCAG 2.2, keyboard/focus, ARIA, contrast, and reduced-motion audits or remediation.
- Use `audit-security` when auditing or hardening trust boundaries, auth/session policies, storage/redaction rules, headers, or CI workflows.
- Use `verify-release` for pre-release CI parity and deployment verification checklists.
- Use `sync-docs` when documentation needs synchronization after public contract or workflow changes.
