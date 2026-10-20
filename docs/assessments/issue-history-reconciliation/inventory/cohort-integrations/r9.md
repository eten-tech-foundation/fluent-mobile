# Wave 3 review — r9 (mid-late-product-ci)

IDs: **188, 189, 190, 191, 192, 193, 201, 204, 205, 206, 211, 214, 217, 219, 221, 233, 234, 235, 236, 238, 240, 249** · `recommend_complete`: **22 true / 0 false** · reviewed `2026-10-20T01:07:00Z`  
Skipped: **#721** · Exact batch from `/tmp/fluent-issue-review-wave3-assignments.json` r9.

**Artifacts:** `/tmp/fluent-issue-review-r9.json` · `/tmp/fluent-issue-review-r9.md`

## #188 — Add Resources Tab with Unit-Synced Content

Shell AC on HEAD via #281; closed after human QA. Living docs still mark populated Resources expansion unverified. Evidence: `src/components/layout/DraftingTabBar.tsx:20-24`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/281).

## #189 — Add Translation Notes Section to Resources Tab

TN section AC delivered by #334; do not infer 403/grants from empty QA fixtures. Evidence: `src/app/tabs/resources/TranslationNotesSection.tsx:27-82`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/334).

## #190 — Add Translation Questions Section to Resources Tab

Closed amid API incompleteness notes; #303 explicitly supersedes that with Aquifer-live TQ. Evidence: `src/app/tabs/resources/TranslationQuestionsSection.tsx:27-104`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/303).

## #191 — Add Images & Maps Section to Resources Tab

Images & Maps AC via #304 with human QA; #348 is explicit follow-up, not audit incompleteness. Evidence: `src/app/tabs/resources/ImagesMapsSection.tsx:44-129`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/304).

## #192 — Reuse Offline Sync Model for Resources Tab

Offline inventory-only AC confirmed; named divergence: online still streams non-inventoried sections via API. Evidence: `src/utils/resourcesSectionInventory.ts:17-88`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/305).

## #193 — Update Settings Menu to Reorganize Account Actions

Settings Accounts reorganization on HEAD via #202; no later supersession. Evidence: `src/components/ui/UserSettingsMenu.tsx:306-373`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/202).

## #201 — Build Prepare for Offline Download Queue and Resource Inventory

Queue/inventory AC on HEAD via #295; fluent-api manifest ownership remains external gap noted on ticket. Evidence: `src/db/schema.ts:143-175`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/295).

## #204 — Truth-up agent docs and theme conventions to match main

Docs/theme convention AC satisfied by #207 and still living. Evidence: `.cursor/rules/architecture.mdc:10`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/207).

## #205 — Extract shared account session helpers for sign-out and switch

Shared account session helpers remain the sign-out/switch path via #208. Evidence: `src/services/accountSession.ts:23-79`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/208).

## #206 — Route Sync/Settings pending-upload reads through hooks

Pending-upload read-boundary AC on HEAD via #209; infra-only. Evidence: `src/hooks/usePendingUploads.ts:13-18`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/209).

## #211 — Require filled PR template in delivery rules

Process AC remains in force via #212; no product runtime surface. Evidence: `.cursor/rules/delivery.mdc:22-28`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/212).

## #214 — Log Dependabot triage for 2026-07-20 batch

Dependabot triage log AC documentary only; still present via #215. Evidence: `docs/guides/dependabot-resolution-log.md:67-85`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/215).

## #217 — Document Project 4 Fluent Mobile Board as canonical tracker

Canonical-tracker process AC still living policy via #218. Evidence: `docs/issue-tracking.md:5-13`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/218).

## #219 — Add nightly binary preview CI for internal Android testing

Nightly binary CI via #220; named later supersession of baked API URL to qa.api (#665/#666). Evidence: `.github/workflows/nightly-preview.yml:4-48`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/220).

## #221 — Rename home-screen app label to Fluent Mobile

Explicit not-needed decision waived Fluent Mobile rename; HEAD stays Fluent. Evidence: `app.config.ts:25`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/issues/221#issuecomment-5027688946).

## #233 — Native AAC→M4A remux module (MediaMuxer) for seekable Review scrubbing

Native remux slice on main via #254→#252; device QA is historical on those PRs, not re-verified here. Evidence: `modules/aac-remux/android/src/main/java/expo/modules/aacremux/AacRemuxModule.kt:65-115`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/254).

## #234 — Fix FK failure in chapter assignment sync for PM with no assigned work

FK bug fix on HEAD via #323; Home default-tab for PMs remains PRODUCT_DECISION_REQUIRED (explicitly non-blocking on ticket). Evidence: `src/db/repository.ts:233,559-620`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/323).

## #235 — Wire Source audio dock to real fetch + playback

Source-audio dock wired via #449; named limitations: verseTimestamps=0 seek fallback + external fluent-api#282 dependency history. Evidence: `src/hooks/useSourceAudio.ts:50-210,275-307`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/449).

## #236 — Fix blank Record tab, drafting chrome, and draft playback footguns

Post-merge Record footgun AC delivered by #237; source-audio explicitly deferred to #235. Evidence: `src/components/layout/DraftingTabBar.tsx:20-24`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/237).

## #238 — Fix recording upload failing on expo-file-system getInfoAsync deprecation

Narrow FS deprecation fix remains on HEAD via #239. Evidence: `src/services/recordingSync.ts:1,93-94,223`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/239).

## #240 — Fix verse-audio FormData upload and Record CR leftovers

FormData/client upload fix on HEAD via #241; historical undeployed-route 404 is not current product conflict. Evidence: `src/services/verseAudioFormData.ts:33-47,76-93`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/241).

## #249 — Fix nightly EAS profile to ship standalone internal APK (no Metro)

AC shape present on HEAD; implementing PR #250 closed unmerged — reconciliation is NO_PRODUCT_FIX / already-satisfied relative to #220 baseline. Evidence: `eas.json:14-15,38-48`; material [decision/PR](https://github.com/eten-tech-foundation/fluent-mobile/pull/250).

