# Wave 2 review — r6 (sync-upload-ui-mid)

IDs: **101, 103, 104, 105, 110, 117, 118, 146, 147, 151, 152, 176** · `recommend_complete`: **12 true / 0 false** · reviewed `2026-10-20T00:57:59Z`  
Skipped: **#721** · Non-overlap with wave1 r2: `{100,102,150,253}`

**Artifacts:** `/tmp/fluent-issue-review-r6.json` · `/tmp/fluent-issue-review-r6.md`

## #101 — Sync status surfaced in UI

**Requirement:** Live pending/upload UI from worker events; uploading + failed SyncStatus labels; retry re-runs upload worker.  
**Disposition:** AGREED + CONFIRMED_CURRENT_SOURCE (`syncStatusStore` event refresh, `online_uploading`/`online_failed`, Sync Now retry). **PR:** [#247](https://github.com/eten-tech-foundation/fluent-mobile/pull/247).

## #103 — Harden multi-user schema FKs/indexes

**Requirement:** `user_projects` + `chapter_assignments` FK/default/`idx_ca_assigned_user` via #110 migrations without destructive baseline rewrite.  
**Disposition:** AGREED + LATEST_EXPLICIT_DECISION (PR #248 splits chapter_assignments to #99) + CONFIRMED_CURRENT_SOURCE (v4/v5 rebuilds + schema baseline). **PR:** [#248](https://github.com/eten-tech-foundation/fluent-mobile/pull/248).

## #104 — Verify My Work / project filtering

**Requirement (verify-only):** Active-user My Work assigned+peer non-complete; aggregates after join fix; `user_projects` project scope.  
**Disposition:** AGREED + epic #118 “verified complete” claim + CONFIRMED_CURRENT_SOURCE (`myWorkChapterFilter` / `getMyWorkChapters` / `user_projects` join). **PR/decision:** `reason_not_applicable` — no linked PR; closed 2026-07-02 by author.

## #105 — Active-user recording attribution

**Requirement:** `recorded_by_user_id` migration; capture-time owner; owner-token upload policy + tests/docs.  
**Disposition:** AGREED + LATEST close comment (via #248/#251; leftovers → #259) + CONFIRMED_CURRENT_SOURCE. Contract doc is **inferred/eng** (v5 label vs code v6). **Decision:** [close comment](https://github.com/eten-tech-foundation/fluent-mobile/issues/105#issuecomment-5123591074).

## #110 — DB migration framework

**Requirement:** `user_version` runner, rebuild helper, replace ad-hoc ALTER ignore loop.  
**Disposition:** AGREED + CONFIRMED_CURRENT_SOURCE (`migrations.ts` + `db/index.ts` `runMigrations`). **PR:** [#210](https://github.com/eten-tech-foundation/fluent-mobile/pull/210).

## #117 — Epic recording sync & R2

**Requirement:** Track #99–#102 delivery (worker/UI/contract/schema) on CNG Android.  
**Disposition:** AGREED + LATEST close (sub-issues done; leftovers #253/#176) + CONFIRMED_CURRENT_SOURCE surfaces; contract path deviation is eng freeze not product waive. **Decision:** [close comment](https://github.com/eten-tech-foundation/fluent-mobile/issues/117#issuecomment-5123591371).

## #118 — Epic multi-user projects

**Requirement:** Harden/verify #103/#104/#105 (not account-switcher #84–#87).  
**Disposition:** AGREED + LATEST close (#103/#104/#105 on main; #259 follow-up) + CONFIRMED_CURRENT_SOURCE. **Decision:** [close comment](https://github.com/eten-tech-foundation/fluent-mobile/issues/118#issuecomment-5123591760).

## #146 — Upload/Download over cellular toggle

**Requirement:** Off-by-default mirrored Settings+Sync toggle; WiFi-only when off including mid-transfer pause; downloads honor toggle.  
**Disposition:** AGREED + LATEST explicit waivers (pause→#150, downloads→#201) + CONFIRMED_CURRENT_SOURCE (default-off + mirrored toggles). **Decision:** [waiver comment](https://github.com/eten-tech-foundation/fluent-mobile/issues/146#issuecomment-5025316327) / PR [#200](https://github.com/eten-tech-foundation/fluent-mobile/pull/200).

## #147 — Download queue progress on Sync

**Requirement (layout):** Downloads section placement, aggregate bar, tier labels, Manage downloads, queue-based progress.  
**Disposition:** AGREED + CONFIRMED_CURRENT_SOURCE + HISTORICAL_DEVICE_EVIDENCE (2026-09-28 / 2026-10-05 QA gaps on labels/cancel/resume; #685 fixed cancel/discovery/allComplete). **PR:** [#685](https://github.com/eten-tech-foundation/fluent-mobile/pull/685) (UI origin [#272](https://github.com/eten-tech-foundation/fluent-mobile/pull/272)).

## #151 — Sync page action controls

**Requirement:** Per-state Pause/Resume/Cancel/Sync Now matrix + cellular disable copy; engine in #150.  
**Disposition:** AGREED + LATEST waiver (engine→#150) + CONFIRMED_CURRENT_SOURCE (`SyncActionControls` + SyncScreen wiring). **Decision:** [waiver](https://github.com/eten-tech-foundation/fluent-mobile/issues/151#issuecomment-5025570092) / PR [#203](https://github.com/eten-tech-foundation/fluent-mobile/pull/203).

## #152 — Background sync notification

**Requirement (other):** Android FG notification title/body/tap/clear; no iOS. **Permission:** deny → degrade.  
**Disposition:** AGREED + LATEST PR #349 (deny continues upload) + CONFIRMED_CURRENT_SOURCE; HISTORICAL preview APK only — QA-pass checkbox unchecked at merge. **PR:** [#349](https://github.com/eten-tech-foundation/fluent-mobile/pull/349).

## #176 — Seekable AAC→M4A Review scrub

**Requirement:** Remux committed AAC→M4A; accurate Review scrub; ADTS capture unchanged; failure keeps playable; device QA.  
**Disposition:** AGREED + waiver/#233 history + CONFIRMED_CURRENT_SOURCE (`ensureSeekableTakeUri` + `modules/aac-remux`); HISTORICAL device evidence shows multi-take crash still open at 2026-08-04 close. **PR:** [#252](https://github.com/eten-tech-foundation/fluent-mobile/pull/252) (closed despite “do not close until QA” text).
