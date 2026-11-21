# Release Verification Checklist & Commands

Use this reference alongside `docs/testing-strategy.md` and `docs/architecture.md` when validating a release candidate or deployment.

## 1. Full CI parity check

Run from the repository root (use `npm.cmd` and `npx.cmd` on Windows PowerShell if `.ps1` launchers are blocked):

```sh
npm run lint
npm run format:check
npm run test
npm run typecheck
npm run build
```

Verify that all five checks pass without live cloud credentials or private `.env.local` secrets, and confirm no unintended local `.env.local` public UI flags alter the production bundle being verified.

## Built-app verification checklist (browser / live host)

Execute against built production servers (`npm run preview`) or the deployed URL:

- [ ] **Base path & reload:** Open the public base URL and deep/secondary routes directly, then hard-reload. Confirm zero console errors, zero 404/base-path asset failures, zero unused `<link rel="preload">` warnings on secondary routes, clean lazy-chunk loading, and working unknown-route fallback.
- [ ] **Themes & responsiveness:** Check narrow and wide viewports; toggle light/dark themes where supported and confirm persistence across reload.
- [ ] **Localization:** In localized apps, switch across every configured locale and check visible copy, labels, errors, and document/nav text.
- [ ] **Interactive & keyboard smoke checks:** Test primary forms/actions, validation/error states, and keyboard/focus behavior.

## Honest verification status table

Always classify each item in the final release report:

| Status     | Meaning                                                                                |
| ---------- | -------------------------------------------------------------------------------------- |
| Verified   | Command, config check, or browser/live check was executed and directly observed.       |
| Failed     | Executed and observed a failure (include exact error/path and whether pre-existing).   |
| Unverified | Could not run in this environment (e.g., no live host, browser, or cloud credentials). |
