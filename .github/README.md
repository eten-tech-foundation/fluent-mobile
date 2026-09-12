# GitHub Actions

Workflows for Fluent Mobile (**Android-only**).

## Workflows

| File | Trigger | Purpose |
|------|---------|---------|
| `pr-description.yml` | PR activity (`opened` / `edited` / `synchronize` / `reopened` / `ready_for_review`) | Require filled PR template (`TLDR`, `Refs #NNN`, How to verify); Dependabot exempt |
| `action-pins.yml` | `pull_request_target` on `main` | SHA-pin gate (`Action pins`); checker from default branch |
| `lint.yml` | push, PR | ESLint + Prettier |
| `test.yml` | push, PR | Jest unit tests |
| `quality-gates.yml` | push, PR | TypeScript, lockfile `expo-doctor` (skip remote dep-version check), offline `expo install --check`, docs structure (Node from `.nvmrc`) |
| `expo-sdk-align.yml` | cron Monday 13:00 UTC + `workflow_dispatch` | Online `expo install --fix` → full doctor → one PR on `chore/expo-sdk-align` |
| `eas-build.yml` | push tag `v*` | Sync `APP_VERSION_FALLBACK` in `app.config.ts` with tag; hand off to EAS |
| `preview-build.yml` | PR label `preview-build` | Optional isolated Android preview APK (**PR comment only** — debug) |
| `qa-handoff.yml` | PR merged | Needs QA? Yes → issue handoff + assign Roslin + Project 4 `In QA` |
| `nightly-preview.yml` | cron 15:17 PT + `workflow_dispatch` | Nightly **binary-only** Android internal APK (dev API); cron identity trusted when GitHub delays; Slack in the same run |

Maestro E2E is **not** a GitHub Action — use EAS Workflow [`.eas/workflows/maestro-android.yml`](../.eas/workflows/maestro-android.yml) (`npm run maestro:eas`). See [docs/guides/maestro.md](../docs/guides/maestro.md).

## PR template + CODEOWNERS

- [`.github/PULL_REQUEST_TEMPLATE.md`](PULL_REQUEST_TEMPLATE.md) — GitHub UI pre-fill (keep synced with `.cursor/templates/pr-template.md`)
- [`.github/CODEOWNERS`](CODEOWNERS) — auto-requests review from `@mattrace-gloo`, `@B3RN153`, `@JonathanSeehagen`
- Validator: [`scripts/validate-pr-body.cjs`](scripts/validate-pr-body.cjs) (job name **`PR Description`**)

Make **`PR Description`** a required status check on `main`, and enable **Require review from Code Owners** — see [docs/ci.md](../docs/ci.md).

Native Android compile is **not** run on every PR. QA uses the **nightly** APK after merge. Optionally use the **`preview-build`** label for an isolated PR APK while debugging. Tag releases for production builds.

## Release flow

```bash
git tag v1.0.1
git push origin v1.0.1
```

1. `eas-build.yml` bumps `APP_VERSION_FALLBACK` in `app.config.ts` and moves the tag to that commit.
2. EAS Workflow `.eas/workflows/create-production-builds.yml` builds and submits Android.

See [`.eas/README.md`](../.eas/README.md) for Expo GitHub app and Play Store setup.

## Post-merge QA + optional PR preview

Canonical process (Needs QA?, post-merge nightly): [`docs/guides/qa-process.md`](../docs/guides/qa-process.md).

1. Check **Needs QA? Yes** on the PR (`Refs #NNN` on its own Details line — not `Part of #NNN`).
2. After merge, [`qa-handoff.yml`](workflows/qa-handoff.yml) comments on linked issues, adds `@Roslin22`, and best-effort moves Project 4 → **`In QA`** ([`.github/scripts/qa-handoff-on-merge.cjs`](scripts/qa-handoff-on-merge.cjs)).
3. Nightly builds post the install URL on recent handoff issues.
4. **Optional debug:** add **`preview-build`** for an isolated PR APK — **PR comment only**; does **not** start the QA queue. Re-request: remove and re-add the label.

**Install guide (non-technical):** [`docs/guides/qa-preview-testing.md`](../docs/guides/qa-preview-testing.md)

Requires `EXPO_TOKEN` in repository secrets. Optional: `PROJECT_BOARD_TOKEN` (PAT with org **project** write) so Status updates on Project 4 succeed. `eas.json` profiles `preview` / `nightly` are internal distribution with Expo Updates **disabled**.

## Nightly preview (internal APK)

Scheduled (and manually dispatchable) workflow [`.github/workflows/nightly-preview.yml`](workflows/nightly-preview.yml):

- Always starts a **new** EAS Android build with profile **`nightly`** (internal APK, baked `https://dev.api.fluent.bible`).
- **No OTA** (`eas update` is not used). Expo Updates stay disabled for `nightly` so the APK is self-contained.
- Skips when `main` HEAD matches the last successful nightly unless `force_build` is set.
- Single schedule cron intended ~**15:17 America/Los_Angeles** (~16:17 MT). GitHub often delays fires by ~3–5 hours; after lag the notice aims for late evening Mountain / early India morning (~06:30–09:00 IST). The workflow trusts `github.event.schedule == 17 15 * * *` so delayed fires still build; unknown/legacy cron strings are ignored. Green ignored-schedule no-ops do not count as the last nightly SHA for skip-if-unchanged.
- Posts a GitHub Actions job summary, install comments on recent QA handoff issues, and **Slack in the same run** (success, skip, and quiet no-APK). A run that did not produce an APK uses the same `:zzz:` skip-style card as “no new commits” (not a red X), with an Actions log link.

### Secrets

| Secret | Purpose |
|--------|---------|
| `EXPO_TOKEN` | EAS CLI auth (required for PR preview + nightly) |
| `PROJECT_BOARD_TOKEN` | Optional PAT for Project 4 Status → `In QA` on merge handoff |
| `SLACK_WEBHOOK_URL` | Incoming webhook for nightly success / failure / skip notices |

Does **not** require the Expo GitHub App — only `EXPO_TOKEN`. Manual run: **Actions → Nightly Preview → Run workflow** (available after this workflow exists on `main`).

To test from a PR before merge, add the **`nightly-preview`** label (forces a build + Slack notify).

## Expo SDK Align (scheduled patch PR)

Weekly Monday + `workflow_dispatch`: [`.github/workflows/expo-sdk-align.yml`](workflows/expo-sdk-align.yml) runs online `expo install --fix`, full `expo-doctor`, and opens/updates one PR on `chore/expo-sdk-align`.

| Secret | Purpose |
|--------|---------|
| `EXPO_SDK_ALIGN_APP_ID` + `EXPO_SDK_ALIGN_APP_PRIVATE_KEY` | Preferred: GitHub App credentials so the bot PR still triggers required checks |
| `EXPO_SDK_ALIGN_TOKEN` | Alternative: fine-grained PAT (Contents write + Pull requests write) |

`GITHUB_TOKEN` must **not** author this PR — Actions will not run `pull_request` workflows on that PR (recursion guard), so required checks such as `PR Description` never post and the merge button deadlocks.
