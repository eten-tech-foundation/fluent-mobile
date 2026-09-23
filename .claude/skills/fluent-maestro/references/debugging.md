# Fluent Maestro debugging

## Failure classes

Classify every failed attempt before changing product code or YAML.

| Class | Meaning | Typical evidence |
| --- | --- | --- |
| **PRODUCT** | App contradicts the expected contract | Hierarchy shows wrong screen/state after a correct tap; code matches the wrong behavior |
| **TEST** | Flow/assert is wrong | Wrong step order, missing wait, asserting optional UI |
| **SELECTOR** | UI exists; target is unstable | Multiple `text: '3'`; missing testID; a11y label drift |
| **STATE** | Account/app in unexpected state | No My Work rows; 5-take cap; already logged in |
| **ENVIRONMENT** | Metro, reverse, API URL, wrong package, Dev Client launcher | `/status` down; DEVELOPMENT SERVERS; wrong cwd on :8081 |
| **MAESTRO INFRASTRUCTURE** | CLI/device server/driver unhealthy | `UNAVAILABLE`, “device server died”, empty hierarchy dump |

Do **not** call something a product bug until environment + Maestro infrastructure + selector/test correctness are reasonably ruled out.

## Bounded waits

| Kind | Bound | Notes |
| --- | --- | --- |
| Hierarchy / tap sanity | seconds | MCP `inspect_screen` before long flows |
| Login chrome after connect | 60s | `login-email-input` (harness / boot-to-login) |
| First Home after clearState+login | 180s | `wait-for-home.yaml` — sync/download |
| Normal navigation | 15–60s | Prefer existing flow timeouts |

Infrastructure hangs are **not** product waits. If a command sits far past a hierarchy check or a single tap (minutes with no progress):

1. Stop it  
2. Re-check doctor / Metro / adb / Maestro  
3. Classify  
4. Recover  
5. Retry only after the cause is understood  

Never repeatedly increase timeouts as a substitute for diagnosis.

## Dead Maestro device server

Symptoms: `StatusRuntimeException: UNAVAILABLE`, “Device server died”, MCP `inspect_screen` fails, empty uiautomator dump while the app is visibly open.

Follow the recovery budget in [recovery.md](./recovery.md) (Level 1 → Level 2; prove hierarchy; resume checkpoint). Summary:

1. Stop the affected product flow (do not keep stacking 3-minute runs).  
2. `adb devices` — device still `device`? reverse + Metro identity.  
3. MCP `list_devices` / `mcp_auth` if Not connected; then `inspect_screen`.  
4. If still dead: stop hung CLI sessions; optional CLI `--reinstall-driver` under unrestricted OS; avoid emulator reboot unless System UI is wedged.  
5. Prove **`inspect_screen`** non-empty.  
6. Resume nearest checkpoint — **not** `clearState`. Prefer keeping authenticated session.

Empty hierarchy ≠ “app has no UI” — treat as toolchain warning first.

### Expo Tools FAB steals taps

Symptom: tap `home-sync-button` opens Expo Tools / Dev Menu instead of Sync. Class: **ENVIRONMENT**. Fix: `npm run maestro:hide-expo-tools-fab` (installed Debug) or rebuild after `app.config.ts` `expo-dev-client` `android.toolsButton: false`. Do not invent coordinate workarounds as the primary strategy.

### CLI `applesimutils` / Operation not permitted

Symptom: `ExceptionInInitializerError` on `~/.maestro/deps/applesimutils` under Cursor sandbox. Class: **MAESTRO INFRASTRUCTURE** (agent sandbox), not a broken Maestro install. Use MCP, or re-run CLI with unrestricted OS permissions. See [recovery.md](./recovery.md).

## Dev Client / Metro failure patterns

| Symptom | Class | Recovery |
| --- | --- | --- |
| `login-email-input` missing; “DEVELOPMENT SERVERS” | ENVIRONMENT | Metro up + reverse + deep-link helper |
| “problem loading the project” / unexpected end of stream | ENVIRONMENT | Start Metro first; then deep-link |
| Jest hits `dev.api.fluent.bible` | ENVIRONMENT | `unset EXPO_PUBLIC_API_BASE_URL`; re-run tests |
| Foreign client on Fluent Metro (mpix) | ENVIRONMENT | Kill the **client**; do not kill Fluent’s listener blindly |
| Assert fails but hierarchy shows expected ids after long wait | STATE / flake | Re-inspect; avoid clearState mid-loop |

## Diagnosis discipline

- Collect evidence: hierarchy snippet, screenshot path, Metro log line, doctor output.  
- Change **one** hypothesis per iteration.  
- Do not randomly edit YAML.  
- Do not “fix” a product failure by weakening the assertion without labeling a workaround ([audit-mode.md](./audit-mode.md)).
