---
name: sync-docs
description: Audit and update repository architecture guides, AGENTS.md, and READMEs to reflect verified repository changes, resolve documentation drift, and maintain consistency across engineering standards. Use when documentation needs synchronization after refactoring, dependency changes, configuration changes, or an architecture audit.
---

# Sync Documentation

## Goal

Maintain accurate, consistent architecture documentation based on the actual repository implementation.

## Workflow

### 1. Inspect

- Read `AGENTS.md`.
- Inspect the relevant existing `docs/` files.
- Inspect affected source code and configurations.
- Review relevant git changes or audit findings when available.
- Determine which documents are actually affected.

### 2. Identify Documentation Drift

- Detect outdated architectural guidance.
- Identify contradictory or duplicated rules.
- Find broken documentation references and heading fragments.
- Compare documented conventions with implementation.
- Distinguish verified behavior from proposed architecture.

### 3. Select Documents

- Update only affected documentation.
- Follow existing kebab-case naming conventions.
- Preserve established document responsibilities:
  - Keep `AGENTS.md` and `docs/*.md` focused on architecture, stack conventions, and engineering standards.
  - Keep user-facing setup, environment configuration, and release notes in `README.md`.
- Keep `docs/architecture.md` focused on high-level decisions.
- Keep implementation details in their owning guides and reference related guides instead of duplicating content.

### 4. Update

- Preserve accurate existing content.
- Correct outdated examples and conventions.
- Reflect verified changes to libraries and tooling.
- Use actual repository paths and configuration.
- Document justified architectural exceptions.
- Do not invent implementation details.

### 5. Validate

- Verify Markdown links and file references.
- Check consistency with `AGENTS.md`.
- Check for contradictory architectural rules.
- Ensure code examples match installed dependencies.
- Confirm documentation matches the actual codebase.
- Report any checks that could not be performed.

## Constraints

- Modify only relevant documentation files.
- Do not modify application source code.
- Do not install or update dependencies.
- Do not change build or CI configurations.
- Do not create duplicate documentation.
- Do not rename files without explicit approval.
- Do not execute shell commands.
- Do not claim runtime validation was performed.
- Do not document proposed behavior as implemented.

## Output

Report:

1. Documents reviewed.
2. Files modified.
3. Documentation drift resolved.
4. Remaining inconsistencies.
5. Unverified assumptions.
6. Recommended follow-up actions.
