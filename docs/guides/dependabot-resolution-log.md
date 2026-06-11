# Dependabot resolution log

Records how open Dependabot PRs were resolved in a given branch so the team can close or merge PRs consistently.

## Batch: `main` (2026-06-10)

Resolved: 2026-06-10

| PR | Title / scope | Change applied |
|----|---------------|----------------|
| #59 | shell-quote 1.8.3 → 1.8.4 | Merged — lockfile-only transitive |
| #42 | qs 6.15.1 → 6.15.2 | Merged — lockfile-only transitive |
| #35 | @babel/plugin-transform-modules-systemjs 7.29.0 → 7.29.7 | Merged — dev transitive (rebased) |
| #34 | fast-xml-builder 1.1.4 → 1.2.0 | Merged — lockfile-only (rebased; conflicts resolved) |
| #37 | brace-expansion 5.0.5 → 5.0.6 | Merged — `package.json` override patch (rebased; CI green after stale failure) |

**Action:** All merged via squash. Parallel `@dependabot rebase` after each merge. PR #60 (workflow config) left for separate review.

**Verification run:** GitHub CI (Lint Check, Test Check, Build Check) green on each PR before merge. Final `main` Build Check for #37 in progress at log time.

---

## Template (copy for each batch)

### Branch: `<branch-name>` (date)

Resolved: YYYY-MM-DD

| PR | Title / scope | Change applied |
|----|---------------|----------------|
| #___ | | |

**Action:** <!-- closed with comment / merged / deferred to ticket ___ -->

**Verification run:**

- [ ] `npm run format:check`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test -- --ci`
- [ ] Android `assembleDebug` (CI or local)
- [ ] Android smoke test (if risky)

### Reference

- Process: [dependabot-process.md](./dependabot-process.md)
- Config: `.github/dependabot.yml`
