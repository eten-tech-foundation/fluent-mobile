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

- [environment.md](./references/environment.md) — bring-up, Metro, Dev Client, env scoping, Expo Tools FAB
- [recovery.md](./references/recovery.md) — recovery budget, levels, MCP vs CLI, checkpoints
- [debugging.md](./references/debugging.md) — failure classes, waits, dead driver
- [selectors.md](./references/selectors.md) — selector order + existing testIDs
- [audit-mode.md](./references/audit-mode.md) — audit vs implement, contract disagreement, report semantics

Hard constraints: [`.cursor/rules/maestro-qa.mdc`](../../.cursor/rules/maestro-qa.mdc). Human playbook: [docs/guides/maestro.md](../../../docs/guides/maestro.md).

## Operating loop

```text
Understand request
→ Classify what is authorized (local vs publish)
→ Stabilize local lab (Metro, adb, Dev Client)
→ Preflight (doctor + hierarchy gate)
→ Product contract (issue) vs current code vs existing flows
→ Inspect live UI (Maestro MCP preferred)
→ Execute by checkpoint; on infra failure → recover → prove → resume
→ Continue independent scenarios after BLOCKED
→ Report (local) — product vs coverage vs infrastructure
```

Do **not** jump from “audit #NNN” to create issue / open PR / comment / board move.

## Authorization

| Request shape | Allowed | Forbidden until named ask |
| --- | --- | --- |
| Audit / investigate / report | Read GitHub, run Maestro, **bounded lab recovery**, local files, local report | Issue/PR/comment/board/push/merge |
| Add Maestro coverage (+ local product/test changes) | Local code + flows + commits if asked | Remote publish |
| “File an issue for …”, `/create-pr`, “open the PR” | That exact mutation | Anything else |

**Audit / smoke authorization includes** Level-1 and bounded Level-2 recovery ([recovery.md](./references/recovery.md)): reconnect MCP, reverse, Metro, relaunch app, hide Expo Tools FAB, retry flows. It does **not** include `clearState` by default or GitHub writes.

Do **not** end an authorized audit with “Say if you want me to re-auth Maestro and finish…”. Recover automatically; if still blocked, report BLOCKED and continue other scenarios.

## Preflight (fail fast, then recover)

1. `npm run maestro:doctor`
2. Metro: `curl -s http://127.0.0.1:8081/status` → `packager-status:running`; listener cwd = this repo
3. `adb reverse tcp:8081`; package `com.eten.fluent` installed
4. Maestro MCP: `list_devices` → `inspect_screen` (non-empty hierarchy)
5. Cold-start sanity (optional): `npm run maestro:test:harness` → `login-email-input`

If `inspect_screen` is empty or the device server is `UNAVAILABLE`: **MAESTRO INFRASTRUCTURE** — pause product flow; follow [recovery.md](./references/recovery.md); prove hierarchy; resume checkpoint. Do not raise product timeouts. Do not ask the user for routine recovery permission.

## Execution path

1. **Preferred:** Maestro MCP  
2. **Fallback:** `npm run maestro:test:*` (Cursor Shell: unrestricted OS / `all` — see recovery.md applesimutils note)  
3. **Direct CLI:** same unrestricted OS requirement  
4. Else: BLOCKED dependent scenarios; continue independent ones  

## Flow development

1. **Understand** — issue/spec, source, existing `.maestro/flows`, recent PRs if needed. State the behavior under test.
2. **Prepare** — lab + app state (prefer no `clearState` mid-iteration; keep authenticated session).
3. **Observe** — `inspect_screen` / screenshot; pick selectors ([selectors.md](./references/selectors.md)).
4. **Implement minimally** — one happy path first.
5. **Validate** — Maestro MCP `run` validates syntax; or CLI with proper OS perms.
6. **Execute** — bounded waits; checkpointed; recover on infra failure.
7. **Diagnose** — evidence + class ([debugging.md](./references/debugging.md)). One hypothesis per change.
8. **Expand / regression** — related tagged smokes; continue after BLOCKED.
9. **Report** — see template below. No remote publish.

## Report template (local)

```text
Environment: Debug Dev Client + Metro E2E | emulator | API target | session note
Product findings: …
Executed coverage: N/M planned scenarios
Infrastructure: healthy | degraded (what) | recovered (what)

Pass: …
Fail: … (class + evidence)
Workarounds (not passes): …
Blocked: … (infra class + recovery attempts; no product conclusion)
Untested: … (out of scope or not attempted)
Files changed (local): …
GitHub: untouched
```

Use **Pass with gaps** only when coverage is sufficient to justify it. If harness failure left important scenarios blocked, prefer an **interim** wording that separates product findings from coverage completeness and infrastructure confidence. Never weaken a PRODUCT failure to green a smoke.
