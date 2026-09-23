---
name: fluent-maestro
description: >-
  Fluent Mobile Android Maestro / E2E / Dev Client QA workflow: stabilize the
  lab, preflight health, inspect live UI, write and run flows, classify
  failures, and audit without unauthorized GitHub writes. Use when the user
  mentions Maestro, E2E, emulator QA, smoke flows, Expo Dev Client bring-up,
  drafting/record/sync smokes, “audit #NNN”, or Android automation against
  com.eten.fluent.
---

# fluent-maestro

Senior React Native / Maestro QA for **Fluent Mobile** (Android-only, Expo Dev Client, package `com.eten.fluent`). Stabilize the lab before product testing. Do not publish to GitHub unless the user names that mutation.

References (read when needed):

- [environment.md](./references/environment.md) — bring-up, Metro, Dev Client, emulator lifecycle, env scoping, Expo Tools FAB
- [recovery.md](./references/recovery.md) — recovery budget, levels, MCP host hygiene, MCP vs CLI, checkpoints
- [debugging.md](./references/debugging.md) — failure classes, waits, dead driver
- [selectors.md](./references/selectors.md) — selector order + existing testIDs
- [audit-mode.md](./references/audit-mode.md) — scenario inventory, failure-continuation, completion gate, issue suggestions, report format

Hard constraints: [`.cursor/rules/maestro-qa.mdc`](../../.cursor/rules/maestro-qa.mdc). Human playbook: [docs/guides/maestro.md](../../../docs/guides/maestro.md).

## Operating loop

### Audits (exhaustive)

```text
Understand request + authorization
→ Build scenario inventory (behaviorally distinct states)
→ Stabilize local lab (Metro, adb, Dev Client)
→ Preflight (doctor + hierarchy gate + MCP host hygiene)
→ Product contract (issue) vs code vs existing flows/tests
→ For each scenario:
     execute → PASS or FAIL (or BLOCKED/SKIPPED if justified)
     record evidence; on PRODUCT FAIL do not stop the audit
     restore nearest checkpoint; continue independents
→ On infra failure → recover MCP/device → prove → resume
→ Every inventory row has PASS|FAIL|BLOCKED|SKIPPED (exact counts)
→ Inspect existing Maestro/unit coverage; note gaps
→ Search GitHub; classify EXISTING vs NEW suggested issues (local only)
→ Report (structured) — zero GitHub mutations
```

**FAILURE FOUND ≠ AUDIT FINISHED.** Continue independent scenarios. Details: [audit-mode.md](./references/audit-mode.md).

### Flow development / smokes

```text
Understand request
→ Classify what is authorized (local vs publish)
→ Stabilize local lab
→ Preflight
→ Inspect live UI (Maestro MCP — required in Cursor Agent)
→ Execute by checkpoint; on infra failure → recover → resume
→ Continue independents after BLOCKED or FAIL
→ Report (local)
```

Do **not** jump from “audit #NNN” to create issue / open PR / comment / board move.

## Authorization

| Request shape | Allowed | Forbidden until named ask |
| --- | --- | --- |
| Audit / investigate / report | Read GitHub, run Maestro, **bounded lab recovery**, local files, local report + **suggested** issue drafts | Issue/PR/comment/board/push/merge |
| Add Maestro coverage (+ local product/test changes) | Local code + flows + commits if asked | Remote publish |
| “File an issue for …”, `/create-pr`, “open the PR” | That exact mutation | Anything else |

**Audit / smoke authorization includes** Level-1 and bounded Level-2 recovery ([recovery.md](./references/recovery.md)): reconnect MCP, reverse, Metro, relaunch app, hide Expo Tools FAB, retry flows. It does **not** include `clearState` by default or GitHub writes.

Do **not** end an authorized audit with “Say if you want me to re-auth Maestro and finish…”. Recover automatically; if still blocked, report BLOCKED and continue other scenarios.

## Preflight (fail fast, then recover)

1. `npm run maestro:doctor` (WARN on agent-shell applesimutils = known sandbox; not a broken install; heed duplicate Maestro MCP host WARNs)
2. Metro: `curl -s http://127.0.0.1:8081/status` → `packager-status:running`; listener cwd = this repo
3. `adb reverse tcp:8081`; package `com.eten.fluent` installed
4. Maestro MCP: `list_devices` → `inspect_screen` (non-empty hierarchy)

If `inspect_screen` is empty or the device server is `UNAVAILABLE`: **MAESTRO INFRASTRUCTURE** — pause product flow; recover MCP/device per [recovery.md](./references/recovery.md); prove hierarchy; resume checkpoint. Do not raise product timeouts. Do not ask the user for routine recovery permission. Do **not** fall back to agent-shell CLI.

## Execution decision (Cursor Agent)

```text
Need Maestro inside Cursor Agent?
→ Use Maestro MCP
   → Healthy → continue
   → Unhealthy → pause scenario → recover smallest MCP/device layer
                → list_devices / inspect_screen → resume via MCP
   → Repeated MCP failure after recovery budget
                → BLOCKED for affected scenarios → continue independents → report infra
```

**Do not** use direct `maestro` / `npm run maestro:test:*` from the Cursor Agent shell as a fallback. That path hits a **known sandbox limitation** ([recovery.md](./references/recovery.md)). If you see `applesimutils` / `sysconf(_SC_ARG_MAX)` / `getLocalHost` there: stop diagnosing install; return to MCP.

CLI is for **unrestricted** contexts only: developer Terminal, CI, EAS — not as the agent fallback.

## Flow development

1. **Understand** — issue/spec, source, existing `.maestro/flows`, recent PRs if needed. State the behavior under test.
2. **Prepare** — lab + app state (prefer no `clearState` mid-iteration; keep authenticated session).
3. **Observe** — MCP `inspect_screen` / screenshot; pick selectors ([selectors.md](./references/selectors.md)).
4. **Implement minimally** — one happy path first.
5. **Validate** — Maestro MCP `run` (syntax + execute).
6. **Execute** — bounded waits; checkpointed; on infra failure → recover MCP → prove → resume.
7. **Diagnose** — evidence + class ([debugging.md](./references/debugging.md)). One hypothesis per change; do not abandon the rest of an audit for one PRODUCT FAIL ([audit-mode.md](./references/audit-mode.md)).
8. **Expand / regression** — related tagged smokes; continue after BLOCKED **or** FAIL.
9. **Report** — audit structure in [audit-mode.md](./references/audit-mode.md); smoke template below. No remote publish.

## Report templates (local)

### Audits

Use the structured audit report in [audit-mode.md](./references/audit-mode.md) (Product findings · Coverage with exact PASS/FAIL/BLOCKED/SKIPPED · Scenario matrix · Existing coverage · Gaps · Selectors · Infrastructure · Proposed GitHub issues · GitHub: None · Confidence). Run the audit self-check before finishing.

### Smokes / harness

```text
Environment: Debug Dev Client + Metro E2E | emulator | API target | session note
Product findings: …
Coverage: Planned N | Pass X | Fail Y | Blocked Z | Skipped W (X+Y+Z+W=N)
Infrastructure: healthy | degraded (what) | recovered (what)

Pass: …
Fail: … (class + evidence)
Workarounds (not passes): …
Blocked: … (infra class + recovery attempts; no product conclusion)
Skipped: … (justified)
Files changed (local): …
GitHub: untouched
```

Never weaken a PRODUCT failure to green a smoke. Prefer exact scenario counts over `~N/M`.
