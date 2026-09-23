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
5. Maestro MCP host hygiene — if duplicate `maestro.cli.AppKt mcp` hosts and MCP is unhealthy, see hygiene section below before looping forever.
6. Maestro MCP: `list_devices` → `inspect_screen` (non-empty). If MCP says Not connected / needsAuth → `mcp_auth` for the Maestro namespace once, then re-list.
7. If hierarchy works → **resume nearest checkpoint**.

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

Prove health with the **smallest** check: MCP `inspect_screen` non-empty. Do not raise product timeouts as a substitute. Do **not** prove health via agent-shell CLI.

## Maestro MCP device-server recovery (deterministic)

Observed failure mode: `StatusRuntimeException: UNAVAILABLE` / “Device server died” after long idle, emulator reboot, or competing sessions. MCP Viewer may listen on `127.0.0.1:9999` or `:10000`; Android driver often uses port **7001**.

```text
Maestro MCP unhealthy
↓
stop active flow
↓
adb devices (device online?) + reverse 8081 + Metro identity
↓
MCP host hygiene check (below)
↓
MCP list_devices (reconnects session); if Not connected → mcp_auth once
↓
inspect_screen — non-empty?
↓
if still UNAVAILABLE / empty:
  avoid pkill of the Cursor MCP host unless necessary
  prefer: new list_devices + inspect after adb is healthy
  if driver wedged: recover device server / stop stale listeners on :7001 when identified
  if duplicate stale Maestro MCP Java hosts (see hygiene): stop extras, mcp_auth, re-prove
  (driver reinstall belongs in an unrestricted Terminal — not agent-shell CLI)
↓
prove inspect_screen
↓
resume nearest checkpoint (do not clearState)
```

Do **not** reboot the emulator solely because MCP disconnected. Emulator reboot is Level 2 last-resort for a wedged device — not first-line for every Maestro failure ([environment.md](./environment.md)).

Competing sessions: a hung host-side Maestro process and MCP can both stress the Android driver. Prefer stopping hung non-MCP Maestro work from an unrestricted Terminal before MCP recovery — not by launching CLI from the agent Shell.

### MCP host hygiene (duplicate / stale hosts)

Goal: **one** healthy expected Maestro MCP host for the Fluent Cursor project; avoid multi-hour dead channels and competing device servers.

Lightweight check (also surfaced by `npm run maestro:doctor` when possible):

```bash
# Maestro MCP hosts only — do not treat every Java process as Maestro
pgrep -fl 'maestro.cli.AppKt mcp' || true
lsof -nP -iTCP:9999 -sTCP:LISTEN 2>/dev/null || true
lsof -nP -iTCP:10000 -sTCP:LISTEN 2>/dev/null || true
```

| Observation | Action |
| --- | --- |
| Zero MCP hosts + MCP tools fail | `mcp_auth` / let Cursor respawn `scripts/maestro-mcp.sh`; re-list |
| One MCP host + hierarchy OK | Healthy — continue |
| Two+ `maestro.cli.AppKt mcp` (e.g. both `:9999` and `:10000`) **and** `UNAVAILABLE` / multi-hour connection age | Stale duplicate hosts — stop the **extra** Maestro MCP Java PIDs (not Metro, not qemu), `mcp_auth`, prove `inspect_screen` |
| Many unrelated Java processes | **Do not** kill — only Maestro MCP (`maestro.cli.AppKt mcp`) |

Do **not** aggressively kill processes merely because more than one Java process exists. Prefer `mcp_auth` + re-inspect before killing the active Cursor-attached host.

## Execution path (MCP vs CLI)

### Cursor Agent policy (permanent)

```text
Need Maestro execution?

Are we inside Cursor Agent?
|
+-- YES → Maestro MCP only
|         Healthy → continue
|         Unhealthy → recover MCP/device → verify hierarchy → resume via MCP
|         Repeated failure → BLOCKED affected scenarios → continue independents
|
+-- NO (developer Terminal / CI / EAS / unrestricted shell)
        → Maestro CLI (`npm run maestro:test:*`, direct `maestro`) is valid
```

**Do not** fall back to agent-shell CLI when MCP is unhealthy. Recover MCP instead.

### Known agent-shell CLI limitation (investigation DONE when matched)

Observed under Cursor Agent Shell (Maestro **2.10.0**):

1. CLI loads `Dependencies`, which initializes `applesimutils` and runs POSIX permission setup on `$user.home/.maestro/deps/applesimutils` even for Android-only runs.
2. There is no supported Android-only skip; reinstall does not remove this bootstrap.
3. The install can still be healthy (`applesimutils` present, mode `700`, MCP works).

Agent Shell layers that break direct CLI:

| Layer | Symptom |
| --- | --- |
| A | `xargs: sysconf(_SC_ARG_MAX) failed` / launcher drops JVM opts |
| B | `applesimutils` / chmod / `Operation not permitted` under `~/.maestro/deps` |
| C | After workspace `user.home` experiments: `InetAddress.getLocalHost` / network-sandbox host resolution |

**When all are true:** agent Shell + doctor healthy or sandbox WARN only + MCP lists devices / inspects hierarchy + CLI shows a known symptom above → **stop**. Do not reinstall, chmod, strip xattrs, patch jars, invent HOME wrappers, unsupported env vars, custom forks, or broaden sandbox. Return to MCP.

This is **Cursor Agent sandbox + direct CLI**, not “Fluent + Maestro CLI is broken.” Humans and CI keep using CLI normally.

### Observed vs inferred

- **Observed:** MCP initializes and drives devices successfully from the Cursor MCP host while the same machine’s agent Shell cannot run stock `maestro` reliably.
- **Do not** permanently claim speculative internals (e.g. “MCP chmods applesimutils successfully”) unless that step was measured. Prefer: the MCP host environment allows Maestro to start; the sandboxed Agent shell does not.

### Path comparison

| Path | Where | Agent policy |
| --- | --- | --- |
| Maestro MCP | Cursor MCP host | **Required** for interactive agent Maestro |
| `npm run maestro:test:*` / direct CLI | Agent Shell | **Do not use** as fallback |
| Same CLI scripts | Developer Terminal / CI / EAS | **Valid** and expected |

If a check is CLI-only and cannot be done via MCP, report that limitation — do not re-investigate the known sandbox signature.
## Audit checkpoints (procedural)

Long audits are not one fragile linear session. After recovery **or** a product FAIL, resume the **nearest useful** checkpoint:

| Checkpoint | Proof |
| --- | --- |
| Environment healthy | doctor OK-ish + Metro + reverse + non-empty hierarchy |
| Authenticated / Home | `home-tab-my-work` (or login chrome if session gone) |
| My Work / Projects list | `home-tab-*` + row ids |
| Project chapter list | `chapter-row-.*` |
| Drafting shell | `drafting-tab-bar` + chapter chrome |
| Record tab | `record-tab` / `drafting-tab-record` |
| Tab / state scenarios | source-audio visibility, last-tab, shared verse |
| Recording scenarios | leave-guard / capture checks |
| Regression / wrap-up | report with exact scenario statuses |

Preserve authenticated session across Level 1–2 when possible. Re-login via `.env.maestro` only when login UI is required.

## Continue after BLOCKED or FAIL

One blocked **or** product-failed scenario does **not** end the audit. Keep running independent scenarios. Every planned scenario must end as **PASS** | **FAIL** | **BLOCKED** | **SKIPPED** (exact counts; see [audit-mode.md](./audit-mode.md)). Do not use “UNTESTED” / “didn't get to…” as a terminal status.
