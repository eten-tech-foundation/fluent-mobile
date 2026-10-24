# D-0235-03 — source dock error/Retry chrome (Case Source)

Literal title: Source audio dock loading / empty / error chrome.  
Behavior: when audio is loading, missing, or failed, dock shows loading/empty/error chrome (not a silent stub). Successful Retry recovery is **not** in the mapped criterion.

## Branches

| Branch | Status |
|---|---|
| empty | Prior retained (`evidence/post-eod-empty-and-isolated`) |
| loading | Prior retained (`evidence/a-d0235-loading-20261022`) |
| error / accessible Retry | This run — `source-error-first.xml`/PNG: `source-audio-bar`, enabled button a11y `Retry loading source audio`, visible `Retry`; native source-error @1792642966.390 |

## Explicit limitations (retained)

Two ordinary Retry taps (center bounds + visible-label) produced **no** observed loading/ready recovery; only one source-error event in the bounded log check. Do **not** claim successful recovery, a product Retry bug, or permanent native/Maestro repeatability. Dev LogBox preserved; not app toast conflation for this criterion.

## Postflight

- `after-takes.json` equals `before-takes.json` (11 exact hash/status rows)
- `cache-preservation.json`: 230→230; missing/added/changed empty
- `after-queues.txt`: completed|205; chapter_claim_queue|0
- `after-sync-errors.txt`: empty
- `final-guarded-home.xml` + `after-prefs.json` active_user_id 9 (PM9). App closed before original-source restore (separate owner task) so held failed uploads cannot auto-retry.
