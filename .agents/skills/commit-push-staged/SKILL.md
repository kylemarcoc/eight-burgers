---
name: commit-push-staged
description: >-
  Commit and push only the currently staged Git changes without staging
  unstaged or untracked files. Use when the user asks to commit and push only
  staged changes, or explicitly wants to commit only what is already in the index.
---

# Commit and Push Staged Changes Only

Commit strictly what is already staged in the Git index and push it to the remote repository, leaving all unstaged modifications and untracked files untouched in the working tree.

## Rules

- **Never** run `git add`, `git commit -a`, or `git commit --all`.
- **Never** use `--no-verify` to skip Git hooks unless the user explicitly asks for it.
- **Never** force-push (`--force` / `--force-with-lease`) unless explicitly requested.

## Steps

1. **Verify Staged Changes Exist**:
   - Run `git status --short` and `git diff --cached --stat`.
   - Confirm whether anything is staged (`git diff --cached --quiet` returns exit code `1` when staged changes exist).
   - If nothing is staged, **stop immediately** and tell the user no staged changes are present—do not stage files on their behalf or create an empty commit.

2. **Inspect Staged Content & Commit Style**:
   - Review `git diff --cached` to understand only the staged changes and verify no credentials, secrets, or unintended artifacts are staged.
   - Check `git log -n 5 --oneline` (and any repository commit guidelines) so the commit message matches local conventions and describes **only** the staged diff.

3. **Commit Only the Index**:
   - Run `git commit -m "<message>"` without `-a` or file arguments.
   - If a hook fails or rejects the commit, stop and report the error rather than bypassing hooks or auto-staging unstaged files.

4. **Push to Remote**:
   - Check if the branch tracks an upstream (`git rev-parse --abbrev-ref --symbolic-full-name @{u}`).
   - Push with `git push` (or `git push -u origin HEAD` if no upstream is configured yet).

5. **Verify & Report**:
   - Run `git log -n 1 --oneline` and `git status --short`.
   - Report the commit hash, branch/remote pushed, and confirm any remaining unstaged or untracked files were left untouched.
