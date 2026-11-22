---
name: sync-docs
description: >-
  Audit and update repository architecture guides, AGENTS.md, and READMEs to
  reflect verified repository changes, resolve documentation drift, and maintain
  consistency across engineering standards. Use when documentation needs
  synchronization after refactoring, dependency changes, configuration changes,
  or an architecture audit; not for source-code refactors (use
  refactor-architecture), feature coding (use create-feature / enhance-feature),
  or bug fixes (use fix-bugs).
---

# Sync Docs

Maintain accurate, consistent, and cleanly layered repository documentation grounded strictly in verified configuration and implementation. Keep this skill **documentation-only** without modifying source code, build configs, CI workflows, or installed dependencies.

## 1. Establish scope and inspect repository

1. Read `AGENTS.md` (when present), `README.md`, and discover existing engineering guides under `docs/` (and subproject READMEs if configured).
2. Inspect project manifests, framework/build configs, type-check configs, linter boundary configs, and database configs when present alongside the relevant source files.
3. Review recent git changes or audit findings when available to isolate which documents are affected.

## 2. Identify documentation drift and layer leaks

1. Detect outdated architectural guidance, contradictory rules, or cross-document duplication across `AGENTS.md`, `README.md`, and `docs/`.
2. Find broken relative links or Markdown heading fragments across documentation files.
3. Verify documented conventions, dependencies, and CLI commands match actual project manifests and scripts.
4. Check clean layer separation: keep repo-specific paths, package/workspace names, tokens, and documented exceptions in `AGENTS.md` / `README.md`; keep `docs/*.md` domain-agnostic for the repository's stack; and clearly separate verified implemented behavior from target engineering standards.

## 3. Select affected documents

1. Update only documents that are out of sync or structurally affected.
2. Follow established document naming conventions (typically kebab-case Markdown filenames) and keep responsibilities distinct:
   - High-level architecture and dependency rules in the architecture guide.
   - Detailed standards in their owning guides, cross-linking instead of duplicating rules.
   - Setup, environment variables, commands, and product/app capabilities in `README.md`.
   - Repository rules, structural exceptions, and target-vs-current disclaimers in `AGENTS.md`.
3. Never create duplicate documentation files or rename existing files without explicit user approval.

## 4. Update documentation accurately

1. Preserve accurate existing content and keep terminology consistent with installed dependencies and actual repository files.
2. Replace outdated examples, broken anchors, or stale commands only with directly verified details—never invent implementation behavior or document proposed changes as implemented.
3. Document justified architectural exceptions explicitly alongside their rationale or scope.

## 5. Validate within repository guardrails

1. Verify all relative Markdown file links and heading anchors across modified documentation.
2. Run a **read-only formatting check** using the repository's configured formatter on changed documentation files when available, plus consistency review against `AGENTS.md`.
3. **Approval gates & constraints:** Do **not** modify application source code, database files, dependencies, or CI/build configs; do **not** run builds, test suites, installs, or mutating commands; do **not** claim runtime validation was performed; and do **not** commit or push without explicit approval.
4. Report any checks or verification steps that could not be executed honestly.

## 6. Deliver concise report

Report in this order:

1. Documents reviewed.
2. Documentation files modified.
3. Documentation drift, broken links, or layer leaks resolved.
4. Remaining inconsistencies between documentation and live code/config.
5. Unverified assumptions or checks not run.
6. Recommended follow-up actions.

## Skill boundaries

- Use **this skill** (`sync-docs`) to audit and update `AGENTS.md`, `docs/*.md`, and `README.md` so documentation reflects verified repository behavior and tooling.
- Use `refactor-architecture` to modify application source code to match documented architectural boundaries.
- Use `create-feature`, `enhance-feature`, `fix-bugs`, or `manage-database` for source-code or database schema changes.
- Use `verify-release`, `audit-security`, `audit-performance`, or `audit-accessibility` for technical validation and audits.
