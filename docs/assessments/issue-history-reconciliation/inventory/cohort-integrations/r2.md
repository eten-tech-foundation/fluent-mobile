# Wave-1 review r2 — upload-contract-sync-status

**IDs:** 100, 102, 150, 253  
**Domain:** upload-contract-sync-status  
**Integrator:** bc-da4aa327-d86e-47fc-93c0-d7105af39497  
**recommend_complete:** 4 / 4  
**Write targets only:** `/tmp/fluent-issue-review-r2.json`, `/tmp/fluent-issue-review-r2.md`

Cohort `/tmp/fluent-issue-review-c*.json` used as triage hints only. Evidence from inventory caches, living `docs/guides/recordings-sync-contract.md`, working-tree source, and material PRs/comments.

---

## #100 — Upload worker (`recordingSync.ts`)

**recommend_complete:** true  

Worker AC is implemented in current source (expo-FS, `localFilePath`, status machine, single-flight, `uploadVerseAudio`) and closed via merged PR #223. Live DevQA was an explicit ticket-level waiver — source/current ≠ deployed QA proof.

| Field | Evidence |
| --- | --- |
| Requirement | Issue AC: expo-FS + `getApiBaseUrl`; read `local_file_path`; `pending→uploading→uploaded\|failed`; token param; single-flight; retries; tests |
| Disposition | `AGREED_REQUIREMENT`, `LATEST_EXPLICIT_DECISION` (waivers 2026-07-20), `CONFIRMED_CURRENT_SOURCE`, `SHIPPING_MAIN_VS_QA` |
| Code/docs | `src/services/recordingSync.ts:1-2,93-99,213-271,500-516,561-564`; living contract §#100 |
| Material PR | https://github.com/eten-tech-foundation/fluent-mobile/pull/223 — Closes #100; worker + `registerRecordingUploadWorker`; no R2 `/recordings/sync` |

---

## #102 — Server contract freeze

**recommend_complete:** true  

Original `POST /recordings/sync`+#188 AC was superseded by an explicit 2026-07-20 freeze to `PUT /verse-audio` (PR #222); current source and living `recordings-sync-contract.md` match that later decision. Secrets-server-side remains AGREED; live DevQA was waived, not proven.

| Field | Evidence |
| --- | --- |
| Requirement | Body AC (POST `/recordings/sync`+#188) **vs** later freeze comment → `#224` PUT `/verse-audio`; secrets server-side; live e2e waived |
| Disposition | `LATEST_EXPLICIT_DECISION`, `AGREED_REQUIREMENT` (secrets), `CONFIRMED_CURRENT_SOURCE`, `SHIPPING_MAIN_VS_QA` |
| Code/docs | `verseAudioFormData.ts:142-147`; `api.ts:149-164,312-320`; `verseAudioContract.ts:32-37,49-75`; `docs/guides/recordings-sync-contract.md:8-16,64-71` |
| Material PR | https://github.com/eten-tech-foundation/fluent-mobile/pull/222 — Closes #102; freezes to `#224`, not `#188` |

---

## #150 — Upload trigger / sync engine

**recommend_complete:** true  

Engine AC closed with explicit decision (PR #223 path; #213 unmerged) and SyncScreen glue deferred to #253; current orchestrator source matches the matrix. Chad’s 2026-09-04 Dev report disputes observed auto-upload — unresolved historical Dev evidence, not Nightly QA confirmation.

| Field | Evidence |
| --- | --- |
| Requirement | Online=`/health`; Wi‑Fi auto-upload; cellular gate; mid-drop pause/resume; cancel vs next reachability; 24h pause + Sync Now; chapter granularity; no UI |
| Disposition | `AGREED_REQUIREMENT`, `LATEST_EXPLICIT_DECISION` (close→#253), `CONFIRMED_CURRENT_SOURCE`, `HISTORICAL_DEVICE_EVIDENCE` (Chad 2026-09-04), `SHIPPING_MAIN_VS_QA` |
| Code/docs | `connectivity.ts:25-43,56`; `uploadOrchestratorCore.ts:9,290-314,588-625`; `uploadOrchestrator.ts:57-61,122-136` |
| Material decision | https://github.com/eten-tech-foundation/fluent-mobile/issues/150#issuecomment-5062155739 — engine complete via #223; UI→#253. Also PR #213 closed unmerged. |

---

## #253 — SyncScreen ↔ orchestrator wiring

**recommend_complete:** true  

SyncScreen control glue AC is implemented (`useUploadSessionState`→orchestrator; `TODO(#150)` gone) and closed via merged PR #297 with Resume documented as Sync Now alias. Orthogonal Home Sync navigation (#721) was not treated as in-scope for this wiring ticket.

| Field | Evidence |
| --- | --- |
| Requirement | Wire Pause/Cancel/Sync Now/Resume + snapshot; remove `TODO(#150)` mocks; tests |
| Disposition | `AGREED_REQUIREMENT`, `LATEST_EXPLICIT_DECISION` (PR #297 Resume=Sync Now), `CONFIRMED_CURRENT_SOURCE`, `SHIPPING_MAIN_VS_QA` |
| Code/docs | `useUploadSessionState.ts:161-175`; `SyncScreen.tsx:79-98,163-186`; `SyncScreen.test.tsx:256-335`; no `TODO(#150)` under `src/` |
| Material PR | https://github.com/eten-tech-foundation/fluent-mobile/pull/297 — Closes #253; device demo of control wiring; 404 until API deploy ≠ wiring failure |

---

## Counts

| Metric | Value |
| --- | --- |
| Issues reviewed | 4 |
| `recommend_complete=true` | 4 |
| `recommend_complete=false` | 0 |
