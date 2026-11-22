---
name: create-feature
description: >-
  Design, build, and wire a net-new user-facing feature, route, or capability
  across the repository's active layers while conforming to AGENTS.md,
  engineering guides, and linter boundaries. Use when implementing new product
  capabilities from scratch; not for refining existing features (use
  enhance-feature), fixing defects (use fix-bugs), dedicated schema/RLS
  authoring (use manage-database), architecture-only refactoring (use
  refactor-architecture), or documentation-only sync (use sync-docs).
---

# Create Feature

Implement a **complete, reviewable feature slice** across the repository's active layers (client/frontend, and when present, shared contracts/IDL, backend API, and database) while preserving existing routes, public APIs, deployment base paths, and unrelated behavior.

## 1. Establish scope and inspect configuration

1. Read `AGENTS.md` (when present) and inspect project manifests, framework/build configs, type-check configs, linter boundary rules, and nearby modules to detect topology (single-app vs. multi-package/monorepo), active stack, and installed packages.
2. Check which optional layers exist (shared contract packages or generated schemas, backend API/BFF routes, database migrations/seeds, routing, theming, or localization).
3. Clarify underspecified requirements, data contracts, authorization rules, or persistence expectations before editing.
4. Preserve deployment base paths, theme parity, copy/localization conventions, and documented inactive routes unless explicitly asked to change them.

## 2. Load stack checklists and relevant guides

- **Frontend stack checklist:** When the repository uses Vite + React, also load [Vite feature checklist](./references/vite-feature-checklist.md). For other frameworks, follow the repository's framework configuration and guides.
- **Boundaries & validation checks:** Load [Shared UI and validation](./references/shared-ui-and-validation.md).
- **Database & storage:** When adding or altering tables, access policies, database functions, or object storage buckets, coordinate via `manage-database`.
- **Engineering guides:** Discover `docs/` and read only the guides present and relevant to the touched layers.

## 3. Design the feature slice before editing

Before creating or editing source files, define:

- **Layer ownership:** Which UI, behavior hooks/controllers, and transport adapters belong in the owning feature (or beside a single-use route) vs. genuinely domain-independent shared layers; and, when backend tiers exist, which schemas/pure helpers belong in shared contracts, which endpoints/gateways belong in the backend API, and whether migrations are needed.
- **State and data contracts:** Authoritative owner for each piece of state, transport adapter, runtime validation of untrusted external payloads before domain use, request cancellation, concurrency/idempotency rules (when supported), and loading/empty/error/success states.
- **Theme and accessibility plan:** Native semantics, keyboard/focus handling, labels, error linking, live announcements, theme parity, and synchronized locale updates (when localized).
- **Target files & verification:** Exact files to add or modify, colocated tests across touched layers, and verification checks.
- **Dependencies:** Reuse installed packages first; get explicit user approval before installing new dependencies.

## 4. Implement inside out across boundaries

Build from contracts and server boundaries (when present) outward to UI composition:

1. **Shared contracts & database (when present):** Define strict runtime validation schemas and pure cross-tier rules in the repository's shared contracts or API schema layer, exporting through declared entry points. Author append-only migrations with database access controls via `manage-database` when persistence changes.
2. **Backend API / server tier (when present):** Add thin route/endpoint handlers matching repository patterns, validate inputs explicitly, enforce auth/CSRF/rate limits at the server boundary, delegate persistence to data gateways, and return standardized JSON or structured error envelopes.
3. **Client transport & state:** Keep HTTP/RPC adapters and query keys (if using a query cache) in the feature's data layer, propagating cancellation signals and handling session expiry and concurrency conflicts cleanly. Keep server cache distinct from local/shared client stores.
4. **Feature UI, accessibility & wiring:** Reuse the repository's styling tokens, accessible interactive patterns, narrow-to-wide layouts, and reduced-motion rules. Export only supported public symbols from the feature's entry point, use direct internal imports within the feature, allow cross-feature public imports only where repository architecture permits, and wire composition/routes in the app/route layer per configured linter rules.

## 5. Colocate tests

1. Colocate unit, contract, route, adapter, hook/controller, component, and integration tests with the modules they exercise across touched layers.
2. Cover happy paths, boundary rules, validation failures, HTTP/network recovery, cancellation, and accessible roles/labels/keyboard behavior.
3. Substitute external I/O at one boundary per test (such as stubbing the transport boundary or passing an in-memory gateway test double) and restore test state after each test.

## 6. Validate within repository guardrails

1. Inspect the diff to confirm only intended files changed and all configured tier/feature boundaries hold.
2. Format changed files using the repository's configured formatter and run applicable verification scripts per [Shared UI and validation](./references/shared-ui-and-validation.md).
3. **Approval gates:** Do not install or upgrade dependencies, modify CI or deployment workflows unless requested, push remote migrations, or commit/push/deploy without explicit user approval.

## 7. Deliver result and handoff

Report concisely in this order:

1. Feature goal and layer boundary design.
2. Files created and modified with a brief role for each.
3. Accessibility, theme, and security/boundary checks applied.
4. Exact commands executed and observed results (plus any unrun browser or live-DB checks).
5. Remaining risks or recommended follow-up.

## Skill boundaries

- Use **this skill** (`create-feature`) to design, implement, wire, and test a net-new feature or capability slice.
- Use `enhance-feature` to refine, harden, or polish an existing feature or component within its current boundaries.
- Use `fix-bugs` to diagnose, reproduce, and fix defects, regressions, crashes, or failing tests.
- Use `manage-database` to design or audit database schemas, migrations, access-control/RLS policies, database functions, storage buckets, and seeds.
- Use `refactor-architecture` to reorganize existing code for architectural conformance without adding new product capabilities.
- Use `audit-performance` for evidence-based bundle, rendering, query, and Core Web Vitals optimization.
- Use `audit-accessibility` for WCAG 2.2, keyboard/focus, ARIA, contrast, and reduced-motion audits or remediation.
- Use `audit-security` for trust-boundary, auth/storage, header, or CI security audits and hardening.
- Use `sync-docs` when documentation needs synchronization after structural or public contract changes.
