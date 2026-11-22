# Performance Audit Checklist & Measurement Guide

Use this procedural checklist alongside `AGENTS.md` and repository performance/database guides under `docs/` when present. Consult repository guides for framework- and stack-specific APIs.

## 1. Impact classification

| Impact | Criteria                                                                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High   | User-visible input lag (INP > 200 ms), large unused code on the critical entry path, `O(n^2)` hot-path loops, unreserved LCP/CLS, or query amplification on polling. |
| Medium | Avoidable full-subtree re-renders, sequential request waterfalls, heavy optional libraries bundled eagerly, or redundant media decode work.                          |
| Low    | Minor redundant allocations, unmeasured speculative memoization clutter, or missing regression checks for known hotspots.                                            |

## 2. Surface-by-surface inspection checklist

### Delivery, bundles, and code splitting (when frontend present)

- Inspect emitted production artifacts in the repository's configured build output directory, comparing raw and compressed sizes consistently.
- Check lazy-loading boundaries for secondary routes and heavy optional widgets (maps, charts, rich editors), verifying space-preserving loading fallbacks, error recovery, and safe preload-retry handling without reload loops.
- Flag wildcard/namespace imports that block tree shaking, wide re-export barrels pulled into critical entry paths, and duplicate heavy libraries in the project lockfile.
- Verify bundler splitting/externalization settings match the installed build tool version and avoid manual chunking without trace evidence.

### UI rendering, state scope, and framework primitives (when frontend present)

- Verify fast-changing interaction state sits near its consumers rather than in broad shared providers.
- Check client stores and server-query caches for coarse subscriptions that trigger unrelated re-renders, and keep ephemeral UI flags out of persisted storage.
- Flag effects or lifecycle hooks that mirror props, query results, or derived values back into local state.
- Reject speculative memoization or caching wrappers added without measured render cost or a documented stable-reference requirement; prefer built-in non-blocking/concurrent update primitives when heavy UI transitions compete with urgent input.

### Data structures and algorithmic complexity

- Flag nested linear searches/membership checks inside loops, mappers, or row renderers (`O(n*m)` / `O(n^2)`); pre-index lookup targets into hash maps/sets (`O(n + m)`) before iterating.
- Flag repeated array/object cloning inside reductions or front-of-array mutations inside loops.
- Keep stored state cleanly serializable and derive indexed lookups cleanly during render or transformation (guarding dynamic untrusted keys against prototype/key collisions using safe map structures).

### Assets, network waterfalls, and Core Web Vitals (when frontend present)

- Flag sequential independent I/O awaits that can run concurrently, missing request cancellation signals, un-debounced search-as-you-type requests, and background polling that continues when viewing paginated deeper pages or terminal records.
- **LCP (<= 2.5 s) & images:** Verify the critical LCP visual resource is discovered early, not deferred lazily, sized appropriately, and respects configured public base paths; defer below-the-fold images lazily and apply preload hints only when traces confirm delayed discovery on routes that actually use the asset.
- **CLS (<= 0.1):** Verify media containers, loading placeholders, and fonts reserve stable space without causing layout shifts.

### Optional backend API, database, and media processing (when present)

- Inspect polled or list endpoints for query roundtrip amplification (e.g., `N` parallel count queries or repeated remote auth verification calls) and unbounded in-memory caches/rate-limit maps.
- Check paginated database queries for composite indexes aligned with filter + tie-breaker cursor sort order rather than deep offset scans on growing tables.
- Check upload handlers for pre-decode byte limits, bounded image/media decoding, metadata stripping, and immutable long-lived cache headers on content-addressed assets.

## 3. Useful read-only audit patterns

Adapt search patterns to the language and discovered source directories in the repository:

- Wildcard/barrel imports on critical entry modules.
- Deprecated bundler chunking options in build configs.
- Speculative memoization wrappers lacking profiling rationale.
- Nested collection lookups inside loop or render bodies.
- Unconsolidated count queries or sequential awaits in backend handlers.

## 4. Matched measurement and verification steps

### Before/after comparison log (Mode B)

Record identically for baseline and candidate production builds:

- Baseline commit vs. candidate changes
- Target route, interaction, or API endpoint plus synthetic fixture
- Viewport, network/CPU throttling, cache state (cold vs. warm), and run count
- Median and spread for each metric (emitted bytes, compressed transfer bytes, DB roundtrips, render/INP/LCP/CLS or endpoint latency)

### Verification suite (Mode B)

1. Format modified files using the repository's configured formatter.
2. Run the repository's configured production build and serve built outputs locally using configured preview/start commands to measure cleanly.
3. Run all configured static analysis, format-check, test, type-check, and build verification commands via the project's runner.
