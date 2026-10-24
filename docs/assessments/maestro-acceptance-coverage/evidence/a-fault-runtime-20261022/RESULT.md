# Case S — C-0019-02/-03/-04 controlled DEV-fault runtime

A5554 account12. Temporary DEV/E2E projects fault + transfer startup guard. Production syncProjects/retrySyncStep path. No upload orchestrator start / Sync Now / transfer. B stopped.

## Product claims (literal criteria)

| ID | Criterion | Evidence |
|---|---|---|
| C-0019-02 | Failing sync step does not crash or block later steps | Sanitized events: injected projects fault → `user_step_failure` → later `bible_texts_complete` @1792642393.505; app remained responsive |
| C-0019-03 | Failed sync step persists `sync_error_<step>` | Native KV `sync_error_projects\|e2e metadata fault: projects` (`caseS-error-observed.txt`) |
| C-0019-04 | Sync/metadata chrome surfaces step error without global toast | `caseS-settled.xml`/PNG: `sync-metadata-error` = `Sync failed: projects`; no app toast resource; RN LogBox banner present and preserved as distinct debug chrome (not toast) |

## Recovery (supporting)

Fault-off metadata-only recovery under transfer guard: native key cleared (`recovery-error-cleared.txt`); operator receipt records `All users synced successfully` @1792642604.246. No direct SQL/error deletion or ordinary Sync Now.

## Explicit non-claims

- Controlled DEV-fault device run — not release / uninstrumented proof
- Not permanent Maestro repeatability
- LogBox ≠ app global toast
- `CONTROL-FAILURE.md` is control tooling defect (absent upload singleton), not product evidence
- D-0235 not proved / not altered here
- B-0016 remains not_run; B-0017 remains complete
