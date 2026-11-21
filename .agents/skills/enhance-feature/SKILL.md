---
name: enhance-feature
description: >-
  Refine, harden, clean up, or incrementally enhance an existing feature or
  React component. Use when asked to improve UX, edge states, props/refs,
  styling, accessibility, hooks, reducers, state hygiene, validation, error
  handling, cancellation, evidence-based performance, or regression test
  coverage without changing cross-module architecture or building a brand-new
  feature from scratch; not for net-new features/routes (use create-feature),
  cross-module architectural refactors (use refactor-architecture), or
  security-policy audits/remediation (use audit-security).
---

# Enhance Feature

Implement a **bounded, behavior-aware enhancement** inside an existing application feature while preserving its public entry point, route contracts, deployment base path, security trust boundaries, and unrelated behavior.

## 1. Inspect the existing feature

1. Read `AGENTS.md` and inspect `package.json`, framework config, and `.oxlintrc.json`.
2. Inspect the target feature or component's current implementation: `index.ts` public exports, components, hooks, reducers/stores, adapters/services/actions, schemas/types, colocated tests, direct consumers, and locale files (if localized).
3. Preserve existing deployment base paths and keep inactive routes or sections inactive unless explicitly asked to activate them.

## 2. Load feature enhancement checklist and relevant guides

Load [Feature enhancement checklist](./references/feature-enhancement-checklist.md) for stack-specific guardrails, Oxlint boundaries, and verification commands.
Consult `docs/` selectively by topic:

- Feature modularity and public APIs: `docs/feature-structure.md`
- Layering and dependencies: `docs/architecture.md`
- Naming, TypeScript, imports, and Prettier/Oxlint: `docs/coding-standards.md`
- Local, reducer, Context, URL, form, Zustand, or TanStack Query state: `docs/state-management.md`
- Adapters, Server Actions, schemas, cancellation, and error handling: `docs/api-design.md`
- Component composition, styling, and accessibility: `docs/component-guidelines.md`
- Trust boundaries, authorization, storage, and redaction: `docs/security.md`
- Profiling, rendering, virtualization, and bundle cost: `docs/performance.md`
- Test organization and validation scope: `docs/testing-strategy.md`

## 3. Define the bounded enhancement slice before editing

Before modifying files, briefly state:

- **Concrete enhancement goal or defect**: Backed by current file-level evidence.
- **Public contract preservation**: Exports in `src/features/<feature>/index.ts`, route params/URLs, server/client boundaries, and consumers that must remain compatible.
- **Target files and verification**: Exact files to modify/add, colocated tests to strengthen, and checks to run.
- **Boundary and dependency check**: Reuse installed packages first. Get explicit user approval before installing dependencies; escalate to `refactor-architecture` if cross-feature ownership or layering must change, or to `create-feature` if adding a major net-new capability/route.

## 4. Enhance the feature within its existing boundary

1. **State, hooks, and reducers**:
   - Keep one authoritative owner for each piece of state; compute derived values during render instead of syncing redundant state in `useEffect`.
   - Keep reducers pure and deterministic with typed discriminated actions; keep side effects in hooks or adapters.
   - Clean up subscriptions, timers, object URLs, and stale async work with `AbortSignal` or revision guards.
   - Preserve working state primitives; do not force migrations without demonstrated need.
2. **Adapters, validation, and error recovery**:
   - Validate untrusted external JSON and boundary inputs from `unknown` using focused type guards or the runtime schema library (such as Zod).
   - Handle failures explicitly with user-safe, redacted error messages; preserve unsaved user input on failure and prevent duplicate submissions (`loading`/`isSubmitting`).
3. **UX polish, component contracts, accessibility, and localization**:
   - Harden loading, empty, error, disabled, and confirmation flows using semantic `--ui-*` / `ui-*` tokens.
   - Keep component prop/ref contracts clean (named prop types, `ComponentPropsWithRef`/`ComponentPropsWithoutRef`, React 19 `ref` as a prop, discrete variants over tangled booleans, and explicit controlled vs. uncontrolled ownership).
   - Maintain native interactive semantics, keyboard navigation, focus management, live status/alert announcements, responsive narrow-to-wide layouts, theme parity, and `prefers-reduced-motion`.
   - Update every configured locale resource together in localized apps; keep English-only apps English-only.
4. **Evidence-based performance and internal clarity**:
   - Profile or trace confirmed bottlenecks before introducing memoization, virtualization, or lazy boundaries.
   - Keep internal folders proportional to real complexity; avoid speculative abstractions, mass renames, or unrelated formatting.
5. **Module and Oxlint boundary hygiene**:
   - Inside `src/features/<feature>/`, import sibling modules via relative paths and never import the feature's own `index.ts` barrel (`import/no-cycle`).
   - External consumers import only from `@/features/<feature>` (never deep-import feature internals).
   - Never import `app/` or `routes/` from `features/`, `lib/`, or `server/`.

## 5. Strengthen colocated tests

1. Add or update colocated unit (reducers, helpers, schemas), adapter, hook, component, and integration tests for the enhanced behavior and regression cases.
2. Cover happy paths, boundary/edge cases, malformed payloads, failure recovery, cancellation/cleanup, and accessible roles/labels/keyboard behavior.
3. Substitute external I/O at one boundary per test and restore state after each test.

## 6. Validate within repository guardrails

1. Inspect the diff to confirm only intended modules, direct consumers, tests, and required locales changed.
2. Format changed files only:
   `npx --no-install prettier --write <changed-files>`
3. Run read-only verification checks (`lint`, `format:check`, `test`, `typecheck`, `build`). Use `npm.cmd` and `npx.cmd` on Windows if PowerShell blocks `.ps1` launchers. See [Feature enhancement checklist](./references/feature-enhancement-checklist.md).
4. **Approval gates**: Do not install or upgrade dependencies, alter security-sensitive auth/storage policies without explicit scope, modify CI or deployment workflows unless requested, or commit, push, or deploy without explicit user approval.

## 7. Deliver concise handoff

Report in this order:

1. Feature enhancement objective and file-level evidence.
2. Files modified or created with a brief role for each.
3. State, error-handling, accessibility, locale/theme, and boundary checks applied.
4. Exact commands executed and observed results (plus any unrun browser/manual checks).
5. Remaining risks or recommended follow-up.

## Skill boundaries

- Use **this skill** (`enhance-feature`) to refine, harden, clean up, or incrementally enhance an existing feature or component within its current boundaries.
- Use `fix-bugs` to diagnose, reproduce, isolate root cause, and fix reported defects, regressions, crashes, or failing tests.
- Use `create-feature` to design, implement, and wire a brand-new user-facing feature or route.
- Use `refactor-architecture` when source-code ownership, feature/app layering, or cross-module dependency boundaries must change.
- Use `audit-performance` for dedicated production-build profiling and evidence-based performance optimizations.
- Use `audit-accessibility` for dedicated WCAG 2.2, keyboard/focus, ARIA, contrast, and reduced-motion audits or remediation.
- Use `audit-security` when auditing or hardening trust boundaries, auth/session policies, storage/redaction rules, headers, or CI workflows.
- Use `verify-release` for pre-release CI parity and deployment verification checklists.
- Use `sync-docs` when documentation needs synchronization after public contract or workflow changes.
