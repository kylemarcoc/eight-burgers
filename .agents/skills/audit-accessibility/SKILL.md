---
name: audit-accessibility
description: >-
  Audit and remediate accessibility (WCAG 2.2), semantic HTML, keyboard
  navigation, focus management, ARIA attributes, live announcements, theme
  contrast, reduced-motion, and localized accessible labels against
  docs/component-guidelines.md and docs/testing-strategy.md. Use when reviewing
  or fixing a11y gaps; not for general feature polish
  without an accessibility focus (use enhance-feature), or security audits (use audit-security).
---

# Audit Accessibility

Systematically audit or remediate accessibility contracts against WCAG 2.2 and `docs/component-guidelines.md`. Because Oxlint enforces only `jsx-a11y/alt-text` as a warning and CI has no automated axe or screen-reader gate, verify semantics, keyboard behavior, focus management, live regions, contrast/theme parity, and reduced motion directly in source and tests—and clearly separate DOM-verified checks from manual assistive-technology verification.

## 1. Establish mode and scope

1. Read `AGENTS.md`, `docs/component-guidelines.md` (`Interaction and accessibility`), and `docs/testing-strategy.md` (`Accessibility and browser review`).
2. Inspect the target scope (`package.json`, `.oxlintrc.json`, component/route source, stylesheets, colocated tests, and locale files if localized).
3. Determine the execution mode:
   - **Mode A — Accessibility Audit (read-only default):** When asked to audit or review an app, route, feature, or component for accessibility, inspect source, styles, and tests without editing files and deliver prioritized, file-backed findings.
   - **Mode B — Targeted Remediation:** When asked to fix accessibility defects, scope the exact files, ARIA/focus/markup changes, synchronized locale updates (if localized), and colocated regression tests before editing.
4. Preserve visual design intent, public component props/refs, routes, deployment base paths, and unrelated behavior unless an accessibility fix explicitly requires updating a public contract.

## 2. Load the accessibility checklist and relevant guides

Load [Accessibility audit checklist](./references/accessibility-audit-checklist.md) for severity tiers, concrete DOM/ARIA/keyboard red flags, and verification commands.
Consult `docs/` selectively:

- Semantics, forms, dialogs, focus, motion, and localization rules: `docs/component-guidelines.md`
- RTL semantic queries, keyboard/focus tests, and browser review limits: `docs/testing-strategy.md`
- Naming, TypeScript, and React 19 refs: `docs/coding-standards.md`
- Virtualization focus preservation and reduced motion: `docs/performance.md`

## 3. Audit by accessibility domain

Inspect only the surfaces relevant to the target scope using actual source and styles:

1. **Landmarks, headings, and native semantics:**
   - Verify page landmarks (`<header>`, `<nav>`, `<main>`, `<footer>`, skip-to-content link) are properly nested (page-level header/footer outside `<main>`, only one `<main>` per page so child and fallback/not-found routes inside a layout shell render `<section>` or `<div>`) and multiple `<nav>` regions have distinct accessible names.
   - Verify heading hierarchy is logical and meaningful (no skipped structural levels for styling).
   - Flag clickable `<div>`/`<span>` elements imitating controls; require native `<button type="button">` (or explicit `type="submit"`), `<a href>`, `<input>`, `<select>`, `<textarea>`, or `<details>/<summary>`.
2. **Labels, forms, and error/status announcements:**
   - Verify every form input has a visible associated `<label htmlFor>` (or explicit accessible name where design calls for it) and icon-only controls have an accessible `aria-label` while decorative icons set `aria-hidden="true"`.
   - Verify validation errors wire `aria-invalid` and `aria-describedby` to the offending control and remain readable in both light and dark themes (`text-ui-error`).
   - Verify asynchronous progress/results announce via a persistent polite live region (`role="status"` / `aria-live="polite"`) and urgent failures use `role="alert"`. Confirm loading buttons keep their accessible name intact and expose `aria-busy="true"`.
3. **Keyboard navigation, focus visibility, and modal/widget patterns:**
   - Check that every interactive control is reachable and operable via keyboard (`Tab`, `Shift+Tab`, `Enter`, `Space`, arrow keys where applicable) with visible, unobscured focus styles.
   - For dialogs: verify accessible title (`aria-labelledby`), intentional initial focus, Tab/Shift+Tab wrapping skipping disabled/hidden/inert/negative-tabindex controls, Escape dismissal, a visible close button, focus restoration to the trigger, and background operability/inertness.
   - For custom widgets and virtualized controls: verify ARIA roles (`combobox`, `listbox`, `option`), `aria-activedescendant` staying mounted while scrolling, Home/End/typeahead behavior, and focus preservation when rows unmount or filter.
4. **Themes, contrast, narrow viewports, motion, and localization:**
   - Check that status, error, and selection states never rely on color alone (paired with text/icon/state attribute).
   - Check semantic `--ui-*` / `ui-*` token usage for both light and dark `data-ui-theme` subtrees (including portaled dialogs and toasts).
   - Check narrow-viewport wrapping, touch targets, and overflow usability without trapping focus or clipping controls.
   - Check `prefers-reduced-motion` handling so animations/transitions disable cleanly and reveal content stays visible.
   - In localized apps, verify every accessible name, `aria-label`, `closeLabel`, skip link, validation message, and live-region announcement is translated across all configured locale files using static keys.

## 4. Remediate safely (Mode B only)

When implementing fixes:

1. Prefer native HTML semantics before layering custom ARIA attributes.
1. Update all configured locale resources together when adding or changing accessible names or announcements in localized apps (keep English-only apps English-only).
1. Add or strengthen colocated Vitest + React Testing Library tests querying by role, accessible name, and label—covering keyboard navigation, Escape/Tab wrapping, focus restoration, `aria-invalid`/`aria-describedby`, `aria-busy`, and live-region announcements.

## 5. Validate within repository guardrails

1. For **Mode B**, inspect the diff to confirm only intended files changed and format changed files only:
   `npx --no-install prettier --write <changed-files>`
2. Run read-only verification checks (`lint`, `format:check`, `test`, `typecheck`, `build`). Use `npm.cmd` and `npx.cmd` on Windows PowerShell if `.ps1` launchers are blocked.
3. **Approval gates**: Do not install new accessibility packages (such as `jest-axe` or `@testing-library/user-event`) or alter CI workflows without explicit user approval, and never commit/push without approval.
4. Clearly separate **DOM/RTL-verified contracts** from **unverified real-browser focus, computed color contrast, and screen-reader (NVDA/VoiceOver/JAWS) checks**.

## 6. Deliver findings and handoff

Report concisely in this order:

1. Scope audited/remediated and execution mode (Audit vs. Remediation).
2. Findings ranked by severity (`Critical`, `High`, `Medium`, `Low`) with exact file/line references, WCAG/user impact, and concrete fix (or status if fixed in Mode B).
3. Files modified, locale/test updates (Mode B).
4. Exact commands executed and observed results.
5. Unverified manual checks (real-browser focus ring/scroll behavior, computed contrast at both themes, and assistive-technology announcements) and recommended follow-up.

## Skill boundaries

- Use **this skill** (`audit-accessibility`) to audit or remediate WCAG 2.2, semantic HTML, keyboard/focus management, ARIA contracts, live regions, contrast/theme parity, reduced motion, and translated accessible labels.
- Use `enhance-feature` for general feature or component UX/state/error polish without a dedicated accessibility audit.
- Use `audit-performance` for evidence-based rendering, virtualization, or bundle optimization.
- Use `audit-security` for trust boundaries, XSS/URL safety, auth/session enforcement, and CI/header security.
- Use `verify-release` for end-to-end built-app release verification across deployments.
- Use `sync-docs` when documentation needs synchronization after verified changes.
