# GitHub Actions

Workflows for Fluent Mobile (**Android-only**).

## Workflows

| File | Trigger | Purpose |
|------|---------|---------|
| `lint.yml` | push, PR | ESLint + Prettier |
| `test.yml` | push, PR | Jest unit tests |
| `build.yml` | push, PR | `expo prebuild` + Android debug Gradle build |
| `eas-build.yml` | push tag `v*` | Sync `APP_VERSION_FALLBACK` in `app.config.ts` with tag; hand off to EAS |
| `preview-build.yml` | PR label `preview-build` | Android preview OTA or native APK for QA |

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
