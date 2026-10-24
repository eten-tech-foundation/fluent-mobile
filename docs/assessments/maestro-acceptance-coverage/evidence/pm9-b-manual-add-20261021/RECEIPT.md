# PM9 B manual AddAccount — A-0034-01 / C-0234-01 reconciliation

Generated: `2026-10-21T19:00:00Z`

Trusted parent/user manually added PM9 on B5556. Submitted login string was not read/repeated/retained.

## Literal observations (from artifact)

Artifact: `/Users/matt/Documents/Codex/2026-10-19/task-10/artifacts/pm9-b-manual-add-20261021`

| File | sha256 |
| --- | --- |
| RECEIPT.md | `3479976da6c2127923ca4aaf90147997cc383f52835d98c321773aedb6574aaa` |
| safe-sync-events.txt | `1b25aa83bc38c56cff3f5632e551a2618188fd3981871b550c8c9e3b9833b151` |
| account-sync-keys.txt | `e5ddc7e1cce52e6d407a57c8878e17f0aa2970158e902c55dda7262fcbf0f20d` |
| counts.txt | `bd4c89c7239c56ce6e630afca4216993ee6f0596f2b09941ef9820ff77a793e0` |
| persistent-error-keys.txt | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

- Before: active11 / known11; users table lacked 9
- After manual add, no root explicit switch: active11 / known11,9; PM9 profile qa-pm; projects 11/12/13
- Full sync Starting `11:49:51.159` → completed `11:50:34.455` with timestamp `2026-10-21T18:50:34.431Z`; `9:last_synced_at` and global `last_synced_at` match exactly
- ~43s is FULL SYNC duration, not login/Tier1 (A-0025-01 unchanged)
- Allowlisted retained log query since device 11:45: no Switched active user / Post-login sync failed / FOREIGN KEY constraint failed
- Fresh native counts: projects3, assigned/peer work0, recordings0, downloads0, claims0; persistent-error-keys empty
- Observer was not armed during the manual add; mid-typing continuous observation is not a source A-0034 criterion and is not invented as a blocker

## Status decisions

| ID | Before | After |
| --- | --- | --- |
| A-0034-01 | partial / BLOCKED | complete_for_requirement / PASS |
| C-0234-01 | partial / BLOCKED | complete_for_requirement / PASS |
| A-0025-01 | not_run / BLOCKED | UNCHANGED |

Eligible atomic execution coverage: **40/23/23 → 42/21/23**

C-0019-* wording preserved. No other rows updated.
