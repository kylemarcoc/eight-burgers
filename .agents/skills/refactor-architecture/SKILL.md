---
name: refactor-architecture
description: Refactor existing React or Next.js application source code to comply with this repository's architecture documentation. Use for explicitly requested codebase migrations, feature/module boundary changes, state/API separation, and cross-module structural refactors; not for documentation-only sync, isolated bug fixes, or routine component cleanup.
---

# Refactor Architecture

Implement **source-code changes**, not just an audit or documentation rewrite. Treat the repository's code as the current state and its maintained architecture documents as the intended standards. Preserve behavior and migrate incrementally.

## 1. Establish the implementation scope

1. Follow applicable `AGENTS.md` instructions and inspect the target code selected by the user.
2. Read `docs/architecture.md`, `docs/feature-structure.md`, and `docs/coding-standards.md` if present. Consult other guides in `docs/` only when relevant to the target change.
3. Inspect relevant source files, public exports, import relationships, consumers, tests, manifests, TypeScript configuration, lint rules, and framework conventions.
4. Recheck any prior audit finding against **current source**. Never treat an audit snapshot as proof that a problem still exists.
5. Separate **implemented behavior**, **documented requirements**, **proposals**, and **documented exceptions**. If documentation is contradictory, flag it instead of choosing arbitrarily.
6. If the user identifies a specific feature, migration, or violation, **implement that bounded change** rather than stopping after analysis. If a broad repository-wide refactor is requested without a concrete scope, present a prioritized, file-backed plan and start with the first bounded slice.

## 2. Route standards to the code being changed

| Concern                   | Canonical guidance             | What to change when justified                                  |
| ------------------------- | ------------------------------ | -------------------------------------------------------------- |
| Layering and dependencies | `docs/architecture.md`         | App/feature/shared ownership and import direction              |
| Naming and TypeScript     | `docs/coding-standards.md`     | Naming, imports, types, maintainable implementation patterns   |
| Feature modularity        | `docs/feature-structure.md`    | Feature folders, explicit public APIs, no deep imports         |
| State ownership           | `docs/state-management.md`     | Local vs. shared vs. URL vs. server state, pure reducers       |
| Data access               | `docs/api-design.md`           | API clients, queries/mutations, cancellation, error handling   |
| Components                | `docs/component-guidelines.md` | Composition, component ownership, hooks, accessibility         |
| Performance               | `docs/performance.md`          | Evidence-based rendering, loading, and bundle improvements     |
| Tests                     | `docs/testing-strategy.md`     | Regression coverage and valid test placement                   |
| Security                  | `docs/security.md`             | Identify trust-boundary risks; require explicit security scope |

Do not load or copy every document into context by default. Read only relevant sections, and do not rewrite guides during normal code refactoring.

## 3. Design a reviewable migration slice

Before editing, briefly state:

- The concrete problem with current file-level evidence.
- Why it conflicts with a specific repository standard.
- Target files/modules and affected consumers.
- The smallest behavior-preserving solution and public contracts to protect.
- Tests and repository validation scripts applicable to the change.
- Risks, notable assumptions, and out-of-scope findings.

Prefer a coherent feature or dependency-boundary slice over broad directory reorganization. Keep established framework patterns intact unless changing them is explicitly part of the task.

## 4. Refactor actual application code

1. **Edit source files** in the approved target feature or module; update affected imports, consumers, and exports together.
2. Align domain code with feature ownership. Keep only genuinely domain-independent primitives in `shared/`.
3. Use explicit public module interfaces (`index.ts`) where established. Avoid cycles and access to another feature's private internals.
4. Keep API access, TanStack Query/RTK Query server state, Redux/Zustand client state, URL state, and local component state properly owned. Do not mirror cached API results into a client store without demonstrated need.
5. Preserve runtime behavior, API contracts, routing, authentication, errors, loading/empty states, keyboard interaction, and accessibility. Reject incidental security-sensitive changes unless explicitly scoped.
6. Match existing naming conventions, file layout, styling, and framework routes.
7. Update tests in affected modules focusing on behavior, regressions, boundaries, and integration points.
8. Avoid mass renames, unrelated formatting, duplicate libraries, and indiscriminate `useMemo`/`useCallback` additions.
9. Update documentation only when explicitly requested or when a changed architectural contract would leave it materially wrong.

## 5. Validate within repository guardrails

- Inspect the final diff and confirm only target modules and directly affected consumers changed.
- Recheck import paths, public exports, feature boundaries, circular-dependency risk, type contracts, and new tests.
- Format changed files only (`npx --no-install prettier --write <changed-files>`).
- Run read-only verification checks for the affected scope (`lint`, `format:check`, `test`, `typecheck`, `build`). Use `npm.cmd` and `npx.cmd` on Windows PowerShell if `.ps1` launchers are blocked.
- Never claim checks passed unless actually run and observed.
- **Approval gates**: Do not install dependencies, commit, push, deploy, rotate credentials, modify CI, or change repository settings unless explicitly requested.

## 6. Deliver a useful result

Report in this order:

1. Refactoring objective and concrete evidence.
2. Source files modified with a concise reason for each.
3. Standards satisfied and any documented exceptions preserved.
4. Behavior, API, and accessibility compatibility considerations.
5. Tests changed and checks executed versus checks still required.
6. Remaining risks or blocked work and the next single migration slice.

## Skill boundaries

- Use `enhance-feature` for isolated feature or component cleanup, UX/edge-state hardening, or styling/a11y polish without cross-module boundary changes.
- Use `fix-bugs` to diagnose, reproduce, and fix isolated defects, regressions, crashes, or failing tests without broad architectural migration.
- Use `create-feature` to build and wire a brand-new user-facing feature or capability.
- Use **this skill** (`refactor-architecture`) when source-code ownership, feature/app layering, cross-module dependencies, or architectural conformance must change.
- Use `audit-performance` for evidence-based bundle, rendering, complexity, and Core Web Vitals audits or optimizations.
- Use `audit-accessibility` for WCAG 2.2, keyboard/focus, ARIA, contrast, and reduced-motion audits or remediation.
- Use `audit-security` for security audits and sensitive trust-boundary remediation.
- Use `sync-docs` for documentation-only updates.
