# Shared UI, Boundaries & Validation

Use this procedural checklist when deciding where reusable UI and contracts belong, preserving linter and architectural boundaries, and selecting verification checks across single-app or multi-package repositories. Defer language- and framework-specific details to `AGENTS.md` and `docs/` when present.

## 1. Promoting reusable UI and shared contracts

- Keep feature-specific terminology, state logic, and business rules inside the owning feature directory.
- Promote UI primitives to the app's shared UI layer (or shared UI package in a monorepo) only when domain-independent and reused across multiple consumers. Keep shared client modules independent of app wiring, routes, business features, and server code unless an explicit exception is documented in `AGENTS.md`.
- When the repository includes both client and backend layers, place shared validation schemas, domain constants, and pure cross-tier rules in the repository's shared contracts layer (or generated API/IDL contract boundary), independent of both client UI and backend server runtimes.

## 2. Architectural & linter boundaries

Inspect the project's configured linter rules and `AGENTS.md` before editing, and ensure every new or modified file preserves both tool-enforced and review-enforced boundaries:

- **Feature entry-point discipline:** Outside a feature, import only from its declared public entry point. Inside a feature, import sibling files via direct relative paths and avoid importing the feature's own public barrel to prevent circular dependencies.
- **One-way layering:** Features and shared client modules must never import from the app composition/bootstrap layer or route modules.
- **Strict client/server isolation (when a backend tier exists):** Client bundles must never import backend server modules or server-only dependencies; backend modules must never import frontend UI libraries; shared contracts must import neither client UI nor server runtime packages.
- **Safety & static rules:** Preserve framework hook/lifecycle rules, component-export rules, accessibility lint rules, and strict type narrowing without unsafe type suppressions.

## 3. Accessibility & UI quality gate (when UI is touched)

- Use native interactive elements (buttons for actions, links for navigation, native inputs and labels); never mimic controls with clickable generic elements.
- Provide visible labels on form controls, accessible names on icon-only buttons, and hidden attributes on decorative icons.
- Link validation errors via explicit accessible descriptions and invalid flags; announce async progress/results via polite live status regions and urgent errors via alert regions.
- Ensure modal dialogs and drawers provide an accessible title, initial focus, circular keyboard focus containment, Escape dismissal, a visible close button, background isolation, and trigger focus restoration.
- Verify narrow and wide viewports plus every configured theme mode and localized copy file.

## 4. Verification checklist

1. Format modified files using the repository's configured formatter.
2. Run the repository's configured lint, format-check, unit/integration test, type-check, and build commands via the project's configured runner.
3. When database schemas, migrations, access policies, functions, or seeds changed and local database tooling is configured and running, also run the repository's configured local database reset and lint checks.
