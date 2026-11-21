---
name: create-feature
description: >-
  Create a new user-facing feature or capability in this project. Use when asked to build, extend, or wire a new feature, route, workflow, API integration, or form while conforming to AGENTS.md, engineering guides, and Oxlint boundaries; not for architecture-only refactoring or documentation-only sync.
---

# Create Feature

Implement a **complete, reviewable feature slice** while preserving existing routes, public APIs, deployment base paths, and unrelated behavior.

## 1. Establish scope and inspect configuration

1. Read `AGENTS.md` and inspect `package.json`, framework config, `.oxlintrc.json`, and nearby code before proposing changes.
2. Clarify underspecified requirements, data contracts, or persistence expectations before editing.
3. Preserve deployment base paths, localization setup, theme behavior, and any documented inactive routes or sections unless explicitly asked to change them.

## 2. Load stack checklists and relevant guides

Load only the checklists needed for the target stack:

- Vite + React apps: [Vite feature checklist](./references/vite-feature-checklist.md)
- Shared UI, Oxlint & checks: [Shared UI and validation](./references/shared-ui-and-validation.md)

Consult `docs/` selectively by topic:

- Ownership, dependency direction, and routing: `docs/architecture.md`
- Feature modularity and translations: `docs/feature-structure.md`
- Naming, TypeScript, imports, and Prettier/Oxlint: `docs/coding-standards.md`
- Local, URL, Zustand, TanStack Query, reducer, context, or form state: `docs/state-management.md`
- HTTP adapters, Server Actions, validation, and errors: `docs/api-design.md`
- React composition, styling, and accessibility: `docs/component-guidelines.md`
- Trust boundaries, storage, URL/input checks, and logs: `docs/security.md`
- Rendering cost, lazy loading, and assets: `docs/performance.md`
- Test placement and check selection: `docs/testing-strategy.md`

## 3. Design the feature slice before editing

Before creating or editing source files, define:

- **Ownership**: Whether small route-specific UI stays beside its route or belongs in `src/features/<feature-name>/` with a public `index.ts`. Promote code to `src/shared/` only for concrete reuse.
- **State and data boundaries**: Authoritative owner for each piece of state, transport adapter, runtime validation (`unknown` type guards or runtime schema library such as Zod), cancellation (`AbortSignal`), and loading/empty/error/success contracts.
- **Locale, theme, and accessibility plan**: Synchronized updates across every configured locale resource in localized apps (keeping English-only apps English-only), keyboard/focus behavior, labels, live announcements, and theme parity.
- **Target files and verification**: Exact files to add or modify, colocated tests, and checks to run.
- **Dependencies**: Reuse installed packages first. Get explicit user approval before installing new dependencies.

## 4. Implement inside out across boundaries

Build from contracts and operations outward to composition:

1. **Contracts, schemas, and operations**:
   - Define public types and runtime schemas at the boundary that owns external input.
   - Put HTTP/storage/job operations in feature `api/`.
   - Normalize external JSON from `unknown`, forward `AbortSignal`, handle failures explicitly, and omit secrets, tokens, signed URLs, and private payloads from logs and UI errors.
2. **State and hooks**:
   - Start with `useState`, `useReducer`, and scoped Context; introduce Zustand (in `features/<feature>/store/` or `shared/store/`) only when distant components or features share client state.
   - Keep cached server state in TanStack Query (or RTK Query if Redux is retained), use React Hook Form + Zod for complex forms when appropriate, compute derived values during render, and avoid mirroring remote query results into client stores or effects.
3. **Feature UI and accessibility**:
   - Reuse semantic `--ui-*` tokens / `ui-*` utilities.
   - Use native semantic controls, visible field labels, `aria-invalid` / `aria-describedby` for validation errors, accessible live regions for async status/alerts, narrow-screen layouts, and reduced-motion support.
4. **Public entry point and app wiring**:
   - Export only supported public components, hooks, types, and operations from `src/features/<feature-name>/index.ts`.
   - Inside the feature, use relative sibling imports; outside consumers import only from `@/features/<feature-name>` (never deep imports).
   - Wire routes, providers, and cross-feature callbacks in `src/app/` or `src/routes/`. Never import `app/` or `routes/` from inside `features/`, `lib/`, `server/`, or `shared/`.
5. **Translations**:
   - In localized apps, update every configured locale file together for all user-visible text, accessible labels, validation errors, and status announcements. Keep English-only apps English-only.

## 5. Colocate tests

1. Colocate unit, adapter, hook, component, and integration tests with the code they exercise.
2. Cover happy paths, edge/boundary rules, validation errors, loading/empty/failure states, cancellation, and accessible roles/labels/keyboard behavior.
3. Substitute external I/O at one boundary per test and clean up state after each test.

## 6. Validate within repository guardrails

1. Inspect the diff to confirm only intended files changed and no Oxlint boundaries or unrelated edits were introduced.
2. Format changed files only:
   `npx --no-install prettier --write <changed-files>`
3. Run read-only verification checks automatically for the affected scope (use `npm.cmd` and `npx.cmd` on Windows if PowerShell blocks `.ps1` launchers). See [Shared UI and validation](./references/shared-ui-and-validation.md).
4. **Approval gates**: Do not install or upgrade dependencies, modify CI or deployment workflows unless requested, or commit, push, or deploy without explicit user approval.

## 7. Deliver result and handoff

Report concisely in this order:

1. Feature goal and boundary design.
2. Files created and modified with a brief role for each.
3. Locale, accessibility, theme, and security/boundary checks applied.
4. Exact commands executed and observed results (plus any unrun browser/manual checks).
5. Remaining risks or recommended follow-up.

## Skill boundaries

- Use **this skill** (`create-feature`) to design, implement, wire, and test a new feature or capability.
- Use `enhance-feature` to refine, harden, or incrementally enhance an existing feature or component within its current boundaries.
- Use `refactor-architecture` to reorganize existing code for architectural conformance without adding new product capabilities.
- Use `audit-performance` for evidence-based bundle, rendering, complexity, and Core Web Vitals audits or optimizations.
- Use `audit-accessibility` for WCAG 2.2, keyboard/focus, ARIA, contrast, and reduced-motion audits or remediation.
- Use `audit-security` to audit or harden application trust boundaries, auth/storage policies, headers, or CI workflows.
- Use `sync-docs` when documentation needs synchronization after structural or public contract changes.
