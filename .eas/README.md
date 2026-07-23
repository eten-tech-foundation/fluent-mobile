# EAS Workflows

Automated **Android-only** production releases for Fluent Mobile.

## Workflows

| File | Purpose |
|------|---------|
| `create-production-builds.yml` | Production Android AAB build + Play Store submit on version tags |

Tag-based version sync runs in GitHub Actions (`.github/workflows/eas-build.yml`).

## How it works

```
Tag pushed (e.g. v1.0.1)
    ↓
GitHub Actions (eas-build.yml)
    ├─ Set `APP_VERSION_FALLBACK` in app.config.ts to match tag
    ├─ Commit [skip ci] and move tag to that commit
    └─ Push to main
    ↓
EAS Workflow (create-production-builds.yml)
    ├─ Fingerprint check
    └─ Android production build → submit (internal track)
```

## One-time setup

1. **Expo GitHub app** — Connect this repo to EAS project `b0919574-f268-4768-b3bd-7cfa5172bbab` on [expo.dev](https://expo.dev).
2. **GitHub Actions permissions** — Repo **Settings → Actions → General → Workflow permissions**: **Read and write**.
3. **Google Play credentials** — Configure in EAS project credentials (or `eas.json` submit profile). Required for `submit: true`.
4. **`EXPO_TOKEN`** (optional for local `eas` CLI) — Create at [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens).

## Release a version

```bash
git tag v1.0.1
git push origin v1.0.1
```

Use semantic versioning with a `v` prefix (`v1.0.0`, `v1.0.1`, `v1.1.0`).

Monitor:

- **GitHub Actions** — `.github/workflows/eas-build.yml`
- **EAS Dashboard** — Workflows / Builds for project `fluent-mobile`

## PR preview builds

Add the **`preview-build`** label to a pull request. GitHub Actions (`.github/workflows/preview-build.yml`) will:

- **JS-only changes** → find or build a matching **Install Fluent** preview APK, then publish an OTA to the `preview` channel (PR comment: install + open app — not Expo Go)
- **Native changes** (`app.config.ts` plugins, `eas.json`, `plugins/`) → start an Android `preview` internal APK on EAS (no `developmentClient`; channel `preview`)

**QA testers:** [`docs/guides/qa-preview-testing.md`](../docs/guides/qa-preview-testing.md)

Uses the latest git tag for runtime version when available; otherwise falls back to `app.config.ts` / `package.json` version (no tag required for first preview). Requires `EXPO_TOKEN` in GitHub Actions secrets.

## Nightly builds (binary only)

GitHub Actions [`.github/workflows/nightly-preview.yml`](../.github/workflows/nightly-preview.yml) builds a fresh Android **internal APK** with the EAS **`nightly`** profile each night (or on `workflow_dispatch`).

- Bakes `EXPO_PUBLIC_API_BASE_URL=https://dev.api.fluent.bible`
- **`developmentClient: false`** — standalone APK with JS bundled (not a Metro / `development` profile build)
- **No Updates channel** and **no `eas update`** — what you install is what you run
- Does **not** require the Expo GitHub App (uses `EXPO_TOKEN`, same as PR preview)
- Distinct from PR `preview` (which may OTA to channel `preview`)

See [`.github/README.md`](../.github/README.md) for secrets and skip / force behavior.

## Manual build (without tag)

```bash
npx eas build --profile production --platform android
npx eas submit --profile production --platform android
```

Nightly-equivalent local build:

```bash
npx eas build --profile nightly --platform android
```
