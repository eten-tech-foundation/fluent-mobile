# GitHub Actions

Workflows for Fluent Mobile (**Android-only**).

## Workflows

| File | Trigger | Purpose |
|------|---------|---------|
| `lint.yml` | push, PR | ESLint + Prettier |
| `test.yml` | push, PR | Jest unit tests |
| `quality-gates.yml` | push, PR | TypeScript, `expo-doctor`, `expo install --check` |
| `eas-build.yml` | push tag `v*` | Sync `APP_VERSION_FALLBACK` in `app.config.ts` with tag; hand off to EAS |
| `preview-build.yml` | PR label `preview-build` | Android preview OTA or native APK for QA |
| `nightly-preview.yml` | cron (06:00 UTC) + `workflow_dispatch` | Nightly **binary-only** Android internal APK (dev API) |

Native Android compile is **not** run on every PR. Use the **`preview-build`** label for EAS preview APKs (native/config changes) and tag releases for production builds.

## Release flow

```bash
git tag v1.0.1
git push origin v1.0.1
```

1. `eas-build.yml` bumps `APP_VERSION_FALLBACK` in `app.config.ts` and moves the tag to that commit.
2. EAS Workflow `.eas/workflows/create-production-builds.yml` builds and submits Android.

See [`.eas/README.md`](../.eas/README.md) for Expo GitHub app and Play Store setup.

## PR preview (QA)

1. Create a `preview-build` label on the repo (if missing).
2. Add the label to a PR when ready for QA.
3. Workflow posts a comment with **Install Fluent** + open-the-app steps (JS-only OTA on `preview` channel), or an Android **preview APK** (native changes).

**QA guide (non-technical):** [`docs/guides/qa-preview-testing.md`](../docs/guides/qa-preview-testing.md)

Requires `EXPO_TOKEN` in repository secrets. For JS-only PRs, `.github/scripts/eas-resolve-android-build.sh` **reuses** a matching EAS preview APK (fingerprint) or starts one — avoiding duplicate compiles. `eas.json` enables **`EAS_USE_CACHE`** (ccache) on all profiles. Preview profile is internal distribution on channel `preview` (not `developmentClient`).

## Nightly preview (internal APK)

Scheduled (and manually dispatchable) workflow [`.github/workflows/nightly-preview.yml`](workflows/nightly-preview.yml):

- Always starts a **new** EAS Android build with profile **`nightly`** (internal APK, `developmentClient: false`, baked `https://dev.api.fluent.bible`).
- **No OTA** (`eas update` is not used). Expo Updates stay disabled for `nightly` so the APK cannot pull PR `preview` channel updates. Not a Metro / `development` client.
- Skips when `main` HEAD matches the last successful nightly unless `force_build` is set.
- Posts a GitHub Actions job summary and optional Slack notification.

### Secrets

| Secret | Purpose |
|--------|---------|
| `EXPO_TOKEN` | EAS CLI auth (same as PR preview) |
| `SLACK_WEBHOOK_URL` | Incoming webhook for success / failure / skip notices |

Does **not** require the Expo GitHub App — only `EXPO_TOKEN`. Manual run: **Actions → Nightly Preview → Run workflow** (available after this workflow exists on `main`).

To test from a PR before merge, add the **`nightly-preview`** label (forces a build + Slack notify).
