# Accessibility Audit Checklist & Verification

Use this reference alongside `docs/component-guidelines.md` and `docs/testing-strategy.md` when auditing or remediating accessibility.

## 1. Severity classification

| Severity | Criteria                                                                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical | Keyboard trap, completely inoperable control via keyboard, missing accessible name on primary action/form control, or broken modal escape.                        |
| High     | Missing/broken focus restoration, unreadable error/status updates, unassociated form labels/errors, clickable non-semantic `div`/`span`, or failing contrast.     |
| Medium   | Improper heading/landmark nesting, missing `aria-hidden` on decorative icons, incomplete `prefers-reduced-motion`, or untranslated ARIA labels in localized apps. |
| Low      | Missing RTL semantic/keyboard regression tests for existing guards, or documentation drift on known assistive-technology notes.                                   |

## 2. Domain-by-domain inspection checks

### Semantics, landmarks, and headings

- Page-level `<header>` and `<footer>` sit outside `<main>` and sectioning elements so banner and content-info landmarks expose cleanly.
- Skip-to-content link targets `<main>` (or primary content container) and becomes visible on keyboard focus.
- Multiple `<nav>` landmarks carry distinct accessible names (`aria-label` or `aria-labelledby`).
- Interactive actions use `<button type="button">` (or explicit `type="submit"` inside forms) and navigation uses `<a href>` (or router link). No clickable `<div>`/`<span>` pretending to be controls.
- Images have meaningful `alt` text, or `alt=""` when purely decorative.

### Forms, icons, and live announcements

- Every `<input>`, `<textarea>`, `<select>`, and custom combobox has a visible `<label htmlFor>` (or explicit accessible name where required).
- Invalid controls set `aria-invalid="true"` (or `Boolean(error)`) and link to visible error text via `aria-describedby`.
- Icon-only buttons supply an accessible name (`aria-label`), while decorative icons set `aria-hidden="true"`.
- Pending actions preserve the control's accessible name and expose `aria-busy="true"`.
- Async results and status updates render in a persistent polite live region (`role="status"`, `aria-live="polite"`); urgent failures use `role="alert"`.

### Keyboard navigation, focus, and modals/widgets

- All interactive controls appear in logical DOM/Tab order with visible, unobscured focus rings (no `outline: none` without a clear `:focus-visible` replacement).
- Modal dialogs provide:
  - Accessible title (`aria-labelledby`) and optional description (`aria-describedby`).
  - Intentional initial focus (`initialFocusRef` or first available interactive control).
  - Tab and Shift+Tab containment skipping disabled, hidden, inert, and `tabIndex < 0` controls.
  - Escape key dismissal and a visible close button with an accessible label.
  - Focus restoration to the trigger (or a logical fallback if the trigger unmounts).
  - Background isolation (`inert` or equivalent) while open.
- Virtualized lists/tables and custom comboboxes preserve active item accessibility (`aria-activedescendant`), keyboard navigation, and focus recovery after filtering or unmounting.

### Themes, contrast, responsive layout, motion, and localization

- Color never serves as the sole indicator of error, warning, success, current step, or selection state (pair with text, icons, or ARIA state).
- Both light and dark themes (`data-ui-theme="light"` / `"dark"`) use semantic `--ui-*` / `ui-*` tokens with sufficient contrast, including inside portaled dialogs and toasts.
- Narrow viewports let labels wrap without horizontal clipping, overlapping controls, or unreachable actions.
- Animations/transitions respect `@media (prefers-reduced-motion: reduce)` and reveal content remains visible without JavaScript observation or motion.
- Localized apps keep every `aria-label`, `title`, `alt`, error message, skip link, and status announcement synchronized across all configured locale files using static keys.

## 3. Useful read-only audit searches

Run from the repository root:

```sh
git grep -n "onClick=" src
git grep -n "tabIndex" src
git grep -n "aria-\|role=" src
git grep -n "outline-none\|outline: none" src
```

## 4. Verification commands

Run from the repository root. Use `npm.cmd` and `npx.cmd` on Windows PowerShell if `.ps1` launchers are blocked.

### Format changed files only (Mode B)

```sh
npx --no-install prettier --write <changed-files>
npx --no-install prettier --check <changed-files>
```

### Full project checks (Mode B)

```sh
npm run lint
npm run format:check
npm run test
npm run typecheck
npm run build
```

Note that `jsdom` + React Testing Library validates DOM roles, labels, ARIA states, and synthetic keyboard handlers, while real-browser focus visuals, computed contrast across themes, narrow-viewport layout, and assistive-technology announcements (NVDA, VoiceOver, JAWS) require manual verification and must be reported honestly as unverified if not performed.
