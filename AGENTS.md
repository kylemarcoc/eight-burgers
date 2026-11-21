# Repository Agent Instructions

## Project Context

This is a standalone Vite + React + TypeScript application under `src/`, validated with Vitest, React Testing Library, Oxlint, and Prettier.

## Development Principles

- Inspect the working tree, `package.json`, framework configuration, and relevant source and tests before editing. Preserve unrelated edits, working behavior, and public APIs unless the task calls for a change.
- Keep feature logic, tests, and public APIs inside `src/features/<feature>/` (`index.ts`). Keep `src/shared/` independent of `app/`, `routes/`, and `features/`.
- Make incremental changes. Follow nearby patterns, reuse existing utilities, and justify any new dependency or abstraction before adding it to `package.json`. Upgrade React only when requested.
- Preserve deployment base paths, accessibility, responsive behavior, theme parity, and loading, empty, and error states. Keep English-only apps English-only, or update every configured locale resource together when localized.
- Colocate tests with the modules they exercise and verify documentation against actual source and configuration.

## Documentation

Read only the guides relevant to the task and the checks it needs. The guides describe project-wide conventions and identify which rules tooling enforces.

- [Architecture](docs/architecture.md) — Layering, dependency boundaries, routing, and deployment
- [Coding standards](docs/coding-standards.md) — TypeScript, naming, imports, and code quality
- [Feature structure](docs/feature-structure.md) — Feature layout, module ownership, and translations
- [State management](docs/state-management.md) — Local, client, server, form, and URL state defaults
- [API design](docs/api-design.md) — API clients, queries, mutations, errors, and server operations
- [Component guidelines](docs/component-guidelines.md) — Components, hooks, styling, and accessibility
- [Performance](docs/performance.md) — Profiling, complexity, rendering, and bundle costs
- [Testing strategy](docs/testing-strategy.md) — Test design, validation matrix, and release checks
- [Security](docs/security.md) — Authentication, credentials, private data, and trust boundaries

## Skills

Project skills live under `.agents/skills/`. Use an available skill when its workflow fits the task.

## Validation

Run authorized checks from the repository root. Use `npm ci` for locked installs once `package-lock.json` is committed.

- Root scripts in [package.json](package.json) include `npm run lint`, `npm run format:check`, `npm run test`, `npm run typecheck`, and `npm run build`.
- For documentation-only edits, check changed files with `npx --no-install prettier --check <changed-files>` and verify relative links and heading fragments. Use `npm.cmd` and `npx.cmd` if PowerShell blocks `.ps1` launchers.
- Summarize the changes and report checks actually run, failures, skipped checks, unverified assumptions, and any remaining issues.

## Commits and Pull Requests

Use short lowercase commit subjects and add a scope when helpful. Pull requests should explain the change and user impact, record validation results, link the relevant issue, and include screenshots for visible UI changes.
