---
name: audit-accessibility
description: >-
  Audit and remediate accessibility (WCAG 2.2), semantic HTML, keyboard
  navigation, focus management, ARIA attributes, live announcements, theme
  contrast, reduced-motion, and localized accessible labels against repository
  component and testing guides. Use when reviewing or fixing a11y gaps; not for
  general feature polish without an accessibility focus (use enhance-feature),
  or security audits (use audit-security).
---

# Audit Accessibility

Systematically audit or remediate accessibility contracts against WCAG 2.2 and repository engineering guides. Inspect the repository's configured linter rules and test setup first—static analysis typically catches only a small subset of accessibility defects, so verify semantics, keyboard behavior, focus management, live regions, contrast/theme parity, and reduced motion directly in source and tests while separating automated DOM checks from manual assistive-technology verification.

## 1. Establish mode and scope

1. Read `AGENTS.md` (when present) and inspect project manifests, linter configs, styling/theme configs, localization configs (if any), test runner configs, and relevant guides under `docs/` when present.
2. Discover frontend source directories, layout shells, interactive components, and colocated test patterns from actual repository files.
3. Determine the execution mode:
   - **Mode A — Accessibility Audit (read-only default):** Inspect source, styles, and tests without editing files and deliver prioritized, file-backed findings.
   - **Mode B — Targeted Remediation:** Scope the exact files, markup/ARIA/focus changes, synchronized locale updates (if localized), and colocated regression tests before editing.
4. Preserve visual design intent, public component contracts, routes, deployment base paths, and unrelated behavior unless an accessibility fix explicitly requires updating a public interface.

## 2. Load the accessibility checklist

Load [Accessibility audit checklist](./references/accessibility-audit-checklist.md) for severity tiers, domain-by-domain checks, read-only audit searches, and verification steps.

## 3. Audit by accessibility domain

Inspect only the surfaces relevant to the target scope using [Accessibility audit checklist](./references/accessibility-audit-checklist.md):

1. **Landmarks, headings, and native semantics:** Single main landmark per view, distinct navigation landmark names, logical heading hierarchy, native interactive elements over clickable generic tags, and meaningful image descriptions.
2. **Labels, forms, and error/status announcements:** Visible labels, named icon-only controls, hidden decorative icons, explicit error association, pending-action busy state, and polite vs. urgent live regions.
3. **Keyboard navigation, focus visibility, and modal/widget patterns:** Logical tab order, visible keyboard focus indicators, dialog focus entry and containment, Escape dismissal, trigger focus restoration, background isolation while modals are open, and accessible focus handling in virtualized or composite widgets.
4. **Themes, contrast, narrow viewports, motion, and localization (when configured):** Non-color state indicators, contrast across every configured theme mode, narrow-viewport wrapping without clipping, reduced-motion support, and synchronized translations across configured locales (or preserving single-language copy).

## 4. Remediate safely (Mode B only)

1. Prefer native HTML semantics before layering custom ARIA attributes.
2. Update all configured locale resources together when adding or changing accessible names or announcements in localized apps.
3. Add or strengthen colocated component tests querying by semantic role, accessible name, and label—covering keyboard interaction, Escape/Tab containment, focus restoration, error association, pending states, and live announcements.

## 5. Validate within repository guardrails

1. For **Mode B**, inspect the diff to confirm only intended files changed and format changed files with the repository's configured formatter.
2. Run the repository's configured static analysis, formatting, test, type-check, and build verification commands.
3. **Approval gates:** Do not install new accessibility packages, modify CI workflows, or commit/push without explicit user approval.
4. Clearly separate **automated DOM/unit-test-verified contracts** from **unverified real-browser focus visuals, computed color contrast, and screen-reader checks**.

## 6. Deliver findings and handoff

Report concisely in this order:

1. Scope audited/remediated and execution mode (Audit vs. Remediation).
2. Findings ranked by severity (`Critical`, `High`, `Medium`, `Low`) with exact file/line references, WCAG/user impact, and concrete fix (or applied status in Mode B).
3. Files modified, locale updates, and regression tests added (Mode B).
4. Exact commands executed and observed results.
5. Unverified manual checks (real-browser focus rings/scroll, computed contrast across themes, and assistive-technology announcements) and recommended follow-up.

## Skill boundaries

- Use **this skill** (`audit-accessibility`) to audit or remediate WCAG 2.2 compliance, semantic markup, keyboard/focus management, ARIA contracts, live regions, theme contrast parity, reduced motion, and accessible labels.
- Use `enhance-feature` for general feature or component UX, state, or error polish without a dedicated accessibility audit.
- Use `audit-performance` for evidence-based rendering, virtualization, or bundle optimization.
- Use `audit-security` for trust boundaries, XSS/URL safety, auth/session enforcement, and CI/header security.
- Use `verify-release` for end-to-end built-app release verification across deployments.
- Use `sync-docs` when documentation needs synchronization after verified changes.
