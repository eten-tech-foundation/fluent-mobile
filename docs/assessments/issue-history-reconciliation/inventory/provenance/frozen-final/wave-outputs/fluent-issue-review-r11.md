# Reviewer r11 (wave 4) — mid-late-gap-cont

- **reviewed_at_utc:** 2026-10-20T01:15:00Z
- **ids (24):** #317, #319, #324, #326, #329, #330, #343, #347, #348, #365, #366, #367, #368, #369, #370, #371, #372, #373, #374, #375, #376, #377, #378, #379
- **skip:** [721]
- **recommend_complete true:** 24
- **recommend_complete false:** 0

## Per-issue

| Issue | Title (short) | recommend_complete | Disposition highlight |
| --- | --- | --- | --- |
| #317 | PR template/CODEOWNERS/CI | true | AGREED_REQUIREMENT, CONFIRMED_CURRENT_SOURCE, SHIPPING_MAIN_VS_QA |
| #319 | pr-demo-video skill (not planned) | true | AGREED_REQUIREMENT, LATEST_EXPLICIT_DECISION, NO_PRODUCT_FIX |
| #324 | /start-issue delivery loop | true | AGREED_REQUIREMENT, CONFIRMED_CURRENT_SOURCE, SHIPPING_MAIN_VS_QA |
| #326 | yarn→npm shim | true | AGREED_REQUIREMENT, CONFIRMED_CURRENT_SOURCE, SHIPPING_MAIN_VS_QA |
| #329 | QA process docs (superseded) | true | AGREED_REQUIREMENT, LATEST_EXPLICIT_DECISION, CONFIRMED_CURRENT_SOURCE |
| #330 | QA merge gate (superseded) | true | AGREED_REQUIREMENT, LATEST_EXPLICIT_DECISION, NO_PRODUCT_FIX |
| #343 | Expo SDK 57 align | true | AGREED_REQUIREMENT, CONFIRMED_CURRENT_SOURCE, SHIPPING_MAIN_VS_QA |
| #347 | dup of #348 wrong account | true | LATEST_EXPLICIT_DECISION, NO_PRODUCT_FIX |
| #348 | Images Retry + Settings white screen | true | AGREED_REQUIREMENT, LATEST_EXPLICIT_DECISION, CONFIRMED_CURRENT_SOURCE |
| #365 | A+ grades tracker | true | AGREED_REQUIREMENT, LATEST_EXPLICIT_DECISION, SHIPPING_MAIN_VS_QA |
| #366 | ESLint UI boundary bans | true | AGREED_REQUIREMENT, CONFIRMED_CURRENT_SOURCE, SHIPPING_MAIN_VS_QA |
| #367 | CI architecture-guard | true | AGREED_REQUIREMENT, CONFIRMED_CURRENT_SOURCE, SHIPPING_MAIN_VS_QA |
| #368 | @react-navigation dep audit (≠API) | true | AGREED_REQUIREMENT, CONFIRMED_CURRENT_SOURCE, SHIPPING_MAIN_VS_QA |
| #369 | sync.ts step tests (≠API) | true | AGREED_REQUIREMENT, CONFIRMED_CURRENT_SOURCE, SHIPPING_MAIN_VS_QA |
| #370 | useVerseAudio tests | true | AGREED_REQUIREMENT, CONFIRMED_CURRENT_SOURCE, SHIPPING_MAIN_VS_QA |
| #371 | useRecordingEngine tests | true | AGREED_REQUIREMENT, CONFIRMED_CURRENT_SOURCE, SHIPPING_MAIN_VS_QA |
| #372 | Prepare Offline service tests | true | AGREED_REQUIREMENT, CONFIRMED_CURRENT_SOURCE, SHIPPING_MAIN_VS_QA |
| #373 | account/sync hook tests | true | AGREED_REQUIREMENT, CONFIRMED_CURRENT_SOURCE, SHIPPING_MAIN_VS_QA |
| #374 | remove sync.switchUser stub | true | AGREED_REQUIREMENT, LATEST_EXPLICIT_DECISION, CONFIRMED_CURRENT_SOURCE |
| #375 | multi-account nightly QA script | true | AGREED_REQUIREMENT, CONFIRMED_CURRENT_SOURCE, HISTORICAL_DEVICE_EVIDENCE |
| #376 | branch-protection snapshot | true | AGREED_REQUIREMENT, CONFIRMED_CURRENT_SOURCE, SHIPPING_MAIN_VS_QA |
| #377 | QA handoff board token (manual) | true | AGREED_REQUIREMENT, LATEST_EXPLICIT_DECISION, NO_PRODUCT_FIX |
| #378 | In QA column hygiene (manual) | true | AGREED_REQUIREMENT, LATEST_EXPLICIT_DECISION, NO_PRODUCT_FIX |
| #379 | format glob align | true | AGREED_REQUIREMENT, CONFIRMED_CURRENT_SOURCE, SHIPPING_MAIN_VS_QA |

## Namespace hygiene (#368 / #369)

- **Mobile #368** = A+ `@react-navigation` dep audit (PR #384). **Not** fluent-api#368 draft seed / QA unclaimed pool.
- **Mobile #369** = A+ `sync.ts` step unit tests (PR #385). **Not** fluent-api#369 confirm-gated reset.
- Product-behavior docs that cite API #368/#369 refer to the **fluent-api** tickets (see `docs/product-behavior/README.md`).

## Named divergences (complete ≠ conformance)

- **#329/#330:** Original pre-merge QA gate superseded by living post-merge nightly policy.
- **#348:** Offline Images Retry deferred to **#417**; online Retry + Settings nav reset on HEAD via #364.
- **#375:** Checklist on HEAD; corpus has **no** dated nightly run comment on the issue.
- **#377:** Manual waive; secret presence maintainer-owned (docs cite optional `PROJECT_BOARD_TOKEN`).
- **#319:** Not planned — skill not in tree.

## Skip

- **#721** skipped per prompt (Sync lead).

## Counts

- reviewed: 24
- recommend_complete_true: 24
- recommend_complete_false: 0
- skip_721: yes
