# CI & quality gates

This repo runs GitHub Actions on pushes and pull requests. This doc maps what runs today and records a **future** guardrail so we do not brick merges if we later make checks required.

## Workflows

| Workflow | Jobs (check name) | Purpose |
| -------- | ----------------- | ------- |
| `lint.yml` | `Lint & Format` | ESLint + Prettier (`format:check`) |
| `test.yml` | `Unit Tests` | Jest (`npm test -- --ci`) |
| `quality-gates.yml` | `TypeScript`, `expo-doctor`, `expo install --check` | Typecheck + Expo SDK / native-module alignment |
| `preview-build.yml` | Preview OTA / Android EAS | On-demand when PR has label `preview-build` |
| `nightly-preview.yml` | Nightly Android APK | Scheduled binary-only internal APK (dev API); also `workflow_dispatch` |
| `eas-build.yml` | Tag → version sync | Production release path on `v*` tags |

Local mirrors (run before claiming PR-ready):

```bash
npm run format:check
npm run lint
npm run typecheck
npm test -- --ci
```

After dependency / Dependabot work, also:

```bash
npm ci
npm run doctor
```

See [`.cursor/rules/commands.mdc`](../.cursor/rules/commands.mdc).

## What is required today

Branch protection / required status checks may change over time. Treat the table above as the **workflow inventory**. Before marking a PR ready, assume lint, test, typecheck, and Expo health jobs must be green unless a maintainer says otherwise.

**This Phase 1 docs change does not alter branch protection or add new required checks.**

## Preview / native compile

- JS-only preview OTA vs native Android APK is decided by `preview-build.yml` + [`.github/scripts/eas-resolve-android-build.sh`](../.github/scripts/eas-resolve-android-build.sh)
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
