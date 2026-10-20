# fluent-issue-review r3 (open-audit-maestro)

Parent: `bc-da4aa327-d86e-47fc-93c0-d7105af39497`  
Reviewed: 2026-10-20T00:53:58Z  
IDs: **526, 529, 530, 717** (wave 1 only)  
Wrote only: `/tmp/fluent-issue-review-r3.json`, `/tmp/fluent-issue-review-r3.md`

## recommend_complete counts

| recommend_complete | count |
| --- | --- |
| true | 3 (#529, #530, #717) |
| false | 1 (#526 epic) |

## Findings (≤2 sentences each)

### #526 Mobile Feature Audit [Epic] — `recommend_complete=false`
Epic #526 remains open: GitHub sub-issues show 6 still open (#528, #529, #530, #531, #533, #534) and only #527/#532 closed. Closed #527 still lacks `docs/assessments/drafting-page/` on tree — closed state is not epic DoD.

### #529 Going offline Audit — `recommend_complete=true`
Assessment PR #577 merged Pass-with-gaps on Dev evidence; ticket stays OPEN with #578 still open (deferred behind #504, launch-blocker TBD). Historical G.26 Fail ≠ current TN local-offline path; living docs supersede assessment matrices.

### #530 Returning online and synchronizing changes Audit — `recommend_complete=true`
Merged assessment PR #598 records Overall Fail on Dev with High gaps #599/#257/#611 still product-TBD launch blockers; audit ticket remains OPEN. Current `stageAdvance.ts` still defers durable offline stage queue to #257 — separate from living #721 Sync-nav deviation (not owned here).

### #717 Build out full Maestro E2E coverage — `recommend_complete=true`
OPEN with all AC checkboxes unchecked; branch has partial warm helpers, fixture guard, `retries:0` nightly commit gate, and zero-JUnit BLOCKED, but first-row `open-any-chapter` remains in several flows and no device PASS exists. Issue-body milestone that `open-my-work-chapter` is unused is stale versus current tree.

## Distinctions applied

- **HISTORICAL_DEVICE_EVIDENCE** (Dev Redmi Note 9 Pro 2026-09) ≠ QA Nightly signoff ≠ current source.
- **Explicit deferral** (#578 blocked on #504) ≠ AC waive; launch-blocker TBD = **PRODUCT_DECISION_REQUIRED**.
- Assessment READMEs labeled historical; product-behavior inferred labels ≠ agreement.
- Did **not** duplicate Sync #721 active lead; only cited living-doc reference from #530 assessment/core-flows.
