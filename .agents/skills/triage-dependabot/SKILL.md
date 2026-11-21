---
name: triage-dependabot
description: >-
  Investigate, triage, and safely remediate GitHub Dependabot alerts and npm
  advisories in Node.js repositories without blind breaking upgrades. Use when
  fixing Dependabot alerts, resolving npm audit findings, managing
  package-lock.json overrides, or auditing vulnerable transitive dependencies.
---

# Dependabot Security Triage and Remediation

Systematically inspect, classify, and resolve GitHub Dependabot alerts and npm security advisories while preserving build, lockfile, and toolchain stability.

## Non-Negotiable Guardrails

- **Never run `npm audit fix --force` blindly:** `npm audit` frequently suggests SemVer-major downgrades (such as downgrading `vite`, `vitest`, or Storybook) when an advisory affects a transitive dependency. Inspect the dependency graph first.
- **Require online advisory checks:** Always pass `--offline=false` when running `npm audit --json --offline=false`. Never treat an offline failure or empty cached output as a clean audit.
- **Never auto-dismiss security alerts silently:** When an advisory has no upstream patch or appears unreachable, present the factual reachability findings to the user and obtain explicit confirmation before dismissing an alert via `gh api`.
- **Preserve lockfile hygiene:** Keep a single root `package-lock.json`. Keep `overrides` tightly scoped in root `package.json` with a clear removal condition.
- **Account for Windows & sandbox restrictions:** Use `npm.cmd` / `npx.cmd` on Windows hosts that block `.ps1` wrappers, and run `gh` / `npm audit --offline=false` / `npm view` outside restricted sandboxes if DNS/network access is blocked.

## Workflow

1. **Collect Ground Truth**
   - List open GitHub Dependabot alerts:
     `gh api repos/{owner}/{repo}/dependabot/alerts?state=open`
   - Run an online npm audit from the repository root:
     `npm audit --json --offline=false`

2. **Trace & Classify Each Alert**
   - Inspect where the vulnerable package is pulled in:
     `npm ls <pkg> --all`
   - Check published versions on the npm registry:
     `npm view <pkg> dist-tags versions --json`
   - Classify each alert into one of four cases (detailed in [npm-playbook.md](./references/npm-playbook.md)):
     - **Case A — Direct SemVer-safe upgrade available:** Bump the direct dependency and refresh `package-lock.json`.
     - **Case B — Patched transitive version exists, parent range blocks it:** Add a scoped root `overrides` entry (or remove an obsolete override once parent packages support the patched version natively).
     - **Case C — Audit suggests SemVer-major breaking upgrade or downgrade:** Reject `--force`; evaluate intentional parent upgrade vs. scoped override.
     - **Case D — No upstream patch exists (`first_patched_version` is `null`, or `latest` is vulnerable):** Assess runtime reachability and untrusted input exposure, then ask the user whether to track open or dismiss with documented evidence.

3. **Apply Minimal Fix or Document Exception**
   - Make only the minimal `package.json` / `package-lock.json` changes needed for Cases A–C.
   - Re-check existing `overrides` in root `package.json` for obsolete or overly broad pins.
   - For Case D, leave manifests untouched unless a safe structural workaround exists.

4. **Verify End-to-End**
   - Re-run `npm audit --json --offline=false` to confirm targeted advisories are resolved.
   - When manifests or `package-lock.json` changed, verify `npm ci` compatibility and run `lint`, `format:check`, `typecheck`, `test`, and `build` scripts.
   - Report exact commands run, resolved vs. remaining alerts, and any unpatched upstream blockers honestly.

## Reference Playbook

Read [npm-playbook.md](./references/npm-playbook.md) for `gh api` query/dismissal payloads, `overrides` scoping examples, Case A–D recipes, and reachability checklists.

## Skill boundaries

- Use **this skill** (`triage-dependabot`) for GitHub Dependabot alerts, `npm audit` findings, transitive dependency overrides, and lockfile remediation.
- Use `audit-security` for application trust boundaries, auth/session checks, XSS/URL/file validation, storage/redaction hygiene, response headers, and CI workflow hardening.
