# Fluent Maestro environment

Android-only. Package **`com.eten.fluent`**. Scheme **`fluent`** / **`exp+fluent-mobile`** (`app.config.ts`). Local eng loop is **Debug / expo-dev-client + Metro**, not Expo Go. Hosted EAS `e2e-test` APK has **no Metro** and no `EXPO_PUBLIC_E2E_MODE`.

Recovery levels, MCP vs CLI, and checkpoints: [recovery.md](./recovery.md).

## Bring-up sequence (proven)

1. **`npm run maestro:doctor`** — JDK 17+, Maestro CLI, single adb device (`ANDROID_SERIAL` if many), app installed, reverse hint, Metro identity (see doctor).
2. **Device** — one emulator/device online. Prefer the Maestro Pixel image used locally.
3. **Metro (persistent foreground terminal)**  
   ```bash
   EXPO_PUBLIC_E2E_MODE=1 npx expo start --port 8081
   ```  
   Do **not** `nohup … &` inside a Cursor shell command that then exits — Metro dies with that shell. Confirm `curl -s http://127.0.0.1:8081/status` returns `packager-status:running` and the listener’s **cwd is this repo** (`lsof -a -p <pid> -d cwd`).
4. **Port ownership** — If another app’s Metro owns `:8081`, stop it or use another port only with matching reverse/deep-link. A foreign process (e.g. iOS Simulator `mpixapp`) can be a **TCP client** of Fluent Metro; killing “whatever listens on 8081” kills Fluent.
5. **`npm run maestro:android:up`** (or `adb -s <serial> reverse tcp:8081 tcp:8081`). Reverse must be present before deep-linking.
6. **Connect Dev Client** — launch `com.eten.fluent`. Prefer existing server history / “Continue” / `.*8081.*`. After empty history, see Dev Client section.
7. **Credentials** — gitignored `.env.maestro` (`MAESTRO_EMAIL` / `MAESTRO_PASSWORD`). Pass as Maestro flow `env` for one run; do **not** `set -a; source .env.maestro` into a shell that later runs Jest.

API base for the app remains in `.env` (`EXPO_PUBLIC_API_BASE_URL`). Jest defaults via `jest.env.cjs` to `http://localhost:9999`.

## Expo Dev Client behavior

| Fact | Consequence |
| --- | --- |
| History survives killing Metro | Old URLs (e.g. mpix) can still appear in the launcher list |
| `clearState` wipes auth **and** server history | App lands on **DEVELOPMENT SERVERS**, not Fluent login |
| Deep link needs Metro up | Link with Metro down → `unexpected end of stream` / “problem loading the project” |
| Deep-link URL (local reverse) | `exp+fluent-mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081` |

Helper: [`.maestro/helpers/dismiss-expo-dev-menu.yaml`](../../../.maestro/helpers/dismiss-expo-dev-menu.yaml) — when `DEVELOPMENT SERVERS` is visible, `openLink` the URL above; also optional Continue / `.*8081.*` / Close / dismiss Dev Menu. **Conditional** so EAS standalone APKs (no launcher) are unaffected.

`EXPO_PUBLIC_E2E_MODE=1` suppresses the Expo Dev Menu **sheet** in `__DEV__` via `E2eDevMenuGuard` (`hideMenu`). Never set on production / preview / nightly EAS profiles.

### Expo Tools FAB (floating “Tools”)

Separate from the Dev Menu sheet. Default Debug builds show a floating Tools control that **overlaps** `home-sync-button` and steals Maestro `id:` taps (semantic selectors still hit the topmost view).

| Approach | When |
| --- | --- |
| **Durable:** `expo-dev-client` plugin `android.toolsButton: false` (+ `skipOnboarding: true`) in `app.config.ts` | After `npm run prebuild` + Debug rebuild |
| **Existing install:** `npm run maestro:hide-expo-tools-fab` | Sets SharedPreferences `showFab=false`, force-stops app; relaunch **without** `clearState` |
| **Not preferred:** coordinate taps around the FAB | Fragile; avoid |

Desired E2E surface is Fluent chrome, not Expo tooling.

## clearState / destructive setup

`clearState` lives only in [`.maestro/helpers/launch-android.yaml`](../../../.maestro/helpers/launch-android.yaml) (cold-start harness / CI-shaped smokes).

Effects: wipes Secure Store session, Dev Client server history, and often leaves the empty launcher. After clearState, restore Metro reachability + deep-link (or history tap) **before** asserting `login-email-input`.

**Iteration / MCP / audit loop:** do **not** clearState / `pm clear` / uninstall mid-loop (`npm run maestro:agent:up` notes). Prefer Level-1/2 recovery ([recovery.md](./recovery.md)). Prefer **preserving authenticated session**.

## Env scoping (anti-leak)

```bash
# Metro only — prefix the command; do not export into the agent shell
EXPO_PUBLIC_E2E_MODE=1 npx expo start --port 8081

# Later, before Jest / lint / typecheck if anything leaked:
unset EXPO_PUBLIC_API_BASE_URL EXPO_PUBLIC_E2E_MODE
npm test -- --ci
```

Contamination symptom: API unit tests call `https://dev.api.fluent.bible/...` instead of `http://localhost:9999/...`.

## Harness vs product

| Check | Command / flow | Purpose |
| --- | --- | --- |
| Toolchain | `npm run maestro:doctor` | Lab health |
| Hierarchy gate | MCP `inspect_screen` | Prove Maestro ↔ device |
| Hide Tools FAB (installed Debug) | `npm run maestro:hide-expo-tools-fab` | Stop FAB stealing header taps |
| Cold start | `npm run maestro:test:harness` → `login-email-input` | clearState + connect + login chrome |
| Product slices | `maestro:test:nav`, `:drafting`, `:record`, … | Domain smokes |

## MCP vs CLI

| Path | Role |
| --- | --- |
| Maestro MCP (`scripts/maestro-mcp.sh`) | **Preferred** for agent interactive audit |
| `npm run maestro:test:*` / CLI | Fallback; Cursor agent Shell needs unrestricted OS (`all`) because CLI static-init chmod’s `~/.maestro/deps/applesimutils` even for Android |

Details: [recovery.md](./recovery.md).

## MCP

Configured in [`.cursor/mcp.json`](../../../.cursor/mcp.json) → `scripts/maestro-mcp.sh` (`maestro mcp`). Useful tools: `list_devices`, `inspect_screen`, `take_screenshot`, `run`, `cheat_sheet`.
