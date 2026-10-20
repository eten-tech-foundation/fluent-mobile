# Executive findings packet (source-linked)

**HEAD:** `5334ff6aa69ae4227332ad2304fa3f8a0c70e7f9`  
**Ledger:** 308/308 audit rows · **Complete ≠ Nightly**  
**Status: FINAL-frozen** — delta PASS `/tmp/fluent-audit-final-review.md`; freeze receipt `/tmp/fluent-audit-frozen-final.md`  
**Report:** [`FINAL-report.md`](./FINAL-report.md)  
**Structured twin:** [`inventory/executive-findings.json`](./inventory/executive-findings.json)  
Evidence: accepted `coverage.csv` rows / existing receipts only — no fresh broad review.

---

## Expected behavior (agreed product baselines cited)

| Area | Expected | Cite |
| --- | --- | --- |
| Sync entry | Home cloud → Sync screen | [#38](https://github.com/eten-tech-foundation/fluent-mobile/issues/38) / [#149](https://github.com/eten-tech-foundation/fluent-mobile/issues/149) |
| Offline stage advance | Persist queue; reconnect `PATCH .../submit` | [#257](https://github.com/eten-tech-foundation/fluent-mobile/issues/257) |
| Reconnect claims | Push pending claims before upload/refresh; surface conflicts | [#271](https://github.com/eten-tech-foundation/fluent-mobile/issues/271) |
| Record permission | Mic dialog; denied → in-app + Settings | [#49](https://github.com/eten-tech-foundation/fluent-mobile/issues/49) |
| Seekable Review scrub | Committed take seekable after remux + **Android device QA before close** | [#176](https://github.com/eten-tech-foundation/fluent-mobile/issues/176) / [#233](https://github.com/eten-tech-foundation/fluent-mobile/issues/233) |
| Source dock | Real fetch/playback (not stub) | [#235](https://github.com/eten-tech-foundation/fluent-mobile/issues/235) |
| Project list filter | Manager org-wide / Translator assigned projects | [#4](https://github.com/eten-tech-foundation/fluent-mobile/issues/4) |
| Auth sign-out / 401 | Clear token (+ original AC: local DB/caches) → Login; 401 expired → clear → Login | [#41](https://github.com/eten-tech-foundation/fluent-mobile/issues/41) |
| Upload foreground | No startForeground / duplicate-session crash | [#599](https://github.com/eten-tech-foundation/fluent-mobile/issues/599) |

---

## Actual source / local QA (not Nightly)

| Area | Actual | Cite |
| --- | --- | --- |
| **#4** `/self/projects` | Server grant/org-role filter at API pin `4336602` (`getByUserId`: project grant **or** org-scoped role ≠ Org Member). Mobile has **no** Manager/Translator client branch — **≠** proof of unfiltered server / invented client bug. Remaining unknown: “assigned” = project grant vs chapter-assignment-only | coverage #4; fluent-api `self-projects.route.ts` / `projects.repository.ts` @ `4336602` |
| **#41** logout / 401 | Partial CONFIRMED (Bearer, secure-store via #89, Login/Forgot/Terms, signOut+clearCredentials). **Named unwaived divergences / unknown later decision:** no full DB wipe on sign-out (`accountSession.ts`); 401 → soft reauth banner (`HomeScreen` / `hrefs.reauth`), not auto wipe→Login. **Not** an invented new bug | coverage #41; PR [#46](https://github.com/eten-tech-foundation/fluent-mobile/pull/46) |
| Sync automation | Stage_D Maestro **PASS ~61s**; cause **unisolated**; Stage_B FAIL **historical** | `inventory/sync721-maestro-correction-receipt.md` |
| PFO / Privacy / Terms | Local PASS ~52s / ~32s / ~31s; Timing **completed** | `docs/assessments/maestro-*-existing-session/README.md` |
| Stage queue | Still deferred | `src/services/stageAdvance.ts:8-40` |
| Claim slice | #611 via PR #667; parent #271 open | `chapterClaimSync.ts` |
| Mic permission | `src/audio/micPermission.ts:12-33` | coverage #49 |
| Scrub/remux **code** | On HEAD after #176/#233 → PR #252/#254 | `ensureSeekableTakeUri.ts`; `modules/aac-remux` |
| **#176** device QA | Code delivered; PR #252 said do not auto-close until Android remux+scrub QA — issue closed on merge; **explicit Android QA-before-close evidence missing** in accepted row | coverage #176; [PR #252](https://github.com/eten-tech-foundation/fluent-mobile/pull/252) |
| **#599** upload crash | Issue **OPEN**; mitigations present (`UploadSyncForegroundModule.kt`, `uploadOrchestratorCore.ts` session guard) ≠ closed; Dev historical; **current QA unproven** | coverage #599 |
| Cached account | user**10** / `qa+fluentqa-translator@fluent.local` only | Sync/PFO/Privacy/Terms receipts |
| **#109** optional `env.ts` | Optional `src/config/env.ts` **absent by design (unimplemented optional AC)** — **valid absence citation**, not a broken path cite. Shipped: `apiBaseUrl.ts`, `types/env.d.ts`, `test/env.ts` | coverage #109 |

---

## Changed requirements (HISTORICAL waiver → later delivery)

| Original | Later delivery | Classification |
| --- | --- | --- |
| #49 scrub deferred ([PR #158 comment](https://github.com/eten-tech-foundation/fluent-mobile/pull/158#issuecomment-4936939274)) | #176 + #233 via [PR #252](https://github.com/eten-tech-foundation/fluent-mobile/pull/252) / [PR #254](https://github.com/eten-tech-foundation/fluent-mobile/pull/254) | HISTORICAL waiver — **not** still-open #49 AC; **#176 QA-before-close still a live evidence gap** |
| Source dock stub era | #235 via [PR #449](https://github.com/eten-tech-foundation/fluent-mobile/pull/449) | HISTORICAL stub — closed |
| Claim-before-upload slice | #611 via [PR #667](https://github.com/eten-tech-foundation/fluent-mobile/pull/667) | Slice closed; parent #271 **still open** |

---

## Open requirements and bugs

Open status alone is **not** “unimplemented.” `Type` is from the accepted ledger row / cites only.

| ID | Type | Gap | Cite |
| --- | --- | --- | --- |
| **#257** | known_unimplemented + launch decision open | Offline stage queue deferred in source | `stageAdvance.ts:8-40`; [eng note](https://github.com/eten-tech-foundation/fluent-mobile/issues/257#issuecomment-5273627839) |
| **#271** | open_parent_remainder | Reconnect claim remainder after #611 slice | Issue open; slice #611 / PR #667 |
| **#599** | OPEN_BUG / current_QA_unproven | Crash AC open; mitigations in source; cause + current QA unknown (Dev historical only) | coverage #599; `UploadSyncForegroundModule.kt`; `uploadOrchestratorCore.ts` session guard |
| **#505 / #508** | open_AC + source_gap (accepted row) | Observer My Work / offline draft download unmet on HEAD | coverage #505/#508 (r14) |
| **#607** | open_followup + fixture/API seed dep | Claim-pool / seed fixtures | coverage #607 |
| Gallery / sync FR batch (#694–#696, #701, #703, #704, #716 …) | OPEN_followup; source_gap only where accepted row proves | e.g. #694 gallery lacks Waveform suite entries; #701 `selectRecordingTake` local-only — not inferred from open alone | r17 acceptance / coverage |

---

## Named unwaived divergences / unknown later decisions (not invented bugs)

| ID | Finding | Cite |
| --- | --- | --- |
| **#41** | Original logout DB wipe + exact 401→Login vs current per-user retained DB + soft reauth | coverage #41 |
| **#4** | Client lacks role branch — **not** a filtering bug; assignment-meaning unknown | coverage #4 |
| **#109** | Optional central `src/config/env.ts` never shipped | coverage #109 (valid absence) |
| **#176** | Code on HEAD; Android QA-before-close evidence missing despite PR body | coverage #176 |

---

## Product decisions (explicit / open — no inferred PM intent)

| Topic | State | Cite |
| --- | --- | --- |
| #257 launch blocker | TBD with product | [#257 comment](https://github.com/eten-tech-foundation/fluent-mobile/issues/257#issuecomment-5273627839) |
| Grant chrome vs server 403 | Open product decision | Living `roles-and-permissions.md` (read-only) |
| #234 PM Home default tab | Explicitly nonblocking | Issue body; `HomeScreen.tsx:62` |
| #4 Translator “assigned” wording | Unknown: project grant vs chapter-only | API pin + coverage #4 |
| #41 DB-wipe / hard 401→Login | No ticket waive found; current behavior = named divergence / unknown later decision | coverage #41 |

---

## Remaining live evidence gaps

| Gap | Note |
| --- | --- |
| Nightly signoff | **None** claimed |
| **#176** Android remux+scrub QA-before-close | Missing in accepted evidence despite PR #252 wording |
| **#599** current QA | Mitigations in source; crash AC open; Dev historical only |
| SA / SuperAdmin | Candidate `qa+fluentqa-sa@fluent.local` **unverified** — no session/grants |
| translator2 / pm / observer / om | **UNVERIFIED** |
| #721 causal component | settle vs point vs retry **unisolated** |
| Dev audit Fails (#529/#530) | HISTORICAL only |

---

Parent produces visual PDF. This packet is Markdown + JSON only.
