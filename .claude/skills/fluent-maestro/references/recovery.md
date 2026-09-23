# Recovery, checkpoints, and execution paths

Use this after an **already-authorized** audit/test task hits infrastructure failure. Do **not** stop and ask the user for routine Maestro/adb/Metro recovery.

Hard gate for GitHub publish remains [maestro-qa.mdc](../../../../.cursor/rules/maestro-qa.mdc). Recovery ≠ publish.

## Authorization for recovery

Once the user asks to **audit / smoke / E2E-test** a feature, the agent may perform **reasonable non-destructive** (and bounded Level-2) recovery to finish that task.

| May do automatically | Must stop and ask |
| --- | --- |
| Reconnect Maestro MCP / restart device server | Credentials missing from `.env.maestro` / approved mechanism |
| Restart adb reverse, Metro (same E2E prefix), relaunch app | Remote GitHub/board mutation |
| Reopen existing logged-in session (no `clearState`) | Ambiguous product decision / contract conflict |
| Bounded emulator reboot when Level-1/2 insufficient | Destructive wipe that would destroy unrelated user work |
| Mark one scenario BLOCKED and continue others | — |

**Never** jump from MCP disconnect → `clearState`.

Distinguish:

| Concept | Meaning |
| --- | --- |
| Maestro reconnect | MCP / device-server / CLI driver |
| App process restart | `am force-stop` + deep-link / launch; Secure Store session often survives |
| Test-account login | `.env.maestro` credentials via flow `env` — only when login chrome is required |

## Recovery levels

### Level 1 — non-destructive (default; automatic)

1. Stop the active product flow (do not stack long timeouts).
2. `adb devices` — serial still `device`?
3. `adb reverse tcp:8081` if missing.
4. Metro: `curl -s http://127.0.0.1:8081/status` → `packager-status:running`; cwd = this repo.
5. Maestro MCP: `list_devices` → `inspect_screen` (non-empty). If MCP says Not connected / needsAuth → `mcp_auth` for the Maestro namespace once, then re-list.
6. If hierarchy works → **resume nearest checkpoint**.

### Level 2 — process / device (automatic when Level 1 fails and state risk is low)

Prefer in order (smallest first):

1. Restart only the Maestro device-server layer (see below) — **not** a full emulator reboot first.
2. Force-stop + relaunch `com.eten.fluent` **without** `clearState`; deep-link to Metro if needed.
3. Hide Expo Tools FAB on an existing Debug install if it is stealing taps (`npm run maestro:hide-expo-tools-fab` / [environment.md](./environment.md)).
4. `adb kill-server && adb start-server` + re-reverse (invalidates Maestro sessions — re-prove hierarchy).
5. Emulator reboot **only** if System UI ANR / device wedged and Level 1–2 failed; then reverse + relaunch + hierarchy prove. Prefer preserving Secure Store session.

### Level 3 — destructive (deliberate only)

`clearState` / `pm clear` / uninstall / wipe emulator / wipe credentials. Destroys auth **and** Dev Client server history. Only for cold-start harness / scenarios that **require** fresh login, or when explicitly justified in the report.

## Recovery budget (same infra layer)

```text
1st failure of class X  → Level 1 recover → prove hierarchy → resume checkpoint
2nd recurrence of X     → one deeper Level 2 step → prove → resume
Still failing           → mark affected scenario(s) BLOCKED → continue independent scenarios
Never                   → infinite restart loops or “ask user to re-auth Maestro”
```

Prove health with the **smallest** check: MCP `inspect_screen` non-empty (or CLI hierarchy under the CLI rules below). Do not raise product timeouts as a substitute.

## Maestro MCP device-server recovery (deterministic)

Observed failure mode: `StatusRuntimeException: UNAVAILABLE` / “Device server died” after long idle, emulator reboot, or competing CLI `hierarchy`/`test` sessions. MCP Viewer may listen on `127.0.0.1:9999` or `:10000`; Android driver often uses port **7001**.

```text
Maestro MCP unhealthy
↓
stop active flow
↓
adb devices (device online?) + reverse 8081 + Metro identity
↓
MCP list_devices (reconnects session); if Not connected → mcp_auth once
↓
inspect_screen — non-empty?
↓
if still UNAVAILABLE / empty:
  avoid pkill of the Cursor MCP host unless necessary
  prefer: new list_devices + inspect after adb is healthy
  if driver wedged: maestro … hierarchy --reinstall-driver (CLI with all OS perms) OR stop stale java on :7001 only when identified
↓
prove inspect_screen
↓
resume nearest checkpoint (do not clearState)
```

Do **not** reboot the emulator solely because MCP disconnected.

Competing sessions: a hung `maestro hierarchy` / `maestro test` CLI and MCP can both stress the Android driver. Stop hung CLI before MCP recovery.

## Execution path (MCP vs CLI)

### Root cause: CLI + Cursor sandbox

Maestro CLI **2.10.0** loads `maestro.cli.Dependencies` in a static initializer. That always calls `Unpacker.binaryDependency("applesimutils")`, which **chmod**s `~/.maestro/deps/applesimutils` — even for **Android-only** runs. Under the Cursor agent sandbox, chmod outside the workspace fails with `Operation not permitted` → `ExceptionInInitializerError` before any Android work.

Maestro MCP (`scripts/maestro-mcp.sh` → `maestro mcp`) runs as a **separate** Cursor MCP process **outside** that sandbox, so it works when connected.

### Ordering for agents

```text
1. Preferred: Maestro MCP (list_devices → inspect_screen → run)
2. Fallback: npm run maestro:test:* / scripts/maestro-test.sh
   — Shell tool must use required_permissions: ["all"] (or equivalent unrestricted OS)
3. Direct: maestro CLI with the same unrestricted OS access
4. If neither path can prove hierarchy after recovery budget:
   classify MAESTRO INFRASTRUCTURE / BLOCKED for dependent scenarios
```

Do not treat “CLI failed in sandbox” as “Maestro is broken on this machine.” Re-run CLI with full permissions or use MCP.

## Audit checkpoints (procedural)

Long audits are not one fragile linear session. After recovery, resume the **nearest useful** checkpoint:

| Checkpoint | Proof |
| --- | --- |
| Environment healthy | doctor OK-ish + Metro + reverse + non-empty hierarchy |
| Authenticated / Home | `home-tab-my-work` (or login chrome if session gone) |
| Drafting shell | `drafting-tab-bar` + chapter chrome |
| Navigation scenarios | My Work / Projects entry done |
| Tab / state scenarios | source-audio visibility, last-tab, shared verse |
| Recording scenarios | leave-guard / capture checks |
| Regression / wrap-up | report |

Preserve authenticated session across Level 1–2 when possible. Re-login via `.env.maestro` only when login UI is required.

## Continue after BLOCKED

One blocked scenario does **not** end the audit. Keep running independent scenarios. Report per scenario: **PASS** | **FAIL** | **BLOCKED** | **UNTESTED**.
