# Disposition taxonomy (agent integrator)

Use these labels in findings and ledger notes. **Agent integrator** = Cursor agent `bc-da4aa327-d86e-47fc-93c0-d7105af39497` (not a human reviewer).

| Label | Meaning |
| --- | --- |
| **CONFIRMED_CURRENT_SOURCE** | Working-tree / branch HEAD source (or clearly merged path) contradicts an in-force requirement or still-open AC. Cite file paths. |
| **HISTORICAL_DEVICE_EVIDENCE** | Device/QA/Dev observation with date + env + build SHA. Not proof of current shipped or current QA deploy unless re-verified. |
| **OPEN_TICKET_UNRESOLVED** | Issue still open; AC not closed. Does not alone prove current broken behavior. |
| **PROVISIONAL_PRIORITY** | Priority suggested from historical evidence or open AC; awaiting product decision and/or current-env reverify. |
| **AGREED_REQUIREMENT** | Explicit ticket AC / later human product comment that remains in force unless a newer explicit decision supersedes it. |
| **LATEST_EXPLICIT_DECISION** | Newest dated comment/PR decision that narrows or supersedes earlier text. |
| **NO_PRODUCT_FIX** | Investigation concluded without changing product behavior (e.g. harness/bridge). |
| **SHIPPING_MAIN_VS_QA** | Always state which: git `main` / branch HEAD vs deployed `qa.api` / nightly APK. Never conflate. |

## Per-issue evidence fields (required for priority findings)

1. Original requirement (issue body / early AC)
2. Latest explicit decision (comment/PR + date)
3. Current source (paths + what it does; or `not checked`)
4. Device evidence (date, env Dev/QA, build, result) or `none`
5. Disposition (one or more taxonomy labels)
6. Priority class: `P0_current` | `P0_provisional` | `P1_current` | `P1_provisional` | `P2` | `none`
