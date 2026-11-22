# npm & Dependabot Remediation Playbook

Detailed commands, decision recipes, and verification checklists for the `triage-dependabot` skill.

## 1. Inspection Commands

### GitHub Dependabot Alerts (`gh` CLI)

```sh
# List open alerts (inspect number, package, scope, vulnerable_version_range, first_patched_version)
gh api repos/{owner}/{repo}/dependabot/alerts?state=open

# Inspect one specific alert in detail
gh api repos/{owner}/{repo}/dependabot/alerts/{alert_number}
```

Key fields to inspect in each alert:

- `dependency.scope`: `"runtime"` vs `"development"`
- `dependency.relationship`: `"direct"` vs `"transitive"`
- `security_vulnerability.vulnerable_version_range`
- `security_vulnerability.first_patched_version`: `null` means **no patched release exists upstream yet**
- `security_advisory.identifiers`: CVE and GHSA IDs
- `security_advisory.cwes`: e.g. `CWE-1333` (ReDoS), prototype pollution, path traversal, etc.

### Online npm Audit & Registry Checks

```sh
# Online audit (Windows PowerShell blocking .ps1 -> use npm.cmd)
npm audit --json --offline=false

# Trace every parent introducing the package
npm ls <pkg> --all

# Verify whether a patched version is actually published on npm
npm view <pkg> dist-tags versions --json

# Check peer/engine requirements of a proposed patched version
npm view <pkg>@<version> peerDependencies engines --json
```

---

## 2. Classification Matrix (Cases A–D)

### Case A — Direct SemVer-Safe Fix Available

Use when a direct dependency already covers a patched version within its range, or needs a non-breaking minor/patch bump.

1. Update lockfile cleanly or install into the owning package:
   - Lockfile-only compatible bump: `npm update <pkg>`
   - Manifest bump: `npm install <pkg>@^<patched>`
2. Review `git diff package-lock.json` to ensure unrelated packages did not churn unnecessarily.

### Case B — Patched Transitive Version Exists, Parent Blocks It

Use when `<pkg>@<patched>` exists on npm, `first_patched_version` is non-null, and upgrading the direct parent is blocked by peer ranges or unrelated breaking changes.

1. Scope the override as narrowly as possible in root `package.json`:
   ```json
   "overrides": {
     "<direct-parent>": {
       "<vulnerable-pkg>": "^<patched-version>"
     }
   }
   ```
   Use a top-level override (`"<vulnerable-pkg>": "^<patched-version>"`) only when multiple unrelated parents share the same safe patched SemVer line.
2. Refresh `package-lock.json` (`npm install --package-lock-only` or `npm install`), then test that builds/types still compile cleanly with the overridden version.
3. Document **why** the override exists (GHSA/CVE link) and **when to remove it** (which upstream parent release will natively resolve it).

### Case C — `npm audit` Recommends Breaking Major Upgrades or Downgrades

`npm audit --json` frequently marks `fixAvailable` with `isSemVerMajor: true` pointing to **older** major versions of tooling packages just because an older branch did not depend on the transitive package.

1. **Never** run `npm audit fix --force` automatically.
2. Verify whether the suggested version in `fixAvailable` is actually an **upgrade** or a **downgrade** relative to `package.json`.
3. If an intentional **upgrade** of the direct parent resolves the issue cleanly, plan and test it explicitly as a dependency upgrade; if it is a bogus **downgrade**, treat as Case B (if a patched transitive exists) or Case D (if unpatched).

### Case D — Unpatched Upstream (`first_patched_version: null` or `latest` Is Vulnerable)

Use when `npm view <pkg> dist-tags versions --json` shows `latest` itself falls inside `vulnerable_version_range`.

1. **Assess Reachability & Exploitability**:
   - Search source code for direct imports (`git grep "<pkg>" <source-dirs>`, substituting the repository's configured source directories).
   - Confirm whether `scope` is strictly `"development"` (bundlers, test runners, linters) or shipped in `"runtime"` (browser bundle, SSR server, API routes).
   - Check the CWE attack vector (for example, whether untrusted external users can supply inputs directly to the vulnerable API).
2. **Present Options to the User (Do Not Auto-Dismiss)**:
   - **Option 1 — Track & Keep Open:** Leave manifests and toolchain intact until upstream publishes a patched version, then re-triage under Case A/B.
   - **Option 2 — Dismiss with Evidence:** Only after explicit user confirmation, dismiss via `gh api`:

```sh
gh api -X PATCH /repos/{owner}/{repo}/dependabot/alerts/{alert_number} \
  -f state=dismissed \
  -f dismissed_reason=tolerable_risk \
  -f 'dismissed_comment=Transitive devDependency only; not shipped in runtime bundles and no untrusted input reaches the vulnerable code path. No upstream patch published yet.'
```

Valid GitHub `dismissed_reason` values:

- `fix_started`
- `inaccurate`
- `no_bandwidth`
- `not_used`
- `tolerable_risk`

---

## 3. Post-Fix Verification Checklist

- [ ] `npm audit --json --offline=false` confirms zero unexpected new advisories and shows expected status for targeted CVEs.
- [ ] `git status` confirms single root `package-lock.json` consistency and no unintended changes to unrelated packages.
- [ ] Full `lint`, `format:check`, `typecheck`, `test`, and `build` checks succeed after any lockfile or `overrides` edit.
- [ ] Temporary `overrides` record their advisory identifier and removal condition.
