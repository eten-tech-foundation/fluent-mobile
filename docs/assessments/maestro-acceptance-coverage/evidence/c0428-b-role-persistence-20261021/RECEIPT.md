# C-0428-01 final reconciliation receipt

UTC: 2026-10-21T22:15:15Z

## Decision
**complete_for_requirement / PASS**

## Literal mapping
| Criterion element | Evidence |
|---|---|
| assigned_user_id / peer_checker_id persist | roles.csv + new-baseline-roles.csv 1183=10/11, 1184=11/10, 1185=10/11 |
| never-signed-in user | user10 stubtrue; guest lifecycle 11-only then PM9 add; not cache-absence alone |
| stub created | assignee_is_stub/peer_is_stub columns |
| ownership indicators | ownership.xml/png 1183 other, 1184 mine, 1185 other (same-device B) |
| after sync | retained successful sync; no fresh sync this run |

## Counts
44/19/23 → 45/18/23
