# Wave 1 review — r1 (early-home-auth-sync-ui)

IDs: **16, 33, 41, 49** · `recommend_complete`: **4 true / 0 false** · reviewed `2026-10-20T00:53:25Z`

## #16 — Fetch & upsert all API data

**Requirement:** Sync chapter_assignments → derived project_units → bulk bible_texts with upsert; body still unchecked for legacy user-id GET and skip-bulk-if-present.  
**Disposition:** AGREED_REQUIREMENT + CONFIRMED_CURRENT_SOURCE (`/self/…`, peerCheck merged, incremental `updatedAfter` instead of full skip).  
**Evidence:** `api.ts` 260–310, `sync.ts` 496–620 / 751–870.  
**PR:** [#20](https://github.com/eten-tech-foundation/fluent-mobile/pull/20) merged (populate SQLite); sole issue comment is planning hours. Closed ≠ waive of unchecked bulk-skip.

## #33 — Build View Project Page

**Requirement (layout only):** Project/language header, six-stage rows, “Source not downloaded” chip, error retry.  
**Disposition:** AGREED + LATEST_EXPLICIT_DECISION (PR #55 scope notes) + CONFIRMED_CURRENT_SOURCE (header now milestone/project; chip → progress ring).  
**Evidence:** `ViewProject.tsx` 89–119; `ProjectChapterRow.tsx` 29–74.  
**PR:** [#55](https://github.com/eten-tech-foundation/fluent-mobile/pull/55) merged; documents chip/icon deviations.

## #41 — Better-Auth Integration

**Requirement:** Secure token store, Bearer, login/forgot/sign-out, 401→login, Privacy/Terms; named `react-native-keychain` + global `FluentMobile` UA.  
**Disposition:** AGREED + eng endorsement comment + CONFIRMED_CURRENT_SOURCE (`expo-secure-store`, UA `fluent-mobile`, mobile headers on auth calls only).  
**Evidence:** `keychain.ts`, `api.ts` 117–215, `httpClient.ts` 41–92, `LoginScreen.tsx` 238–291.  
**PR:** [#46](https://github.com/eten-tech-foundation/fluent-mobile/pull/46) merged. Living login doc is **Inferred**, not a supersession.

## #49 — Record Tab (layout vs permission)

**Layout:** Idle/recording/paused/review, pause/resume, waveform/scrub, source accordion.  
**Permission:** Mic dialog; denied → in-app + Go to Settings.  
**Disposition:** AGREED; LATEST_EXPLICIT_DECISION via [#229](https://github.com/eten-tech-foundation/fluent-mobile/pull/229) merge + prior waivers (#176/#177); #158 closed **unmerged**. Permission implemented on HEAD; several layout slices explicitly deferred.  
**QA:** 2026-10-19 warm Record tab open is chrome smoke only — not recorder AC. product-behavior §4 **Inferred**.
