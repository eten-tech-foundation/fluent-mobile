# CI & quality gates

This repo runs GitHub Actions on pushes and pull requests. This doc maps what runs today and records a **future** guardrail so we do not brick merges if we later make checks required.

## Workflows

| Workflow | Jobs (check name) | Purpose |
| -------- | ----------------- | ------- |
| `pr-description.yml` | `PR Description` | Requires filled PR template (`### TLDR`, `Refs #NNN`, `### How to verify`); skips Dependabot |
| `lint.yml` | `Lint & Format` | ESLint + Prettier (`format:check`) + `architecture-guard --ci` |
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
npm run architecture-guard
npm run typecheck
npm test -- --ci
```

### ESLint layer boundaries (#366)

`eslint.config.js` fails lint when UI layers (`src/app/**`, `src/components/**`, `src/routes/**`, `src/hooks/**`) call bare `fetch(` / `globalThis.fetch` / `window.fetch`, call `getDatabase()` / `executeSql`, or import the DB singleton — and when **any** app file imports `@react-navigation/*` (use `expo-router` / `expo-router/drawer` only). Raw SQL string literals are not regex-banned (English UI copy false positives); misuse is caught via `getDatabase` / `executeSql` / DB-singleton import bans. Intentional violation fixtures under `src/app/__fixtures__/eslint-layer-boundaries/` are ignored by `npm run lint` and asserted by `scripts/eslint-layer-boundaries.test.cjs` (part of `npm test`).

### Architecture guard (#367)

`npm run architecture-guard` (`scripts/architecture-guard.mjs --ci`) scans `src/app` and `src/components` and **fails** on bare `fetch(`, `getDatabase(`, or `executeSql` — part of the `Lint & Format` job. Unit coverage: `scripts/architecture-guard.test.cjs`. The Cursor/Claude agent hook (`.cursor/hooks/architecture-guard.mjs` → same script without `--ci`) stays **warn-only** so Write/StrReplace are never denied; policy is documented in the script header. String SQL without those calls is not regex-scanned here (English UI copy false positives); ESLint UI bans (#366) cover broader layer rules.

After dependency / Dependabot work (and before claiming PR-ready), also:

```bash
npm ci
npm run doctor
npx expo install --check
```

If either reports SDK patch drift, `npx expo install --fix` on a ticketed branch. First-clone copy lives in the [README](../README.md) (Step 6). See [`.cursor/rules/commands.mdc`](../.cursor/rules/commands.mdc).

## What is required today

Branch protection / required status checks may change over time. Treat the table above as the **workflow inventory**. Before marking a PR ready, assume lint, test, typecheck, Expo health, and **PR Description** jobs must be green unless a maintainer says otherwise.

### Branch protection (maintainers)

On `main`, keep these rules enabled (Settings → Branches → Branch protection rules):

1. **Require a pull request before merging**
2. **Require approvals** (at least 1)
3. **Require review from Code Owners** (uses [`.github/CODEOWNERS`](../.github/CODEOWNERS) — `@mattrace-gloo`, `@B3RN153`, `@JonathanSeehagen`)
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
