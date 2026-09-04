# CI & quality gates

This repo runs GitHub Actions on pushes and pull requests. This doc maps what runs today and records a **future** guardrail so we do not brick merges if we later make checks required.

## Workflows

| Workflow | Jobs (check name) | Purpose |
| -------- | ----------------- | ------- |
| `pr-description.yml` | `PR Description` | Requires filled PR template (`### TLDR`, `Refs #NNN`, `### How to verify`); skips Dependabot |
| `action-pins.yml` | `Action pins` | SHA-pin gate: every `uses:` in workflow YAML must be a 40-character commit. Runs on `pull_request_target` so the checker comes from `main`, not the PR. Local: `ruby .github/scripts/check-action-pins.rb` |
| `lint.yml` | `Lint & Format` | ESLint + Prettier (`format:check`) + `architecture-guard --ci` |
| `test.yml` | `Unit Tests` | Jest (`npm test -- --ci`) |
| `quality-gates.yml` | `TypeScript`, `expo-doctor`, `expo install --check` | Typecheck + lockfile `expo-doctor` + `expo install --check` (see [Two clocks](#two-clocks--pr-ci-vs-scheduled-expo-health)) |
| `preview-build.yml` | Android EAS preview APK | Optional label `preview-build` — binary only (no OTA); **PR comment only** (debug). Does not move Project 4 or start QA |
| `qa-handoff.yml` | Post-merge QA handoff | On merge of Needs-QA PRs: issue comment + assign `@Roslin22` + best-effort Project 4 → `In QA` ([guides/qa-process.md](guides/qa-process.md)) |
| `nightly-preview.yml` | Nightly Android APK | 23:17 PT APK + 09:07 PT Slack (09:00–16:00 PT); `workflow_dispatch`; install comments on recent handoffs |
| `eas-build.yml` | Tag → version sync | Production release path on `v*` tags |

Local mirrors (run before claiming PR-ready):

```bash
npm run format:check
npm run lint
npm run architecture-guard
npm run typecheck
npm test -- --ci
ruby .github/scripts/check-action-pins.rb
```

### ESLint layer boundaries (#366)

`eslint.config.js` fails lint when UI layers (`src/app/**`, `src/components/**`, `src/routes/**`, `src/hooks/**`) call bare `fetch(` / `globalThis.fetch` / `window.fetch`, call `getDatabase()` / `executeSql`, or import the DB singleton — and when **any** app file imports `@react-navigation/*` (use `expo-router` / `expo-router/drawer` only). Raw SQL string literals are not regex-banned (English UI copy false positives); misuse is caught via `getDatabase` / `executeSql` / DB-singleton import bans. Intentional violation fixtures under `src/app/__fixtures__/eslint-layer-boundaries/` are ignored by `npm run lint` and asserted by `scripts/eslint-layer-boundaries.test.cjs` (part of `npm test`).

### Architecture guard (#367)

`npm run architecture-guard` (`scripts/architecture-guard.mjs --ci`) scans `src/app` and `src/components` and **fails** on bare `fetch(`, `getDatabase(`, or `executeSql` — part of the `Lint & Format` job. Unit coverage: `scripts/architecture-guard.test.cjs`. The Cursor/Claude agent hook (`.cursor/hooks/architecture-guard.mjs` → same script without `--ci`) stays **warn-only** so Write/StrReplace are never denied; policy is documented in the script header. String SQL without those calls is not regex-scanned here (English UI copy false positives); ESLint UI bans (#366) cover broader layer rules.

CI Node is **`.nvmrc` (`24.14.0`)**, the engines floor. `package.json` `engines.node` stays `>= 24.14.0` for local installs. Do not use `node-version: 24` (latest 24.x).

After dependency / Dependabot work (and before claiming PR-ready), also:

```bash
npm ci
npm run doctor
npx expo install --check
```

`npm run doctor` is the **lockfile** `expo-doctor` CLI (`1.20.4` today) — never `npx expo-doctor@latest` on a feature PR. If `--check` (or doctor) reports SDK patch drift **on a feature ticket**, do **not** land `expo install --fix` there: wait for / land the Expo compatibility sync PR ([#422](https://github.com/eten-tech-foundation/fluent-mobile/issues/422)), then rebase. Until that job exists, `expo install --fix` still belongs on a **dedicated** deps ticket, not the feature branch. First-clone copy lives in the [README](../README.md) (Step 6). See [`.cursor/rules/commands.mdc`](../.cursor/rules/commands.mdc).

## Two clocks — PR CI vs scheduled Expo health

```text
PR CI  = deterministic snapshot of *this commit*
         (npm ci, pinned Node, lockfile expo-doctor, lint/typecheck/test)
Weekday / scheduled Expo CI = allowed to look at the outside world (#422)
```

| Check | PR CI | Notes |
| ----- | ----- | ----- |
| `npm ci` | Required (team policy) | Lockfile-frozen |
| Node | `.nvmrc` | Not floating `24` |
| `npm run doctor` | Runs on every PR (Quality Gates `expo-doctor`) | Pinned CLI. Latest doctor / RN Directory belongs on the scheduled job (#422), not `@latest` here |
| `expo install --check` | **Keep required** | Still an **external** Expo matrix. Red overnight without a code change means wait for [#422](https://github.com/eten-tech-foundation/fluent-mobile/issues/422), then rebase — do not fix deps on the feature ticket |
| Dependabot vs Expo `--fix` | Dependabot for non-Expo JS | Ownership split: [#424](https://github.com/eten-tech-foundation/fluent-mobile/issues/424). Merge queue: [#423](https://github.com/eten-tech-foundation/fluent-mobile/issues/423) |
| SDK / RN line bump | Human ticket | Never the weekday bot |

## What is required today

### Branch protection snapshot (live settings)

**Snapshot date:** 2026-08-25 · **Source:** `gh api repos/eten-tech-foundation/fluent-mobile/branches/main/protection` and ruleset `main-protection` (id `20519483`).

| Layer | Setting | Value |
| ----- | ------- | ----- |
| **Required status checks** (legacy branch protection) | Contexts | **`PR Description`** (`strict: true` — branch must be up to date). **`Action pins` is added as required after the workflow exists on `main`** (#405) — do not require it before that check can report |
| **Ruleset `main-protection`** (default branch) | PR reviews | ≥1 approval; **code owner review required**; extra approval for unattributed changes |
| | History | Linear history required; force-push and branch deletion blocked |
| **Not required in GitHub** (run locally / team policy) | Status checks | `Lint & Format`, `Unit Tests`, `TypeScript`, `expo-doctor`, `expo install --check` |

**Discrepancy:** Workflows in the table above still run on every PR, and local gates expect lint/test/typecheck/Expo health to be green before merge — but only **`PR Description`** is a *required* status check in GitHub branch protection today. **`Action pins` becomes required after that workflow is on `main`** (#405). Adding lint/test/typecheck as required checks is a separate maintainer follow-up (see guardrail below).

**PR review policy:** `.github/CODEOWNERS` — `@mattrace-gloo`, `@B3RN153`, `@JonathanSeehagen`.

Before marking a PR ready, still run the full local gate order and confirm all workflow jobs are green — do not rely on GitHub merge button alone while only `PR Description` is required.

### Branch protection (maintainers — aspirational)

When updating GitHub settings, target these **required status checks** in addition to `PR Description`:

1. **Require a pull request before merging**
2. **Require approvals** (at least 1)
3. **Require review from Code Owners** (uses [`.github/CODEOWNERS`](../.github/CODEOWNERS))
4. **Require status checks to pass** — include at least:
   - `PR Description`
   - `Action pins`
   - `Lint & Format`
   - `Unit Tests`
   - `TypeScript` (and Expo health jobs when treated as required)

The `PR Description` check must post on every PR (no workflow-level `paths:` filter) so required-check waiting never deadlocks — see guardrail below.

PR template for the GitHub UI: [`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md) (keep in sync with [`.cursor/templates/pr-template.md`](../.cursor/templates/pr-template.md)).

## Preview / nightly / QA handoff

- Optional PR APKs: `preview-build.yml` + [`.github/scripts/eas-resolve-android-build.sh`](../.github/scripts/eas-resolve-android-build.sh) with `FORCE_NEW_BUILD=true` (no fingerprint reuse; no OTA) — **PR comment only**
- Post-merge QA: [`.github/workflows/qa-handoff.yml`](../.github/workflows/qa-handoff.yml) + [`.github/scripts/qa-handoff-on-merge.cjs`](../.github/scripts/qa-handoff-on-merge.cjs) — Needs QA? Yes → comment / assign / `In QA` for `Refs #NNN`
- Nightly: `nightly-preview.yml` + [`.github/scripts/nightly-notify-qa-issues.cjs`](../.github/scripts/nightly-notify-qa-issues.cjs) posts install URL on recent handoff issues
- **Process:** [guides/qa-process.md](guides/qa-process.md) (Needs QA?, post-merge nightly QA)
- Human install steps: [guides/qa-preview-testing.md](guides/qa-preview-testing.md)
- **Merge rule:** engineer approval + required CI — QA does **not** block merge
- Production: tag `v*` → `eas-build.yml` + [`.eas/README.md`](../.eas/README.md)

## Future guardrail — do not brick required checks

If we later mark lint/test/typecheck as **required** status checks **and** want docs-only PRs to skip heavy jobs:

1. Keep `on: pull_request` **without** a workflow-level `paths:` filter on those workflows.
2. Put path scoping in a `changes` job (`dorny/paths-filter`) and skip leaf jobs with `if:` so they still **post** a `skipped` check (treated as passing).
3. **Never** add a workflow-level `paths:` filter alone on a required check — the check never posts → PRs sit on “Expected — Waiting for status” forever.

Do **not** implement that skip pattern until the team explicitly wants required checks + docs-only fast path. Until then, full CI on every PR is fine and safer.

## Related

- [guides/qa-process.md](guides/qa-process.md)
- [issue-tracking.md](issue-tracking.md)
- [AGENT_ONBOARDING.md](AGENT_ONBOARDING.md)
- [guides/dependabot-process.md](guides/dependabot-process.md)
