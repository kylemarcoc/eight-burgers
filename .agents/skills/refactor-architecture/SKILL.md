---
name: refactor-architecture
description: >-
  Refactor existing application source code (frontend, shared packages, and
  backend) to comply with the repository's documented architecture and linter
  boundaries. Use for explicitly requested codebase migrations,
  feature/tier/workspace boundary changes, state/API separation, and
  cross-module structural refactors; not for net-new features (use
  create-feature), routine component cleanup (use enhance-feature), isolated bug
  fixes (use fix-bugs), database schema/RLS authoring (use manage-database), or
  documentation-only sync (use sync-docs).
---

# Refactor Architecture

Implement **source-code changes**, not just an audit or documentation rewrite. Treat the repository's code as the current state and its maintained architecture documents and linter rules as the intended standards. Preserve behavior and migrate incrementally.

## 1. Establish the implementation scope

1. Read `AGENTS.md` (when present), inspect root and any subproject/workspace manifests to detect active topology (single-app vs. multi-package/monorepo) and stack, and inspect the target code selected by the user.
2. Discover relevant architecture, modularity, coding, state, API, database, and testing guides under `docs/` when present alongside source files, public exports, import relationships, tier dependencies, consumers, tests, type-check configs, linter boundary rules, and framework build configs.
3. Recheck any prior audit finding against **current source**—never treat an audit snapshot as proof that a problem still exists.
4. Separate **implemented behavior**, **documented requirements**, **proposals**, and **documented exceptions**. If documentation is contradictory, flag it instead of choosing arbitrarily.
5. If the user identifies a specific feature, migration, or violation, **implement that bounded change** rather than stopping after analysis. If a broad repository-wide refactor or topology migration is requested without a concrete scope, present a prioritized, file-backed plan and start with the first bounded slice.

## 2. Route standards to the code being changed

Discover and consult only the guides present in `docs/` that govern the layers being refactored (layering/dependencies, naming/types, feature modularity, state ownership, API/transport, database/storage gateways, components, performance, testing, or security). Do not load or copy every document into context by default, and do not rewrite guides during normal code refactoring.

## 3. Design a reviewable migration slice

Before editing, briefly state:

- The concrete problem with current file-level evidence.
- Why it conflicts with a specific repository standard or linter rule.
- Target files/modules and affected consumers across active tiers.
- The smallest behavior-preserving solution and public contracts to protect.
- Tests and repository validation checks applicable to the change.
- Risks, notable assumptions, and out-of-scope findings.

Prefer a coherent feature or dependency-boundary slice over broad directory reorganization. Keep established framework patterns intact unless changing them is explicitly part of the task.

## 4. Refactor actual application code

1. **Edit source files** in the approved target feature or module; update affected imports, consumers, and exports together.
2. Align domain code with active tier and feature ownership as documented in `AGENTS.md` and `docs/`: keep shared contracts and pure cross-tier rules independent of client and server runtimes, keep server routes/gateways independent of client UI modules, keep feature internals inside the owning feature, and keep shared client primitives free of app/route/feature imports.
3. Use explicit public module entry points where established in the repository. Avoid circular dependencies, deep feature imports, and backward dependencies violating configured linter rules.
4. Keep local component state, shared client stores, URL state, and cached server state properly owned without duplicating server responses into client stores unnecessarily.
5. Preserve runtime behavior, API envelopes, authentication, errors, loading/empty states, keyboard interaction, and accessibility. Reject incidental security-sensitive changes unless explicitly scoped.
6. Match existing naming conventions, file layout, styling, and routes.
7. Update tests in affected modules focusing on behavior, regressions, boundaries, and integration points.
8. Avoid mass renames, unrelated formatting, duplicate libraries, and indiscriminate memoization additions.
9. Update documentation only when explicitly requested or when a changed architectural contract would otherwise become materially wrong.

## 5. Validate within repository guardrails

- Inspect the final diff and confirm only target modules and directly affected consumers changed.
- Recheck import paths, public exports, tier/feature boundaries, circular-dependency risk, type contracts, and new tests.
- Format changed files only using the repository's configured formatter.
- Run available verification checks for the affected scope (lint, format-check, test, type-check, and build via the repository's configured runner).
- Never claim checks passed unless actually run and observed.
- **Approval gates:** Do not install dependencies, commit, push, deploy, rotate credentials, modify CI, or change repository settings unless explicitly requested.

## 6. Deliver a useful result

Report in this order:

1. Refactoring objective and concrete evidence.
2. Source files modified with a concise reason for each.
3. Standards satisfied and any documented exceptions preserved.
4. Behavior, API, and accessibility compatibility considerations.
5. Tests changed and checks executed versus checks still required.
6. Remaining risks or blocked work and the next single migration slice.

## Skill boundaries

- Use **this skill** (`refactor-architecture`) when source-code ownership, feature/app/tier/workspace layering, cross-module dependencies, or architectural conformance must change.
- Use `enhance-feature` for isolated feature or component cleanup, UX/edge-state hardening, or styling/a11y polish without cross-module boundary changes.
- Use `fix-bugs` to diagnose, reproduce, and fix isolated defects, regressions, crashes, or failing tests without broad architectural migration.
- Use `create-feature` to build and wire a net-new user-facing feature or capability.
- Use `manage-database` to design or audit database schemas, migrations, access-control/RLS policies, database functions/RPCs, storage buckets, and seeds.
- Use `audit-performance` for evidence-based bundle, rendering, query, and Core Web Vitals audits or optimizations.
- Use `audit-accessibility` for WCAG 2.2, keyboard/focus, ARIA, contrast, and reduced-motion audits or remediation.
- Use `audit-security` for security audits and sensitive trust-boundary remediation.
- Use `sync-docs` for documentation-only updates.
