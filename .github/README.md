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
3. Workflow posts a comment with an OTA deep link + QR (JS-only) or an Android **dev client** APK build link (native changes).

**QA guide (non-technical):** [`docs/guides/qa-preview-testing.md`](../docs/guides/qa-preview-testing.md)

Requires `EXPO_TOKEN` in repository secrets. OTA comments use `exp+fluent-mobile://` deep links and QR codes with `slug=fluent-mobile` so Android opens **Fluent**, not Expo Go. Version resolves from latest git tag, or `app.config.ts` / `package.json` when no tags exist yet.
