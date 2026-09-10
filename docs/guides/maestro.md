# Maestro (Android E2E)

Opt-in **Android-only** Maestro suite for Fluent Mobile ([#488](https://github.com/eten-tech-foundation/fluent-mobile/issues/488)): harness ([#489](https://github.com/eten-tech-foundation/fluent-mobile/issues/489)) + domain smokes ([#491](https://github.com/eten-tech-foundation/fluent-mobile/issues/491)).

**Not** a `/create-pr` or required PR merge gate. CI playbook stays in a later ticket.

## Prerequisites

- JDK **17+** (`JAVA_HOME`)
- Android SDK `platform-tools` (`adb`)
- Emulator or physical device (USB debugging)
- **Debug / expo-dev-client APK** — not Expo Go, not store builds
- Dedicated **Maestro translator** on `dev.api.fluent.bible` with **≥1 chapter assignment** (My Work + project data for nav/record/sync smokes)

## Install + doctor

```bash
npm run maestro:install   # pinned Maestro zip + SHA-256 verify → ~/.maestro/bin
npm run maestro:doctor    # JDK 17+, maestro, single adb device, package, reverse hint
```

`maestro:install` downloads a pinned CLI release (`MAESTRO_VERSION`, default `2.10.0`) and verifies `maestro.zip` against `checksums_sha256.txt` — it does **not** pipe a remote install script to bash. Override with `MAESTRO_VERSION=x.y.z` when bumping deliberately.

Add `~/.maestro/bin` to your shell `PATH` if needed.

With multiple devices online, set `ANDROID_SERIAL` before `maestro:doctor` / `maestro:android:up`.

## Debug APK + Metro + reverse

```bash
npm run maestro:android:up   # selects one device; adb -s … reverse tcp:8081
EXPO_PUBLIC_E2E_MODE=1 npm start
# separate terminal — install/run Debug client if needed:
npm run android
```

`EXPO_PUBLIC_E2E_MODE=1` (or `true`) suppresses the Expo Dev Menu in `__DEV__` so it does not steal Maestro taps. **Never** set this on production / preview / nightly EAS profiles.

Flows also run [`.maestro/helpers/dismiss-expo-dev-menu.yaml`](../../.maestro/helpers/dismiss-expo-dev-menu.yaml) for residual launcher sheets (“Continue”, Metro URL, etc.).

## Credentials + seed

```bash
cp .env.maestro.example .env.maestro
# fill MAESTRO_EMAIL / MAESTRO_PASSWORD — never commit .env.maestro
```

`.env.maestro` is gitignored via `.env.*`. Only [`.env.maestro.example`](../../.env.maestro.example) is committed.

`scripts/maestro-test.sh` auto-sources `.env.maestro` when present (`MAESTRO_*` vars are also read by the Maestro CLI from the shell).

**Seed / assignment prerequisites (smokes):**

1. Create a translator on hosted **dev** (`https://dev.api.fluent.bible`).
2. Assign **≥1 chapter** so My Work shows a `my-work-row-*` and Projects has a matching `project-row-*` / `chapter-row-*`.
3. Point Metro / Debug at the same API (`EXPO_PUBLIC_API_BASE_URL` in `.env` and `.env.maestro`).
4. Prefer a dedicated Maestro account — smokes **record** a take but **do not** tap `stage-advance-button`.

## Harness vs product smokes

```bash
npm run maestro:test:harness   # flows/smoke-launch.yaml (login screen only)
npm run maestro:test:smokes    # all flows tagged `smoke`
npm run maestro:test:auth      # include-tags auth
npm run maestro:test:nav
npm run maestro:test:record
npm run maestro:test:sync
npm run maestro:test:edges
npm run maestro:test           # workspace flows (excludes helpers + subflows)
```

| Flow | Tag(s) | Clears state | Notes |
| --- | --- | --- | --- |
| `flows/smoke-launch.yaml` | `harness` | yes | Boot → `login-email-input` |
| `flows/android/smoke-auth.yaml` | `smoke` `auth` | yes | Login, session restore, logout |
| `flows/android/smoke-nav.yaml` | `smoke` `nav` | yes | My Work + Projects → drafting tabs |
| `flows/android/smoke-record.yaml` | `smoke` `record` | yes (+ mic allow) | Record → stop → play; no stage advance |
| `flows/android/smoke-sync-offline.yaml` | `smoke` `sync` | yes | Sync Now; Prepare for Offline chrome |
| `flows/android/smoke-edges.yaml` | `smoke` `edges` | yes | Forgot password, legal, mic/notification deny |

Shared subflows live under [`.maestro/flows/android/subflows/`](../../.maestro/flows/android/subflows/) and are **excluded** from workspace discovery (`!flows/**/subflows/**` in config).

Note: `platform.android.disableAnimations` in `.maestro/config.yaml` applies on **Maestro Cloud** only; local emulators ignore it.

## Known flakes / residuals

- **Post-login sync / downloads:** first Home after `clearState` can take a long time — subflows wait up to 180s for `home-tab-my-work`.
- **Sync pause/resume:** only exercised when `sync-action-pause` appears (upload/metadata in flight); otherwise Sync Now + screen chrome is enough.
- **Reauth forced path:** not automatable without a backend/session hook to invalidate the token mid-run. Residual: cover manually or when a hook exists; Settings shows `settings-reauth` only when `reauthRequired` is already true.
- **Empty My Work:** nav/record/deny edges fail without an assignment — seed the Maestro account first.

## Agent / MCP loop (opt-in)

```bash
npm run maestro:agent:up
```

Then wire Cursor MCP from [`.cursor/mcp.maestro.example.json`](../../.cursor/mcp.maestro.example.json) so `command` is this repo’s `scripts/maestro-mcp.sh` (sets `PATH` / `JAVA_HOME` for `maestro mcp`).

Rules:

- Opt-in only — do not require MCP for normal engineering.
- During iteration: **no `clearState` / `clearKeychain`** (wipes session mid-loop).
- `clearState` belongs only in cold-start helpers / CI-shaped smokes (e.g. [`.maestro/helpers/launch-android.yaml`](../../.maestro/helpers/launch-android.yaml)).

Useful MCP tools: `list_devices`, `inspect_screen`, `take_screenshot`, `run`, `cheat_sheet`.

## Selector contract (kebab-case)

Prefer Maestro `id:` matching React Native `testID`.

| Surface | testID |
| --- | --- |
| Auth | `login-email-input`, `login-password-input`, `login-submit-button`, `login-forgot-password-link`, `login-privacy-link`, `login-terms-link`, forgot-password / legal scroll ids |
| Home tabs | `home-tab-projects`, `home-tab-my-work` |
| Open settings drawer | `home-settings-button` |
| Open Sync | `home-sync-button` |
| Project / chapter / My Work rows | `project-row-{id}`, `chapter-row-{id}`, `my-work-row-{id}` |
| Drafting tabs | `drafting-tab-bar`, `drafting-tab-bible`, `drafting-tab-resources`, `drafting-tab-record` |
| Drafting surfaces | `bible-tab`, `resources-tab`, `record-tab`, record control ids |
| Sync / offline | `sync-screen`, `sync-action-*`, `prepare-offline-screen`, `prepare-offline-*` |
| Settings | `settings-reauth`, `settings-prepare-offline`, `settings-upload-cellular` (+ `-switch`), `settings-drafting-unit` (+ segments), `settings-clear-cache`, `settings-add-user`, `settings-log-out` |
| Drawer | `settings-menu-*` / `settings-drawer-content` |

## npm scripts

| Script | Purpose |
| --- | --- |
| `maestro:install` | Install CLI |
| `maestro:doctor` | Local health check |
| `maestro:android:up` | Device + `adb reverse` |
| `maestro:test` | Workspace flows (config excludes helpers/subflows) |
| `maestro:test:harness` | Launch stub only |
| `maestro:test:smokes` | All `smoke`-tagged flows |
| `maestro:test:auth` / `:nav` / `:record` / `:sync` / `:edges` | Single smoke slice |
| `maestro:agent:up` | Device prep + MCP instructions |

## Out of scope

Multi-account isolation ([#495](https://github.com/eten-tech-foundation/fluent-mobile/issues/495)), informational CI / playbook ([#497](https://github.com/eten-tech-foundation/fluent-mobile/issues/497)), auth bypass, iOS, merge-gating Maestro.
