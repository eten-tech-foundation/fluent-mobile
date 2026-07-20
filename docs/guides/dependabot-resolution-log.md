# Dependabot resolution log

Records how open Dependabot PRs were resolved in a given branch so the team can close or merge PRs consistently.

## Batch: `main` (2026-07-20)

Resolved: 2026-07-20

| PR | Title / scope | Change applied |
|----|---------------|----------------|
| #194 | actions/setup-node 4 → 7 | **Merged** — safe GitHub Actions only; CI green |
| #195 | react group (`react` / `react-test-renderer` 19.2.3 → 19.2.7) | **Deferred** — risky; CI red; needs Android smoke |
| #196 | navigation group (`@react-navigation/*`) | **Deferred** — risky; CI green but Android smoke required |
| #197 | testing group (Jest 29→30, RTL 13→14, `@types/jest` 29→30) | **Deferred** — major tooling; CI red |
| #198 | dev-tools group (Babel 8, ESLint 10, Prettier 3, TS 7) | **Deferred** — stacked majors; CI red |
| #199 | expo group (`expo` ~56 → ~57) | **Closed** — SDK upgrade; use dedicated SDK 57 ticket |

**Action:** Merged #194 squash. Closed #199. Deferred #195–#198 with comments. `@dependabot rebase` on remaining open bots after #194.

**Verification run:** GitHub CI on #194 (Lint, Test, Quality Gates) green before merge. `main` CI for #194 merge watched after squash.

---

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

## Batch: `main` (2026-06-30)

Resolved: 2026-06-30

| PR | Title / scope | Change applied |
|----|---------------|----------------|
| #72 | react group | **Closed** — pinned React/RN; dedicated ticket required |
| #73 | navigation group | **Closed** — risky; needs Android smoke test |
| #74 | testing group | **Closed** — failed CI |
| #130 | dev-tools group (9 updates) | **Closed** — failed CI |

**Left open:** #129 (@babel/core, merge candidate), #81/#127/#128 (GitHub Actions — separate review).

**Verification run:** N/A (closed without merge)

---

## Template (copy for each batch)

### Branch: `<branch-name>` (date)

Resolved: YYYY-MM-DD

| PR | Title / scope | Change applied |
|----|---------------|----------------|
| #___ | | |

**Action:** <!-- closed with comment / merged / deferred to ticket ___ -->

**Verification run:**

- [ ] `npm run doctor`
- [ ] `npm run format:check`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test -- --ci`
- [ ] Android `assembleDebug` (CI or local)
- [ ] Android smoke test (if risky)

### Reference

- Process: [dependabot-process.md](./dependabot-process.md)
- Config: `.github/dependabot.yml`
