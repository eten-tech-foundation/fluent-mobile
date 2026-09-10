# Maestro (Android E2E) — local harness

Opt-in **Android-only** Maestro suite for Fluent Mobile. This is the foundation from [#489](https://github.com/eten-tech-foundation/fluent-mobile/issues/489) (epic [#488](https://github.com/eten-tech-foundation/fluent-mobile/issues/488)). Domain smokes land in later tickets; CI stays optional.

**Not** a `/create-pr` or required PR check.

## Prerequisites

- JDK **17+** (`JAVA_HOME`)
- Android SDK `platform-tools` (`adb`)
- Emulator or physical device (USB debugging)
- **Debug / expo-dev-client APK** — not Expo Go, not store builds
- Dedicated Maestro accounts on `dev.api.fluent.bible` (see epic)

## Install + doctor

```bash
npm run maestro:install   # curl installer → ~/.maestro/bin
npm run maestro:doctor    # java, maestro, adb, package, reverse hint
```

Add `~/.maestro/bin` to your shell `PATH` if the installer did not.

## Debug APK + Metro + reverse

```bash
npm run maestro:android:up   # adb reverse tcp:8081; device check
EXPO_PUBLIC_E2E_MODE=1 npm start
# separate terminal — install/run Debug client if needed:
npm run android
```

`EXPO_PUBLIC_E2E_MODE=1` (or `true`) suppresses the Expo Dev Menu in `__DEV__` so it does not steal Maestro taps. **Never** set this on production / preview / nightly EAS profiles.

Flows also run [`.maestro/helpers/dismiss-expo-dev-menu.yaml`](../../.maestro/helpers/dismiss-expo-dev-menu.yaml) for residual launcher sheets (“Continue”, Metro URL, etc.).

## Credentials

```bash
cp .env.maestro.example .env.maestro
# fill MAESTRO_EMAIL / MAESTRO_PASSWORD — never commit .env.maestro
```

`.env.maestro` is gitignored via `.env.*`. Only [`.env.maestro.example`](../../.env.maestro.example) is committed.

## Harness smoke

```bash
npm run maestro:test:harness   # smoke-launch.yaml via .maestro/config.yaml
# or all flows under the .maestro workspace:
npm run maestro:test
```

Both scripts use `scripts/maestro-test.sh` so `~/.maestro/bin` is on `PATH`. The harness stub cold-launches the app (`clearState` once), dismisses Dev Menu noise, and asserts `login-email-input`. Product journeys are out of scope here.

Note: `platform.android.disableAnimations` in `.maestro/config.yaml` applies on **Maestro Cloud** only; local emulators ignore it.

## Agent / MCP loop (opt-in)

```bash
npm run maestro:agent:up
```

Then wire Cursor MCP from [`.cursor/mcp.maestro.example.json`](../../.cursor/mcp.maestro.example.json) so `command` is this repo’s `scripts/maestro-mcp.sh` (sets `PATH` / `JAVA_HOME` for `maestro mcp`).

Rules:

- Opt-in only — do not require MCP for normal engineering.
- During iteration: **no `clearState` / `clearKeychain`** (wipes session mid-loop).
- `clearState` belongs only in cold-start helpers (e.g. [`.maestro/helpers/launch-android.yaml`](../../.maestro/helpers/launch-android.yaml)).

Useful MCP tools: `list_devices`, `inspect_screen`, `take_screenshot`, `run`, `cheat_sheet`.

## Selector contract (kebab-case)

Prefer Maestro `id:` matching React Native `testID`. Auth already has IDs (`login-email-input`, …). Foundation adds:

| Surface | testID |
| --- | --- |
| Home tabs | `home-tab-projects`, `home-tab-my-work` |
| Open settings drawer | `home-settings-button` |
| Project row | `project-row-{projectId}` |
| My Work row | `my-work-row-{chapterId}` |
| Chapter row (project view) | `chapter-row-{chapterId}` |
| Settings | `settings-reauth`, `settings-prepare-offline`, `settings-upload-cellular` (+ `-switch` for the Switch), `settings-drafting-unit` (+ `-verse` / `-pericope` segments), `settings-clear-cache`, `settings-add-user`, `settings-log-out` |
| Drawer content | existing `settings-menu-*` / `settings-drawer-content` |

## npm scripts

| Script | Purpose |
| --- | --- |
| `maestro:install` | Install CLI |
| `maestro:doctor` | Local health check |
| `maestro:android:up` | Device + `adb reverse` |
| `maestro:test` / `maestro:test:harness` | Run flows |
| `maestro:agent:up` | Device prep + MCP instructions |

## Out of scope here

Auth/nav/record/sync smokes, multi-account isolation, informational CI — later children of #488. iOS is never in scope.
