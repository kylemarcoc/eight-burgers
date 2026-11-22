---
name: audit-performance
description: >-
  Audit, profile, and optimize runtime rendering, algorithmic complexity,
  bundle size, loading waterfalls, Core Web Vitals (LCP/INP/CLS), and (when
  present) API roundtrips, database query/index costs, and server media
  processing against repository performance guides. Use when investigating slow
  routes, sluggish interactions, large bundles, O(n^2) hot paths, virtualization
  candidates, lazy-loading boundaries, or slow endpoints; not for speculative
  memoization, routine UX cleanup (use enhance-feature), structural boundary
  migrations (use refactor-architecture), schema/index migrations (use
  manage-database), or security audits (use audit-security).
---

# Audit Performance

Measure and inspect a real user journey (or backend/database hot path when present) on a production build before optimizing it, then make the smallest evidence-backed change that addresses the measured bottleneck. Separate client rendering, network transfer, and (when present) API middleware and database query execution so every optimization targets the true source of delay.

## 1. Establish mode and scope

1. Read `AGENTS.md` (when present) and inspect project manifests, lockfiles, bundler/framework configs, and optional backend or database directories to discover active topology, build tools, and scripts.
2. Consult relevant performance, database, state, API, and architecture guides under `docs/` when present.
3. Determine the execution mode:
   - **Mode A — Performance Audit (read-only default):** Inspect source, emitted production build output, query/index paths (if any), and dependency graphs without editing files, and deliver prioritized, file-backed findings.
   - **Mode B — Evidence-Based Optimization:** Establish a reproducible production-build baseline first, scope the smallest targeted fix, verify functional/accessibility/layout parity, and compare matched before-and-after measurements.
4. Preserve public contracts, routes, deployment base paths, theme parity, narrow-screen usability, keyboard accessibility, and reduced-motion behavior.

## 2. Load the performance checklist

Load [Performance audit checklist](./references/performance-audit-checklist.md) for impact classification, inspection surfaces, measurement templates, and verification steps.

## 3. Audit across performance surfaces

Inspect only the surfaces relevant to the discovered stack and target scope using [Performance audit checklist](./references/performance-audit-checklist.md):

1. **Bundle size, code splitting, and dependency weight:** Entry artifact bytes, duplicate lockfile dependencies, wide re-export barrels, namespace imports, and lazy-loading boundaries for secondary routes or heavy optional widgets.
2. **Rendering behavior, state scope, and update isolation:** Subscription/provider granularity, redundant state synchronization, render purity, unmeasured memoization clutter vs. non-blocking UI update transitions.
3. **Data structures, algorithmic complexity, and large collections:** Nested linear scans or repeated copies inside loops/renderers, hash/set pre-indexing for repeated lookups, and server pagination vs. virtualization on large datasets.
4. **Assets, network waterfalls, and (when present) backend/database hot paths:** Critical resource discovery/sizing, layout-shift dimension reserves, sequential request waterfalls, cancellation/polling lifecycle, query/count amplification, index alignment with keyset pagination, and bounded server media processing.

## 4. Optimize with matched evidence (Mode B only)

1. Record the baseline commit, target route/interaction/endpoint, representative non-sensitive fixture, and baseline metrics before editing.
2. Apply the smallest targeted change addressing the verified root cause.
3. Add or update colocated regression tests ensuring behavior, edge cases, and accessibility remain intact.
4. Re-run the exact same measurement on a fresh production build under identical conditions and report matched before/after numbers honestly.

## 5. Validate within repository guardrails

1. For **Mode B**, inspect the diff to confirm only intended files changed and format changed files using the repository's configured formatter.
2. Run the repository's configured static analysis, formatting, test, type-check, and build verification commands.
3. **Approval gates:** Do not install new dependencies (including bundle analyzers or virtualization libraries), enable compiler plugins, add CI gates, modify deployment configs, or commit/push without explicit user approval.
4. Clearly separate **measured production-build data** from **unverified live-browser timings, Core Web Vitals, or live database profiles**.

## 6. Deliver findings and handoff

Report concisely in this order:

1. Scope audited/optimized, execution mode (Audit vs. Optimization), and target user journey or endpoint.
2. Findings ranked by impact (`High`, `Medium`, `Low`) with exact file/line references, bottleneck mechanism, and concrete minimal fix (or applied change in Mode B).
3. Matched before-and-after measurements (conditions, emitted artifact sizes, timings, roundtrip counts) for Mode B.
4. Files modified, regression tests added, and exact validation commands executed with observed results.
5. Unverified runtime measurements and recommended follow-up.

## Skill boundaries

- Use **this skill** (`audit-performance`) to audit, profile, and apply evidence-based optimizations for bundles, rendering, complexity, virtualization, loading waterfalls, and (when present) API roundtrips, DB queries/indexes, and media processing.
- Use `manage-database` for designing or authoring database migrations, access policies, functions, indexes, and storage buckets.
- Use `enhance-feature` for routine feature or component polish and general cleanup without a performance investigation.
- Use `refactor-architecture` when structural layering, module ownership, or cross-module dependency boundaries must change.
- Use `audit-accessibility` for WCAG 2.2, keyboard/focus, ARIA, contrast, and reduced-motion audits or remediation.
- Use `audit-security` for trust boundaries, auth/session enforcement, input/URL validation, and CI/header security.
- Use `verify-release` for end-to-end built-app, routing, and deployment release checks.
- Use `sync-docs` when documentation needs synchronization after verified changes.
