# CI & quality gates

This repo runs GitHub Actions on pushes and pull requests. This doc maps what runs today and records a **future** guardrail so we do not brick merges if we later make checks required.

## Workflows

| Workflow | Jobs (check name) | Purpose |
| -------- | ----------------- | ------- |
| `pr-description.yml` | `PR Description` | Requires filled PR template (`### TLDR`, `Refs #NNN`, `### How to verify`); skips Dependabot |
| `lint.yml` | `Lint & Format` | ESLint + Prettier (`format:check`) |
| `test.yml` | `Unit Tests` | Jest (`npm test -- --ci`) |
| `quality-gates.yml` | `TypeScript`, `expo-doctor`, `expo install --check` | Typecheck + Expo SDK / native-module alignment |
| `preview-build.yml` | Android EAS preview APK | On-demand when PR has label `preview-build` — binary only (no OTA); comments PR **and** linked issues; best-effort Project 4 → `In QA` |
| `nightly-preview.yml` | Nightly Android APK | Scheduled binary-only internal APK (dev API); also `workflow_dispatch` |
| `eas-build.yml` | Tag → version sync | Production release path on `v*` tags |

Local mirrors (run before claiming PR-ready):

```bash
npm run format:check
npm run lint
npm run typecheck
npm test -- --ci
```

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
3. **Require review from Code Owners** (uses [`.github/CODEOWNERS`](../.github/CODEOWNERS) — default `@mattrace-gloo`)
4. **Require status checks to pass** — include at least:
   - `PR Description`
   - `Lint & Format`
   - `Unit Tests`
   - `TypeScript` (and Expo health jobs when treated as required)

The `PR Description` check must post on every PR (no workflow-level `paths:` filter) so required-check waiting never deadlocks — see guardrail below.

PR template for the GitHub UI: [`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md) (keep in sync with [`.cursor/templates/pr-template.md`](../.cursor/templates/pr-template.md)).

## Preview / native compile

- Preview APKs: `preview-build.yml` + [`.github/scripts/eas-resolve-android-build.sh`](../.github/scripts/eas-resolve-android-build.sh) with `FORCE_NEW_BUILD=true` (no fingerprint reuse; no OTA)
- After a successful preview comment, [`.github/scripts/preview-notify-linked-issues.cjs`](../.github/scripts/preview-notify-linked-issues.cjs) upserts the same body on issues linked via `Refs #NNN` (or legacy closing keywords; not `Part of #NNN`) and may move Project 4 Status to `In QA` (optional `PROJECT_BOARD_TOKEN`)
- Human QA steps: [guides/qa-preview-testing.md](guides/qa-preview-testing.md)
- Nightly internal APK (no OTA): `nightly-preview.yml` + EAS profile `nightly` — see [`.github/README.md`](../.github/README.md)
- Production: tag `v*` → `eas-build.yml` + [`.eas/README.md`](../.eas/README.md)

## Future guardrail — do not brick required checks

If we later mark lint/test/typecheck as **required** status checks **and** want docs-only PRs to skip heavy jobs:

1. Keep `on: pull_request` **without** a workflow-level `paths:` filter on those workflows.
2. Put path scoping in a `changes` job (`dorny/paths-filter`) and skip leaf jobs with `if:` so they still **post** a `skipped` check (treated as passing).
3. **Never** add a workflow-level `paths:` filter alone on a required check — the check never posts → PRs sit on “Expected — Waiting for status” forever.

Do **not** implement that skip pattern until the team explicitly wants required checks + docs-only fast path. Until then, full CI on every PR is fine and safer.

## Related

- [issue-tracking.md](issue-tracking.md)
- [AGENT_ONBOARDING.md](AGENT_ONBOARDING.md)
- [guides/dependabot-process.md](guides/dependabot-process.md)
