# Shared UI, Boundaries & Validation

Use this reference when deciding where reusable UI belongs, enforcing `.oxlintrc.json` module boundaries, and selecting verification checks.

## 1. Promoting reusable UI

Keep feature-specific terminology, state hooks, translations, and business rules inside `src/features/<feature>/`. Promote UI to `src/shared/components/` only when it is domain-independent and has a concrete second consumer. Keep `src/shared/` strictly independent of `app/`, `routes/`, and `features/`.

## 2. Oxlint & architectural boundaries (`.oxlintrc.json`)

Every new or modified file must satisfy these rules:

- **Feature barrel discipline (`no-restricted-imports`)**: Outside a feature, import only from `@/features/<name>` (resolving `index.ts`). Never deep-import `@/features/<name>/<submodule>`.
- **Relative sibling imports inside features**: Inside `src/features/<name>/`, import sibling files directly (`./...`, `../...`) and never import your own `index.ts` barrel (`import/no-cycle`).
- **One-way dependency layering (`no-restricted-imports`)**:
  - `src/{features,lib,server}/**/*` must **not** import from `app/` or `routes/`.
  - `src/shared/**/*` must **not** import from `app/`, `features/`, or `routes/`.
- **Hooks & type safety**: Respect `react/rules-of-hooks`, `react/only-export-components`, `jsx-a11y/alt-text`, and avoid `any` (`typescript/no-explicit-any`) and unguarded non-null assertions (`typescript/no-non-null-assertion`).

## 3. Accessibility & UI quality gate

- Native interactive elements (`<button type="button">`, `<a href>`, `<input>`, `<label>`); never mimic buttons/links with clickable `<div>`/`<span>`.
- Visible labels on every form control, accessible names on icon-only buttons, `aria-hidden="true"` on decorative icons.
- Validation errors linked with `aria-describedby` and `aria-invalid`; async loading/results announced via `role="status"` (`aria-live="polite"`) or `role="alert"` for errors.
- Dialogs provide title, initial focus, Tab/Shift+Tab containment, Escape dismissal, visible close button, and focus restoration to the trigger.
- Check narrow and wide viewports plus both light and dark themes (where supported).

## 4. Verification command matrix

Run from the repository root. On Windows PowerShell, use `npm.cmd` and `npx.cmd` if `.ps1` launchers are blocked.

### Format changed files first

```sh
npx --no-install prettier --write <changed-files>
npx --no-install prettier --check <changed-files>
```

### Project verification suite

```sh
npm run lint
npm run format:check
npm run test
npm run typecheck
npm run build
```
