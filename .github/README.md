# GitHub Actions

Workflows for Fluent Mobile (**Android-only**).

## Workflows

| File | Trigger | Purpose |
|------|---------|---------|
| `pr-description.yml` | PR activity (`opened` / `edited` / `synchronize` / `reopened` / `ready_for_review`) | Require filled PR template (`TLDR`, `Refs #NNN`, How to verify); Dependabot exempt |
| `lint.yml` | push, PR | ESLint + Prettier |
| `test.yml` | push, PR | Jest unit tests |
| `quality-gates.yml` | push, PR | TypeScript, `expo-doctor`, `expo install --check` |
| `eas-build.yml` | push tag `v*` | Sync `APP_VERSION_FALLBACK` in `app.config.ts` with tag; hand off to EAS |
| `preview-build.yml` | PR label `preview-build` | Optional isolated Android preview APK (**PR comment only** — debug) |
| `qa-handoff.yml` | PR merged | Needs QA? Yes → issue handoff + assign Roslin + Project 4 `In QA` |
| `nightly-preview.yml` | cron (06:00 UTC) + `workflow_dispatch` | Nightly **binary-only** Android internal APK (dev API); install comments on recent handoffs |

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
- Posts a GitHub Actions job summary, optional Slack notification, and install comments on recent QA handoff issues.

### Secrets

| Secret | Purpose |
|--------|---------|
| `EXPO_TOKEN` | EAS CLI auth (required for PR preview + nightly) |
| `PROJECT_BOARD_TOKEN` | Optional PAT for Project 4 Status → `In QA` on merge handoff |
| `SLACK_WEBHOOK_URL` | Incoming webhook for nightly success / failure / skip notices |

Does **not** require the Expo GitHub App — only `EXPO_TOKEN`. Manual run: **Actions → Nightly Preview → Run workflow** (available after this workflow exists on `main`).

To test from a PR before merge, add the **`nightly-preview`** label (forces a build + Slack notify).
