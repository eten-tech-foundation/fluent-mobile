# Sync #721 — supported dev-client reconnect receipt

- **When:** 2026-10-19 ~17:47–17:49 PDT
- **Agent UUID:** `bc-9c8695db-e3d3-4df1-bdbb-e0caa02685f0`
- **Host / pwd:** `Matts-MBP14.local` / `/Users/matt/Documents/Development/gloo/fluent-mobile`
- **Branch:** `mrace/chore/717-build-out-full-maestro-e2e-coverage`
- **HEAD verified:** `c81bd86d44eecda91dcaf16bb056200bbcb2355c` (`c81bd86`) — MATCH
- **Metro:** persistent `--clear` PTY still listening (`packager-status:running`); `adb reverse tcp:8081 tcp:8081`

## Why generic `exp://` failed (do not retry)

Installed Activity Resolver Table for `com.eten.fluent`:

| Scheme | Handler |
|--------|---------|
| `fluent` | `com.eten.fluent/.MainActivity` (VIEW + BROWSABLE) |
| **`exp+fluent-mobile`** | **`com.eten.fluent/.MainActivity`** (VIEW + BROWSABLE) — from Expo slug `fluent-mobile` (`app.config.ts` slug + `expo-dev-client` `exp+<slug>`) |
| `expo-dev-launcher` | `expo.modules.devlauncher.compose.AuthActivity` |

No `exp://` scheme is registered → prior `am start … exp://10.0.2.2:8081` → **unable to resolve Intent**.

Config corroboration: `app.config.ts` `slug: 'fluent-mobile'`, `scheme: 'fluent'`; `expo-dev-client` generates `exp+fluent-mobile`.

## Exact supported reconnect (session-preserving)

**Command:**
```bash
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW \
  -d 'exp+fluent-mobile://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081' \
  -n com.eten.fluent/.MainActivity
```

**Resolve-activity:** `com.eten.fluent/.MainActivity` (default match `0x208000`).

**Outcome:**
```
Starting: Intent { act=android.intent.action.VIEW dat=exp+fluent-mobile://expo-development-client/... cmp=com.eten.fluent/.MainActivity }
Warning: Activity not started, intent has been delivered to currently running top-most instance.
```

**Runtime attach proof (same PID 7152):**
- Logcat: `Loading from 10.0.2.2:8081…`
- DevLauncher: `DevLauncherExpoAppLoader.onReactContext` (benign `colorScheme` NoSuchFieldException)
- ReactNativeJS: `Running "main" with {"rootTag":11,...,"fabric":true}`
- Metro `GET /json`: **1 client** — `appId: com.eten.fluent`, `React Native Bridgeless [C++ connection]`
- `.expo/dev/logs/start.log`: live `metro:client_log` entries from device

**Session risk (understood, observed):**
- Action is a **non-destructive JS reload from Metro** via registered MainActivity deep link — **not** clearState / uninstall / login.
- KV/SQLite persist across reload.
- **Observed:** `active_user_id=10`, `userId=10`, `userEmail=qa+fluentqa-translator@fluent.local` before and after; **PID remained 7152**.

No Matt UI step required for reconnect — ADB deep link succeeded.

## ONE Sync press (only after graph/bridge proven)

- Pre: Home, `home-sync-button` bounds `[933,116][1038,221]`, user 10, Metro client attached.
- Flow: plain `tapOn: id: home-sync-button` then wait `sync-screen` 15s (no `retryIfNoChange` — unsupported in this Maestro).
- **Result:** `Tap … COMPLETED` → **`sync-screen` NOT visible** (assert FAILED).
- Post hierarchy: still `home-sync-button` + `home-tab-my-work`; `sync-screen=false`; still logged-in (no login screen).
- Session after: user **10**, PID **7152**, Metro clients still **1**.
- Maestro debug: `/Users/matt/.maestro/tests/2026-10-19_174838`

## Classification update

With **live Metro graph attached**, Sync header tap still does not open Sync. This rules out “stale embedded bundle / missing Metro module” as the sole #721 cause for this press. Remaining candidates: press → handler / navigation (`router.push(hrefs.sync)`) / immediate dismiss — **not** proven which without a short targeted probe or debugger (out of this reconnect scope; no production fix here).

## Not done

- No further cache clears, probe re-add, production Sync code change, git mutations, credentials, broad suites.

---

## Causal follow-up (2026-10-19 ~17:51 PDT) — agent `bc-9c8695db-e3d3-4df1-bdbb-e0caa02685f0`

### Hit-target / overlay (uiautomator at center 985,168)

- Smallest overlaps: SVG `GroupView`/`PathView` / `ViewGroup` **clickable=false** at icon bounds.
- `home-sync-button` **clickable=true** `[933,116][1038,221]` — no competing clickable overlay at center.
- Conclusion: **not occlusion by another clickable**.

### Markers (temp, removed)

- `s721:entry` / `s721:press` in `PageHeaderSyncButton`; `s721:handler` in `HomeScreen`; `s721:route` in stack `_layout`.
- Proven active via attached Metro Fast Refresh: `metro:client_log` `s721:entry` + `s721:route other` **before** tap (PID 7152).

### ONE native input (not Maestro)

```bash
adb shell input tap 985 168   # center of home-sync-button
```

**Result (user10 / PID7152 preserved):**
| Marker | Seen |
|--------|------|
| `s721:press` | yes |
| `s721:handler` | yes |
| `s721:route` `sync` | yes |
| hierarchy `sync-screen` | **true** |

### Boundary

- **Maestro `tapOn id: home-sync-button` earlier:** COMPLETED, stayed Home.
- **Native `input tap` at same center with live Metro markers:** press→handler→route sync→**Sync screen visible**.
- **Failed boundary for prior Maestro failure:** automation gesture delivery / Maestro tap semantics — **not** missing handler, **not** `router.push` failure, **not** clickable overlay (under this live-attached graph).
- **No production code defect confirmed** by this discriminator → **no production fix** applied.
- Unit-test green remains non-diagnostic for the Maestro-only miss.

### Cleanup

- All `s721:` markers removed; Sync-3 owned probe files diff vs HEAD = 0 bytes for those paths.
