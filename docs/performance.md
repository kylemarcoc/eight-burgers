# Performance

Measure a user journey on a production build before optimizing it. Start with what the user waits for—such as initial route rendering, interactive list filtering, or a server-backed workflow step. Identify the cost in a trace, make the smallest change that addresses it, and repeat the same measurement. Separate browser rendering, network transfer, and backend processing so the change targets the work that causes the delay.

## Choosing an optimization

| Observed problem                                  | Try first                                                                                                                              | Evidence to compare                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Slow initial render with much unused JavaScript   | Inspect the entry graph and defer a large secondary route or feature                                                                   | Initial JavaScript bytes, parse and execution time, LCP, and first use of the deferred feature |
| Slow interaction with repeated React updates      | Scope the state or subscription and remove redundant synchronization. Memoize an expensive calculation or subtree if it remains costly | React commit durations and browser interaction timing before and after                         |
| Slow scrolling or filtering in a large collection | Limit records fetched or rendered. Virtualize when the interaction needs continuous scrolling                                          | DOM size, scripting and layout time, scroll behavior, and keyboard focus                       |
| Slow filtering, joining, or repeated lookups      | Replace nested array scans (`O(n·m)` / `O(n²)`) with a `Map` or `Set` index (`O(n + m)`)                                               | Scripting time on representative collection sizes before and after                             |
| Expensive UI updates block typing or tab toggle   | Mark non-urgent updates with `useTransition` or `useDeferredValue`, or preserve hidden stateful panels with `<Activity mode="hidden">` | Input latency (INP), main-thread long tasks, and toggle responsiveness before and after        |
| Repeated requests or long request chains          | Reuse cached results, run independent reads concurrently, and cancel superseded reads                                                  | Request count, transferred bytes, and time to usable data                                      |
| Late or shifting primary content                  | Identify the LCP element or shift source. Reserve space and prioritize the critical resource                                           | LCP phases, layout shifts, and image or font requests at relevant widths                       |
| Slow server job, preview, or file export          | Time upload, job wait and execution, and file transfer separately                                                                      | Stage durations on the same representative fixture and environment                             |

## Rendering and assets

### React rendering and memoization

React can render a component after its own state changes, a consumed context or store subscription updates, or its parent renders. Measure render and commit cost before changing the component. Keep interaction state near its consumers, subscribe to the specific state the view uses, derive cheap values during render, put interaction-driven work in event handlers, and reserve Effects for external synchronization. See [Component guidelines](component-guidelines.md) and [State management](state-management.md#subscriptions-and-performance).

| Tool          | When it helps                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `memo`        | An expensive child often renders when its parent updates and usually receives unchanged props. Its own state or consumed context can still update it.              |
| `useMemo`     | A pure calculation is expensive, its inputs often stay unchanged, and the cache saves measurable work. It can also stabilize a computed prop for a memoized child. |
| `useCallback` | A memoized child or another consumer benefits from a stable function identity. Use it where that identity matters to the consumer.                                 |

Include every reactive dependency and compare commit and browser interaction timing on the same user path. See [`memo`](https://react.dev/reference/react/memo), [`useMemo`](https://react.dev/reference/react/useMemo), and [`useCallback`](https://react.dev/reference/react/useCallback).

```tsx
import { useMemo } from 'react';

type ResultItem = { id: string; label: string };

export function FilterableList({ items, query }: { items: readonly ResultItem[]; query: string }) {
  const matchingItems = useMemo(() => {
    const search = query.trim().toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(search));
  }, [items, query]);

  return (
    <ul>
      {matchingItems.map((item) => (
        <li key={item.id}>{item.label}</li>
      ))}
    </ul>
  );
}
```

For expensive UI updates that compete with urgent input, mark non-urgent state updates with `useTransition` or defer derived values with `useDeferredValue`. For frequently toggled stateful panels on React 19.2+, evaluate `<Activity mode="visible" | "hidden">` to preserve state and DOM while deprioritizing background updates. See [`useTransition`](https://react.dev/reference/react/useTransition), [`useDeferredValue`](https://react.dev/reference/react/useDeferredValue), and [`Activity`](https://react.dev/reference/react/Activity).

Keep render functions and hooks strictly pure (following the Rules of React) so components remain React Compiler ready, and measure before adding manual memoization.

### Images, fonts, and motion

- Serve images close to their displayed size (`srcSet`/`sizes` or `<picture>`), evaluate AVIF or WebP, and reserve dimensions or aspect ratios to prevent layout shift.
- Use `loading="lazy"` for below-the-fold images; keep the measured LCP image eager and discoverable early. See [LCP resource loading](https://web.dev/articles/optimize-lcp).
- Serve only used font weights and subsets (preferring WOFF2) with intentional `font-display` and fallback metrics.
- Preserve layout dimensions, responsive behavior, and `@media (prefers-reduced-motion: reduce)` fallbacks.

## Lazy loading

### Vite + React Router apps

Keep the main entry path available early. Prefer a route boundary for an expensive secondary route, and defer an individual feature or optional SDK (via dynamic `import()`) when heavy or interaction-triggered. In React Router declarative mode (`BrowserRouter` + `Routes`), use module-scope `React.lazy` and `Suspense`. See [React Router modes](https://reactrouter.com/start/modes) and [React lazy](https://react.dev/reference/react/lazy).

```tsx
import { lazy, Suspense } from 'react';

const SecondaryPage = lazy(() => import('../../routes/SecondaryPage'));

export function DeferredSecondary({ loadingLabel }: { loadingLabel: string }) {
  return (
    <Suspense fallback={<p role="status">{loadingLabel}</p>}>
      <SecondaryPage />
    </Suspense>
  );
}
```

Reserve fallback space to prevent layout shifts. Vite exposes `vite:preloadError` for failed dynamic imports after deployments—offer a controlled recovery path without automatic reload loops. See [Vite load error handling](https://vite.dev/guide/build#load-error-handling).

## Virtualization

Start with a bounded page or list. Move filtering and pagination to the API when dataset size or transfer cost exceeds what the browser should hold. When rendering or scrolling a large collection is measured as expensive and users need continuous scrolling, evaluate `@tanstack/react-virtual` (only when installed and justified), give the scroll container a bounded height, use stable row keys, keep row renderers free of `O(n)` scans, and preserve keyboard focus and semantic roles across unmounted rows. See [TanStack Virtual API](https://tanstack.com/virtual/latest/docs/api/virtualizer).

## Data structures and algorithmic complexity

Keep small, bounded collections simple: plain array scans are readable and fast when a list has few items. Index into a `Map` or `Set` when repeated lookups, joins, deduplication, or membership checks run inside loops, virtualized row renderers, interactive filters, or larger datasets.

| Structure                       | Lookup / membership                                              | Insert / delete                                                                     | Iteration                        | Best fit and guardrails                                                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Array` (`T[]`, `readonly T[]`) | `O(1)` by index; `O(n)` by value (`find`, `includes`, `indexOf`) | `O(1)` amortized at end (`push`/`pop`); `O(n)` at start/middle (`shift`, `unshift`) | `O(n)`                           | Ordered sequences, rendered lists, JSON payloads, and small collections. Avoid scanning an array inside another loop.                                                                            |
| Plain object (`Record<K, V>`)   | `O(1)` average by string or symbol key                           | `O(1)` average (frequent dynamic `delete` can deoptimize object shapes)             | `O(n)` (`Object.keys`/`entries`) | Fixed schemas, static lookup tables, and JSON-serializable state. For dynamic or untrusted keys, guard against prototype keys (`__proto__`, `constructor`) with `Object.hasOwn` or prefer `Map`. |
| `Map<K, V>`                     | `O(1)` average (`get`, `has`)                                    | `O(1)` average (`set`, `delete`); `O(1)` `.size`                                    | `O(n)` in insertion order        | Dynamic key-value indices, frequent additions or deletions, non-string keys, and untrusted string keys without prototype collisions. Not directly JSON-serializable.                             |
| `Set<T>`                        | `O(1)` average (`has`)                                           | `O(1)` average (`add`, `delete`); `O(1)` `.size`                                    | `O(n)` in insertion order        | Membership checks, allowlists, selection sets, and deduplication (`new Set(items)`).                                                                                                             |

- **Eliminate accidental `O(n·m)` and `O(n²)` passes:** Pre-index lookup targets into a `Map` or `Set` once (`O(m)`), then scan the outer collection in `O(n)` for `O(n + m)` total time. Avoid spreading arrays inside `reduce` (`[...acc, item]`) or calling `shift`/`unshift` inside loops.
- **Keep authoritative state serializable; derive indices:** Store plain arrays or records in state and derive `Map`/`Set` indices during render (or `useMemo` when measured). See [State management](state-management.md#choosing-a-state-owner).
- **Handle dynamic and untrusted keys safely:** Prefer `Map` (or check with `Object.hasOwn`) for untrusted string keys. See [Security](security.md#xss-prevention-and-input-validation).

```ts
type RecordItem = { id: string; categoryId: string; label: string };
type Category = { id: string; name: string };

export function indexSelectedLabels(
  items: readonly RecordItem[],
  categories: readonly Category[],
  selectedIds: readonly string[],
) {
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  const selectedIdSet = new Set(selectedIds);

  return items
    .filter((item) => selectedIdSet.has(item.id))
    .map((item) => ({
      id: item.id,
      label: item.label,
      categoryName: categoryNameById.get(item.categoryId) ?? 'Uncategorized',
    }));
}
```

## Network and processing

- When using TanStack Query v5, reuse cache entries and keys for equivalent requests, choose `staleTime` and `gcTime` deliberately, run independent reads concurrently, and forward `AbortSignal`. See [State management](state-management.md#server-state) and [API design](api-design.md#queries-and-request-lifetime).
- For server-backed binary processing and background jobs, transfer large files via signed URLs so files bypass serverless body limits, retain cancellation, and enforce size/concurrency caps documented in `README.md`.

## Bundle optimization

Inspect production output and actual Network requests before changing bundling. Compare raw and compressed transfer bytes consistently. Prefer selective named imports (such as `import { Check } from 'lucide-react'` rather than namespace imports), avoid wide re-export barrels on hot entry paths, and inspect `package-lock.json` for duplicate heavy packages. See [Coding standards](coding-standards.md#dependencies-and-review).

Vite 8 uses Rolldown for production bundling. Custom chunk settings use `build.rolldownOptions` (including `output.codeSplitting`), while older `build.rollupOptions` is deprecated. Keep automatic grouping until a trace shows a concrete benefit from manual chunking. See [Vite build options](https://vite.dev/config/build-options) and [Rolldown chunk options](https://rolldown.rs/reference/OutputOptions.codeSplitting).

## Core Web Vitals

Google's **good** thresholds are evaluated at the 75th percentile of page visits:

| Metric                          | Measures                                                                              | Good     | Where to investigate                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| Largest Contentful Paint (LCP)  | Time from navigation to painting the largest eligible in-viewport image or text block | ≤ 2.5 s  | Identify the element and break down server response, resource discovery, transfer, and render delay. |
| Interaction to Next Paint (INP) | Latency of a near-worst qualifying interaction during the visit                       | ≤ 200 ms | Reproduce the slow interaction and inspect input delay, event-handler work, and presentation delay.  |
| Cumulative Layout Shift (CLS)   | Unexpected layout movement in the largest shift burst                                 | ≤ 0.1    | Inspect shift clusters for late assets, font swaps, inserted content, and unstable fallbacks.        |

See [Web Vitals](https://web.dev/articles/vitals), [Total Blocking Time](https://developer.chrome.com/docs/lighthouse/performance/lighthouse-total-blocking-time), and [INP diagnostics](https://web.dev/articles/optimize-inp).

## Measuring changes

1. Choose the route, interaction, and metric using a representative non-sensitive fixture and record the baseline commit.
2. Run the production build (`npm run build` and `preview` / `start`) under matched browser/device/network conditions. See [build and preview scripts](../README.md#checks-and-builds) and [release checks](testing-strategy.md#release-checks).
3. Capture repeated cold-load and warm-navigation traces using Chrome DevTools Performance (including React Performance Tracks on React 19.2+), Network, and Lighthouse.
4. Report the route, conditions, run count, median/spread, and matched before-and-after metrics. See [Testing strategy](testing-strategy.md#frontend-validation) and [CI](../.github/workflows/ci.yml).

## Common anti-patterns

| Avoid                                                                              | Prefer                                                                                          |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Adding `memo`, `useMemo`, or `useCallback` throughout a tree                       | Find the triggering update and measure the expensive work.                                      |
| Eagerly loading every route or splitting each small component                      | Keep critical paths together and defer substantial work when it helps.                          |
| Rendering thousands of nodes or doing expensive synchronous work on each keystroke | Bound the result set and profile data preparation and rendering separately.                     |
| Nested array scans (`find`/`includes` in loops) or `reduce` array copies (`O(n²)`) | Pre-index lookups with a `Map` or `Set` (`O(n + m)`) and build results in a single linear pass. |
| Importing a large package for a small operation                                    | Reuse a supported focused import or a small existing implementation.                            |
| Duplicate reads, blanket refetches, and chained independent requests               | Reuse keys, invalidate narrowly, and start independent work together.                           |
| Full-size critical images with delayed discovery or shifting layout                | Size assets to their use, prioritize the measured LCP request, and reserve space.               |
| Reporting gains without matched measurements                                       | Capture the baseline and compare repeated runs under the same conditions.                       |

## Incremental adoption

Adopt improvements in the owning feature, route, or shared module while preserving public contracts, mobile layouts, keyboard behavior, and reduced motion. Document app-specific profiling limits in `README.md`. See [Feature structure](feature-structure.md) and [Architecture](architecture.md#exceptions-and-incremental-adoption).
