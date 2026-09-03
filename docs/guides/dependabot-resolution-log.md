# Dependabot resolution log

Records how open Dependabot PRs were resolved in a given branch so the team can close or merge PRs consistently.

**Two clocks:** PR CI is a frozen snapshot; Expo SDK patch drift is recovered by the weekday compatibility job ([#422](https://github.com/eten-tech-foundation/fluent-mobile/issues/422)), not by `--fix` on every feature/Dependabot branch. Parent tracker: [#420](https://github.com/eten-tech-foundation/fluent-mobile/issues/420). Process: [dependabot-process.md](./dependabot-process.md).

## Batch: `main` (2026-08-11)

Resolved: 2026-08-11 (triage + close pass; SDK alignment via #314)

| PR | Title / scope | Change applied |
|----|---------------|----------------|
| #308 | react group (`react` / `react-test-renderer` 19.2.3 → 19.2.8) | **Closed** — Expo SDK 57 / RN 0.86 React pin; doctor/install-check red; needs dedicated ticket + Android smoke |
| #309 | navigation group (`@react-navigation/native` / `stack` patches) | **Closed** — risky navigation; Android smoke required; dedicated ticket |
| #310 | testing group (Jest 29→30, RTL 13→14) | **Closed** — major tooling; CI red; needs migration ticket |
| #311 | dev-tools group (Babel 8, ESLint 10, Prettier 3, TS 7) | **Closed** — stacked majors; CI red; dedicated tooling ticket |
| #312 | `babel-preset-expo` 57.0.5 → 57.0.6 | **Deferred / left open** — safe Expo patch, blocked by SDK patch drift on `main` until #314 lands |

**Action:** Closed #308–#311 with technical comments. Left #312 open with deferral comment. Opened #314 + PR to run `npx expo install --fix` (Expo SDK 57 patch alignment) so Quality Gates can go green; after merge, rebase #312 then squash-merge.

**Left open (Dependabot):** #312 (blocked on #314).

**Verification run:** Rebased all open bots; required checks failed expo-doctor / expo install --check with patch mismatches (`expo`, `expo-asset`, `expo-build-properties`, `expo-constants`, `expo-dev-client`, `expo-updates`, `jest-expo`). No Dependabot merges this pass. No Android smoke (N/A for closes).

---

## Batch: `main` (2026-07-20)

Resolved: 2026-07-20 (finish pass + close pass same day)

| PR | Title / scope | Change applied |
|----|---------------|----------------|
| #194 | actions/setup-node 4 → 7 | **Merged** — safe GitHub Actions only; CI green; `main` Lint/Test/Quality Gates green after squash |
| #195 | react group (`react` / `react-test-renderer` 19.2.3 → 19.2.7) | **Closed** — Expo SDK 56 / RN 0.85 React pin; CI red (tests/doctor/install-check); needs dedicated ticket + Android smoke |
| #196 | navigation group (`@react-navigation/native` 7.3.8→7.3.12 / `stack` 7.10.11→7.10.15) | **Closed** — risky navigation; CI green but Android smoke required; dedicated ticket |
| #197 | testing group (Jest 29→30, RTL 13→14, `@types/jest` 29→30) | **Closed** — major tooling; CI red; needs migration ticket |
| #198 | dev-tools group (Babel 8, ESLint 10, Prettier 3, TS 7) | **Closed by Dependabot** — superseded after rebase; see #216 |
| #199 | expo group (`expo` ~56 → ~57) | **Closed** — SDK upgrade; use dedicated SDK 57 ticket |
| #216 | dev-tools group (Babel 8, ESLint 10, Prettier 3, TS 7 + related) | **Closed** — stacked majors (replacement for #198); CI red; dedicated tooling ticket |

**Action:** Merged #194 squash. Closed #199 (Expo). #198 superseded/closed by Dependabot. Close pass: closed #195, #196, #197, #216 with technical comments (unsafe / majors / smoke required per dependabot-workflow). No remaining open Dependabot bots from this batch.

**Left open (Dependabot):** none from this batch.

**Verification run:** GitHub CI on #194 green before merge. `main` CI (Lint Check, Test Check, Quality Gates) success for #194 squash. Close pass: verified PRs still open, then `gh pr close` with rationale comments; no merges; no Android smoke (N/A for closes).

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
