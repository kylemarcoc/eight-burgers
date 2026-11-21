# Performance Audit Checklist & Measurement Guide

Use this reference alongside `docs/performance.md` when auditing or optimizing applications.

## 1. Impact classification

| Impact | Criteria                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| High   | User-visible input lag (INP > 200 ms), large unused JS on the critical entry path, `O(n^2)` hot-path loops, or unreserved LCP/CLS.  |
| Medium | Avoidable full-subtree re-renders, sequential request waterfalls, heavy optional libraries bundled eagerly, or unbounded DOM lists. |
| Low    | Minor redundant allocations, unmeasured speculative memoization clutter, or missing regression checks for known hotspots.           |

## 2. Surface-by-surface inspection checks

### Bundle & entry graph

- Inspect emitted Vite assets (`dist/assets/`) comparing raw and compressed sizes consistently. Confirm Vite 8 chunking uses `build.rolldownOptions` (never deprecated `build.rollupOptions`) and avoids premature manual chunk splitting.
- Check for namespace imports that defeat tree shaking (for example, `import * as Icons from 'lucide-react'`).
- Check for wide re-export barrels pulled into cold entry routes or heavy optional SDKs imported statically instead of via dynamic `import()`.
- Inspect `package-lock.json` for duplicate heavy packages or large utilities added for trivial tasks.

### React rendering, state scope, and React 19 primitives

- Verify interaction state lives close to its consumers and fast-changing values are not placed in broad Context providers.
- Verify Zustand/store consumers subscribe to narrow slices (`useShallow` when deriving objects/arrays) and TanStack Query consumers use `select` where appropriate.
- Flag `useEffect` blocks that mirror props, query results, or derived calculations back into state.
- Verify render functions and hooks stay strictly pure (compiler-ready: no mutations or `ref.current` reads/writes during render).
- Reject speculative `memo`, `useMemo`, and `useCallback` wrappers without measured render cost or an explicit stable-identity contract.
- Evaluate `useTransition` / `useDeferredValue` when heavy updates block typing/toggling, and `<Activity mode="hidden">` (React 19.2+ apps only).

### Algorithmic complexity & large collections

- Flag `.find()`, `.includes()`, or `.indexOf()` inside loops, `.map()`, `.filter()`, or virtualized row renderers (`O(n*m)` / `O(n^2)`). Replace with pre-indexed `Map` or `Set` lookups (`O(n + m)`).
- Flag array/object spreading inside `reduce` (`[...acc, item]`) and `shift`/`unshift` inside loops.
- Keep authoritative state serializable (arrays/plain records) and derive `Map`/`Set` lookup indices during render (memoized only when measured).
- Prefer `Map` (or `Object.hasOwn`) for dynamic or untrusted string keys to avoid prototype collisions.

### Network waterfalls, assets, and Core Web Vitals

- Check for sequential independent `await` calls that can run concurrently via `Promise.all`.
- Check for missing `AbortSignal` forwarding on cancellable reads and redundant refetches missing shared keys or cache lifetimes.
- **LCP (<= 2.5 s):** Verify the LCP image/content is discoverable early, not `loading="lazy"`, sized appropriately (`srcSet`/`sizes` or `<picture>`), and prioritized (`fetchPriority="high"`) only when the waterfall supports it.
- **CLS (<= 0.1):** Verify images, media, and async `Suspense` fallbacks reserve explicit dimensions or aspect ratios, and web fonts avoid layout shifts.
- **Server & background jobs:** Measure upload, queue wait, execution, and download stages separately on representative synthetic fixtures; verify large binary transfers bypass serverless request limits via signed storage URLs.

## 3. Useful read-only audit searches

Run from the repository root:

```sh
git grep -n "import \* as" src
git grep -n "rollupOptions" src
git grep -n "useMemo\|useCallback\|React\.memo\|memo(" src
git grep -n "loading=\"lazy\"\|fetchPriority\|<img\|<picture" src
```

## 4. Production measurement & verification commands

Run from the repository root. Use `npm.cmd` and `npx.cmd` on Windows PowerShell if `.ps1` launchers are blocked.

### Build and inspect emitted output

```sh
npm run build
```

Serve a production build locally for browser profiling:

- `npm run preview`

Record for every matched comparison:

- Baseline commit vs. candidate changes
- Target route/interaction and synthetic fixture
- Viewport, throttling/CPU profile, cache state (cold vs. warm), and run count
- Median and spread for each metric (emitted bytes, compressed transfer bytes, commit/INP/LCP/CLS timings)

### Format changed files only (Mode B)

```sh
npx --no-install prettier --write <changed-files>
npx --no-install prettier --check <changed-files>
```

### Verification suite (Mode B)

```sh
npm run lint
npm run format:check
npm run test
npm run typecheck
npm run build
```
