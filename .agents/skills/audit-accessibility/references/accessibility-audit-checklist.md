# Accessibility Audit Checklist & Verification

Use this procedural checklist alongside `AGENTS.md` and repository UI/testing guides under `docs/` when present.

## 1. Severity classification

| Severity | Criteria                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical | Keyboard trap, completely inoperable control via keyboard, missing accessible name on primary action/form control, or broken modal escape.    |
| High     | Missing/broken focus restoration, unreadable error/status updates, unassociated form labels/errors, clickable non-semantic tags, or contrast. |
| Medium   | Improper heading/landmark nesting, missing hidden attribute on decorative icons, incomplete reduced-motion, or untranslated ARIA labels.      |
| Low      | Missing semantic/keyboard regression tests for existing guards, or documentation drift on assistive-technology notes.                         |

## 2. Domain-by-domain inspection checks

### Semantics, landmarks, and headings

- Page-level banner (`<header>`) and footer (`<footer>`) landmarks sit outside `<main>` and nested sectioning elements.
- Render only one `<main>` landmark per rendered view—when an outer layout shell owns `<main>`, child views render `<section>` (with an accessible label) or generic containers instead of a nested `<main>`.
- Include a keyboard-discoverable skip-to-content link targeting the primary content container when multi-section navigation precedes content.
- Distinguish multiple `<nav>` landmarks with unique `aria-label` or `aria-labelledby` names.
- Use native buttons (`<button type="button">` or explicit `type="submit"` inside forms) for actions and native links (`<a href>` or router links) for navigation—never clickable generic elements (`<div>`, `<span>`).
- Give informative images meaningful `alt` descriptions and set empty `alt` (`alt=""`) on purely decorative images.

### Forms, icons, and live announcements

- Pair every form input, textarea, select, and custom combobox with a visible associated `<label>` (matching `for` / framework attribute or wrapping) or explicit accessible name where design constrains visible labels.
- Mark invalid fields (`aria-invalid="true"` when invalid) and link visible validation text via `aria-describedby`.
- Give icon-only buttons an explicit accessible name (`aria-label`) and hide decorative icons/SVGs (`aria-hidden="true"`).
- Keep the control's accessible name intact during pending states and expose busy state (`aria-busy="true"`).
- Announce async completion or status updates in a persistent polite live region (`role="status"` / `aria-live="polite"`); use `role="alert"` for urgent errors.

### Keyboard navigation, focus, and modals/widgets

- Maintain logical DOM/Tab order with visible, unobscured keyboard focus styles (never remove focus outlines without a clear `:focus-visible` replacement).
- Ensure modal dialogs and drawers provide:
  - Accessible title (`aria-labelledby`) and optional description (`aria-describedby`).
  - Intentional initial focus inside the dialog upon opening.
  - Circular Tab and Shift+Tab containment skipping disabled, hidden, inert, and negative-tabindex controls.
  - Escape key dismissal and a visibly labeled close control.
  - Focus restoration to the triggering control on close (or a clear fallback if the trigger unmounted).
  - Background isolation (`inert` or equivalent) while open.
- Verify virtualized lists/tables and custom composite widgets preserve active item accessibility, keyboard navigation, and focus recovery when items unmount or filter.

### Themes, contrast, responsive layout, motion, and localization

- Never rely on color alone to signal errors, status, steps, or selection (pair with text, icons, or ARIA state).
- Verify sufficient contrast across every configured theme mode (including inside portaled dialogs and overlays).
- Verify narrow viewports allow labels and actions to wrap cleanly without horizontal clipping, overlapping controls, or unreachable buttons.
- Respect `prefers-reduced-motion` across transitions/animations and ensure reveal content stays readable without motion triggers.
- When localized, verify every `aria-label`, `title`, `alt`, validation error, skip link, and status announcement uses static keys updated across all configured locales.

## 3. Useful read-only audit searches

Substitute `<frontend-src>` with the repository's discovered UI source directory (adapting event attribute patterns to the repository's template syntax):

```sh
git grep -n "tabindex\|tabIndex" <frontend-src>
git grep -n "aria-\|role=" <frontend-src>
git grep -n "outline-none\|outline: none" <frontend-src>
```

## 4. Verification steps (Mode B)

1. Format modified files using the repository's configured formatter.
2. Run the repository's configured lint, format, unit/component test, type-check, and build commands using the project's configured runner.
3. Explicitly note in the handoff that automated DOM tests validate roles, labels, ARIA states, and synthetic events, whereas real-browser focus visuals, computed theme contrast, responsive wrapping, and screen-reader announcements (NVDA, VoiceOver, JAWS) remain unverified unless manually tested.
