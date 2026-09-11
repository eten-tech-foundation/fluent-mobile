# Maestro (Android E2E)

Opt-in **Android-only** Maestro suite for Fluent Mobile ([#488](https://github.com/eten-tech-foundation/fluent-mobile/issues/488)): harness ([#489](https://github.com/eten-tech-foundation/fluent-mobile/issues/489)) + domain smokes ([#491](https://github.com/eten-tech-foundation/fluent-mobile/issues/491)) + multi-account isolation ([#495](https://github.com/eten-tech-foundation/fluent-mobile/issues/495)).

**Not** a `/create-pr` or required PR merge gate. CI playbook stays in a later ticket ([#497](https://github.com/eten-tech-foundation/fluent-mobile/issues/497)).

## Prerequisites

- JDK **17+** (`JAVA_HOME`)
- Android SDK `platform-tools` (`adb`)
- Emulator or physical device (USB debugging)
- **Debug / expo-dev-client APK** — not Expo Go, not store builds
- Dedicated **Maestro translator** on `dev.api.fluent.bible` with **≥1 chapter assignment** (My Work + project data for nav/record/sync smokes)
- For multi-account: a **second** dedicated translator (`MAESTRO_EMAIL_2` / `MAESTRO_PASSWORD_2`), also with ≥1 assignment — prefer a **different** first My Work display label than account A (isolation assert C1–C3)

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
# for multi-account (#495): also MAESTRO_EMAIL_2 / MAESTRO_PASSWORD_2
```

`.env.maestro` is gitignored via `.env.*`. Only [`.env.maestro.example`](../../.env.maestro.example) is committed.

`scripts/maestro-test.sh` loads `.env.maestro` literally when present (no `source` / expansion; `MAESTRO_*` and related keys are exported for the Maestro CLI). `maestro:test:multi-account` **fail-fast** exits if either credential pair is missing.

**Seed / assignment prerequisites (smokes):**

1. Create a translator on hosted **dev** (`https://dev.api.fluent.bible`).
2. Assign **≥1 chapter** so My Work shows a `my-work-row-*` and Projects has a matching `project-row-*` / `chapter-row-*`.
3. Point Metro / Debug at the same API (`EXPO_PUBLIC_API_BASE_URL` in `.env` and `.env.maestro`).
4. Prefer a dedicated Maestro account — the record smoke creates a take then **deletes it** (no `stage-advance-button`).
5. Keep the assigned chapter **under the 5-take cap** before a run so Record shows an enabled `record-start-button` or `record-new-take-button` (smoke fails fast if neither is enabled).

**Seed / assignment prerequisites (multi-account):**

1. Provision **two** translators; put both pairs in `.env.maestro`.
2. Assign ≥1 chapter to **each**; prefer distinct `displayLabel` values so C1–C3 can assert A’s first My Work row is absent while B is active.
3. Run `npm run maestro:test:multi-account` (not part of `maestro:test:smokes`).

## Harness vs product smokes

```bash
npm run maestro:test:harness   # flows/smoke-launch.yaml (login screen only)
npm run maestro:test:smokes    # all flows tagged `smoke` (single-account)
npm run maestro:test:auth      # include-tags auth
npm run maestro:test:nav
npm run maestro:test:record
npm run maestro:test:sync
npm run maestro:test:edges
npm run maestro:test:multi-account  # A–D isolation; needs EMAIL_2 / PASSWORD_2
npm run maestro:test           # workspace flows (excludes helpers, subflows, multi-account)
```

| Flow | Tag(s) | Clears state | Notes |
| --- | --- | --- | --- |
| `flows/smoke-launch.yaml` | `harness` | yes | Boot → `login-email-input` |
| `flows/android/smoke-auth.yaml` | `smoke` `auth` | yes | Login, session restore, logout |
| `flows/android/smoke-nav.yaml` | `smoke` `nav` | yes | My Work + Projects → drafting tabs |
| `flows/android/smoke-record.yaml` | `smoke` `record` | yes (+ mic allow) | Record → stop → play → delete take; no stage advance |
| `flows/android/smoke-sync-offline.yaml` | `smoke` `sync` | yes | Sync Now; Prepare for Offline chrome |
| `flows/android/smoke-edges.yaml` | `smoke` `edges` | yes | Forgot password, legal, mic/notification deny |
| `flows/android/smoke-multi-account.yaml` | `multi-account` | yes | Nightly checklist A–D; two accounts; not in `smokes` |

Shared subflows live under [`.maestro/flows/android/subflows/`](../../.maestro/flows/android/subflows/) and are **excluded** from workspace discovery (`!flows/**/subflows/**` in config).

Note: `platform.android.disableAnimations` in `.maestro/config.yaml` applies on **Maestro Cloud** only; local emulators ignore it.

## Known flakes / residuals

- **Post-login sync / downloads:** first Home after `clearState` can take a long time — subflows wait up to 180s for `home-tab-my-work`.
- **Sync pause/resume:** only exercised when `sync-action-pause` appears (upload/metadata in flight); otherwise Sync Now + screen chrome is enough.
- **Reauth forced path:** not automatable without a backend/session hook to invalidate the token mid-run. Residual: cover manually or when a hook exists; Settings shows `settings-reauth` only when `reauthRequired` is already true.
- **Empty My Work:** nav/record/deny edges fail without an assignment — seed the Maestro account first.
- **Record at 5-take cap:** `record-new-take-button` may still be mounted but **disabled** — smoke asserts an enabled start/new-take before waiting on stop. Delete takes on the seed chapter (or rely on smoke cleanup) before re-running.
- **Multi-account identical My Work labels:** C1–C3 `assertNotVisible` / `assertVisible` on the copied Account A label is weak or false-fails if both users’ first row shares the same `displayLabel` — seed distinct chapters. A3 (3-account limit) and E (sign-out edge) are **not** automated (optional human checklist).

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
| Project / chapter / My Work rows | `project-row-{id}`, `chapter-row-{id}`, `my-work-row-{id}`, `my-work-row-title-{id}` |
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
| `maestro:test` | Workspace flows (excludes helpers/subflows/`multi-account`) |
| `maestro:test:harness` | Launch stub only |
| `maestro:test:smokes` | All `smoke`-tagged flows |
| `maestro:test:auth` / `:nav` / `:record` / `:sync` / `:edges` | Single smoke slice |
| `maestro:test:multi-account` | Fail-fast A–D isolation (two credential pairs) |
| `maestro:agent:up` | Device prep + MCP instructions |

## Out of scope

Informational CI / playbook ([#497](https://github.com/eten-tech-foundation/fluent-mobile/issues/497)), auth bypass, iOS, merge-gating Maestro, raising the 3-account device cap.
