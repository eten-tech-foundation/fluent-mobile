# CI & quality gates

This repo runs GitHub Actions on pushes and pull requests. This doc maps what runs today and records a **future** guardrail so we do not brick merges if we later make checks required.

## Workflows

| Workflow | Jobs (check name) | Purpose |
| -------- | ----------------- | ------- |
| `pr-description.yml` | `PR Description` | Requires filled PR template (`### TLDR`, `Refs #NNN`, `### How to verify`); skips Dependabot |
| `lint.yml` | `Lint & Format` | ESLint + Prettier (`format:check`) |
| `test.yml` | `Unit Tests` | Jest (`npm test -- --ci`) |
| `quality-gates.yml` | `TypeScript`, `expo-doctor`, `expo install --check` | Typecheck + Expo SDK / native-module alignment |
| `preview-build.yml` | Android EAS preview APK | Optional label `preview-build` — binary only (no OTA); **PR comment only** (debug). Does not move Project 4 or start QA |
| `qa-handoff.yml` | Post-merge QA handoff | On merge of Needs-QA PRs: issue comment + assign `@Roslin22` + best-effort Project 4 → `In QA` ([guides/qa-process.md](guides/qa-process.md)) |
| `nightly-preview.yml` | Nightly Android APK | Scheduled binary-only internal APK (dev API); also `workflow_dispatch`; comments install URL on recent handoff issues |
| `eas-build.yml` | Tag → version sync | Production release path on `v*` tags |

Local mirrors (run before claiming PR-ready):

```bash
npm run format:check
npm run lint
npm run typecheck
npm test -- --ci
```

### ESLint layer boundaries (#366)

`eslint.config.js` fails lint when UI layers (`src/app/**`, `src/components/**`, `src/routes/**`, `src/hooks/**`) call bare `fetch(` / `globalThis.fetch` / `window.fetch`, call `getDatabase()` / `executeSql`, or import the DB singleton — and when **any** app file imports `@react-navigation/*` (use `expo-router` / `expo-router/drawer` only). Raw SQL string literals are not regex-banned (English UI copy false positives); misuse is caught via `getDatabase` / `executeSql` / DB-singleton import bans. Intentional violation fixtures under `src/app/__fixtures__/eslint-layer-boundaries/` are ignored by `npm run lint` and asserted by `scripts/eslint-layer-boundaries.test.cjs` (part of `npm test`). Wiring `scripts/architecture-guard.mjs` into CI is a separate ticket (#367).

After dependency / Dependabot work (and before claiming PR-ready), also:

```bash
npm ci
npm run doctor
npx expo install --check
```

If either reports SDK patch drift, `npx expo install --fix` on a ticketed branch. First-clone copy lives in the [README](../README.md) (Step 6). See [`.cursor/rules/commands.mdc`](../.cursor/rules/commands.mdc).

## What is required today

### Branch protection snapshot (live settings)

**Snapshot date:** 2026-08-25 · **Source:** `gh api repos/eten-tech-foundation/fluent-mobile/branches/main/protection` and ruleset `main-protection` (id `20519483`).

| Layer | Setting | Value |
| ----- | ------- | ----- |
| **Required status checks** (legacy branch protection) | Contexts | **`PR Description` only** (`strict: true` — branch must be up to date) |
| **Ruleset `main-protection`** (default branch) | PR reviews | ≥1 approval; **code owner review required**; extra approval for unattributed changes |
| | History | Linear history required; force-push and branch deletion blocked |
| **Not required in GitHub** (run locally / team policy) | Status checks | `Lint & Format`, `Unit Tests`, `TypeScript`, `expo-doctor`, `expo install --check` |

**Discrepancy:** Workflows in the table above still run on every PR, and local gates expect lint/test/typecheck/Expo health to be green before merge — but only **`PR Description`** is a *required* status check in GitHub branch protection today. Adding the CI job names as required checks is a maintainer follow-up (see guardrail below).

**PR review policy:** `.github/CODEOWNERS` — `@mattrace-gloo`, `@B3RN153`, `@JonathanSeehagen`.

Before marking a PR ready, still run the full local gate order and confirm all workflow jobs are green — do not rely on GitHub merge button alone while only `PR Description` is required.

### Branch protection (maintainers — aspirational)

When updating GitHub settings, target these **required status checks** in addition to `PR Description`:

1. **Require a pull request before merging**
2. **Require approvals** (at least 1)
3. **Require review from Code Owners** (uses [`.github/CODEOWNERS`](../.github/CODEOWNERS))
4. **Require status checks to pass** — include at least:
   - `PR Description`
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
