---
name: audit-performance
description: >-
  Audit, profile, and optimize runtime rendering, algorithmic complexity,
  bundle size, loading waterfalls, Core Web Vitals (LCP/INP/CLS), and
  server/job processing performance against docs/performance.md.
  Use when investigating slow routes, sluggish interactions, large bundles,
  O(n^2) hot paths, virtualization candidates, or lazy-loading boundaries; not
  for speculative memoization, routine UX cleanup (use enhance-feature),
  structural boundary migrations (use refactor-architecture), or security
  audits (use audit-security).
---

# Audit Performance

Measure and inspect a real user journey on a production build before optimizing it, then make the smallest evidence-backed change that addresses the measured bottleneck. Separate browser rendering, network transfer, and backend/job processing so every recommendation targets the true source of delay.

## 1. Establish mode and scope

1. Read `AGENTS.md` and `docs/performance.md` first.
2. Inspect `package.json`, framework config (`vite.config.*` / `next.config.*`), and `package-lock.json`.
3. Determine the execution mode:
   - **Mode A — Performance Audit (read-only default):** When asked to audit, profile, or identify performance bottlenecks, inspect source, emitted production build output, and dependency graphs without editing files, and deliver prioritized, file-backed findings.
   - **Mode B — Evidence-Based Optimization:** When asked to optimize a confirmed bottleneck, establish a reproducible production-build baseline first, scope the smallest targeted fix, verify functional/accessibility/layout parity, and compare before-and-after measurements under matched conditions.
4. Preserve public contracts, routes, deployment base paths, theme parity, narrow-screen usability, keyboard accessibility, and `prefers-reduced-motion` behavior.

## 2. Load the performance checklist and relevant guides

Load [Performance audit checklist](./references/performance-audit-checklist.md) for concrete inspection checks, bundle/complexity red flags, and measurement commands.
Consult `docs/` selectively when a finding crosses concerns:

- Profiling, complexity, rendering, virtualization, Core Web Vitals, and budgets: `docs/performance.md`
- State ownership, subscriptions, selectors, and React 19 Actions: `docs/state-management.md`
- Query keys, cancellation (`AbortSignal`), request concurrency, and storage transfers: `docs/api-design.md`
- Component composition, styling, and reduced motion: `docs/component-guidelines.md`
- Layering, build outputs, and deployment bases: `docs/architecture.md`
- Verification matrix and release checks: `docs/testing-strategy.md`

## 3. Audit across performance surfaces

Inspect only the surfaces relevant to the target scope using actual source and production build artifacts:

1. **Bundle size, code splitting, and dependency weight:**
   - Run or inspect production build output (`dist/`) to identify large entry chunks, heavy third-party imports, wide re-export barrels on hot entry paths, or namespace icon imports (`import * as Icons`).
   - Check `package-lock.json` for duplicate large packages or heavy dependencies used for trivial operations.
   - Verify Vite 8 custom chunking uses `build.rolldownOptions` (never deprecated `build.rollupOptions`) and keep automatic chunking unless traces show concrete caching/loading gains. In React Router declarative mode, verify deferred routes/features use module-scope `React.lazy` + `Suspense` with space-preserving fallbacks and `vite:preloadError` recovery.
2. **React rendering, state subscriptions, and compiler readiness:**
   - Check for overly broad Context providers carrying fast-changing values, unindexed or broad store subscriptions (missing focused selectors or `useShallow`), or state-syncing `useEffect` chains.
   - Verify render functions and hooks remain strictly pure (compiler-ready: no prop/state mutation or `ref.current` reads/writes during render).
   - Check for unmeasured `memo`/`useMemo`/`useCallback` clutter vs. genuinely expensive subtrees or calculations competing with urgent input (candidates for `useTransition`, `useDeferredValue`, or `<Activity>` in React 19.2+).
3. **Data structures, algorithmic complexity, and large collections:**
   - Hunt for accidental `O(n·m)` / `O(n²)` passes: `.find()`, `.includes()`, or `.indexOf()` inside loops/render maps; spreading arrays inside `reduce`; `shift`/`unshift` inside loops; or repeated full-collection recomputation on every keystroke.
   - Check whether large unbounded DOM lists should first be bounded/paginated at the API or virtualized when measurements justify it.
4. **Network waterfalls, caching, assets, and Core Web Vitals (LCP, INP, CLS):**
   - Check for sequential `await` chains that can run concurrently with `Promise.all`, duplicate reads missing shared keys/deduplication, or missing `AbortSignal` cancellation on superseded reads.
   - Inspect images and fonts for reserved dimensions/aspect ratios (CLS), hidden responsive artwork downloading unnecessarily, and eager loading of the LCP element.

## 4. Optimize with matched evidence (Mode B only)

When implementing optimizations:

1. Record the baseline commit, target route/interaction, representative non-sensitive fixture, and baseline metrics before editing.
2. Apply the smallest targeted change that fixes the identified root cause (`Map`/`Set` indexing, narrowed state scope, concurrent reads, or lazy boundaries).
3. Add or update colocated Vitest regression tests ensuring behavior, edge cases, and accessibility remain intact.
4. Re-run the exact same measurement on a fresh production build under identical conditions and report matched before/after numbers honestly.

## 5. Validate within repository guardrails

1. For **Mode B**, inspect the diff to confirm only intended files changed and format changed files only:
   `npx --no-install prettier --write <changed-files>`
2. Run read-only verification checks (`lint`, `format:check`, `test`, `typecheck`, `build`). Use `npm.cmd` and `npx.cmd` on Windows PowerShell if `.ps1` launchers are blocked.
3. **Approval gates**: Do not install new dependencies (including bundle analyzers or virtualization libraries), enable React Compiler, add CI gates, modify deployment configs, or commit/push without explicit user approval.
4. Clearly separate **measured production-build data** from **unverified live browser / Core Web Vitals / field telemetry**.

## 6. Deliver findings and handoff

Report concisely in this order:

1. Scope audited/optimized, execution mode (Audit vs. Optimization), and target user journey.
2. Findings ranked by impact (`High`, `Medium`, `Low`) with exact file/line references, bottleneck mechanism, and concrete minimal fix (or applied change in Mode B).
3. Matched before-and-after measurements (conditions, build output sizes, timings, or run counts) for Mode B.
4. Files modified, regression tests added, and exact validation commands executed with observed results.
5. Unverified browser/runtime measurements and recommended follow-up.

## Skill boundaries

- Use **this skill** (`audit-performance`) to audit, profile, and apply evidence-based optimizations for bundles, rendering, complexity, virtualization, loading waterfalls, and assets.
- Use `enhance-feature` for routine feature or component polish and general cleanup without a performance investigation.
- Use `refactor-architecture` when structural layering, module ownership, or cross-feature boundaries must change.
- Use `audit-accessibility` for WCAG 2.2, keyboard/focus, ARIA, and reduced-motion audits or remediation.
- Use `audit-security` for trust boundaries, auth/session enforcement, input/URL validation, and CI/header security.
- Use `verify-release` for end-to-end built-app, routing, and deployment release checks.
- Use `sync-docs` when documentation needs synchronization after verified changes.
