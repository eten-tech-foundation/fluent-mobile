# Exploration — #546 Download/upload transport policy asymmetry

**Slug:** `download-upload-transport-policy`  
**Issue:** [#546](https://github.com/eten-tech-foundation/fluent-mobile/issues/546)  
**Dry-run:** 2026-09-17 (recon VOCABULARY / TRACE / PRECEDENT / ADVERSARIAL)  
**Would-be branch:** `jonathanseehagen/fix/546-download-upload-transport-policy` (not created; dirty tree + dry-run)  
**Related:** #545 (Sync Now silent no-op — separate); settings label already says “Upload/**Download** over cellular” (`SyncScreen.tsx:191`) but downloads ignore it.

---

## Vocabulary

**1. `isOnline`** — server reachable via `/health`, not raw NetInfo connected (`connectivity.ts:46-54`, `60-61`). Test: `connectivity.test.ts`.

**2. `isWifi` / `isCellular`** — `NetInfo.type === 'wifi'` / `'cellular'` (`connectivity.ts:63-64`). **Ethernet/other:** both false — treated like non-Wi‑Fi for upload gate (`uploadOrchestratorCore.ts:64-65`).

**3. `uploadOverCellular`** — user pref `pref_upload_over_cellular`, default `false` (`userPreferences.ts:3-4`, `11-12`). Toggle on Sync + Settings (`SyncScreen.tsx:188-194`, `SettingsScreen.tsx:48`).

**4. `transportAllowsUpload`** — private helper (`uploadOrchestratorCore.ts:56-68`): offline → `'offline'`; online + `!isWifi && !uploadOverCellular` → `'waiting_wifi'`; else `'ok'`. Used in `runSession` and `evaluateAuto` (`uploadOrchestratorCore.ts:129-142`, `215-242`).

**5. `cellularBlocked` (Sync UI)** — `isOnline && !isWifi && !uploadOverCellular` (`SyncScreen.tsx:59`). Disables Sync Now (`SyncScreen.tsx:169`). **Confused with** `effectivelyOnline` (`SyncScreen.tsx:58`) used only for status chrome.

**6. Download `start()`** — `useDownloadQueue.start` (`useDownloadQueue.ts:243-263`): marks projects started, calls worker — **no transport check**. Invoked from Prepare-for-offline (`usePrepareOfflineDownload.ts:452`).

**7. Download `resume()`** — requires `isOnline && isWifi` only (`useDownloadQueue.ts:284-293`); **ignores** `uploadOverCellular`. Worker-paused path resumes without gate (`useDownloadQueue.ts:276-281`).

**8. `downloadQueueAutoResume`** — on connectivity change: `isOnline && isWifi` only (`downloadQueueAutoResume.ts:11-15`); calls `worker.start(resumable)` (`downloadQueueAutoResume.ts:38-41`). Registered at auth boot (`AuthSessionProvider.tsx:29-31`).

**9. Duplicated “eligible connection”** — `prepareOfflineTrigger.ts:19-20`, `HomeScreen.tsx:180-183`, `useSyncStatus.ts:29` — similar but not identical (`isCellular` check varies).

---

## How upload cellular block works today (TRACE analog)

Analog = **Sync Now blocked on cellular without toggle** — the policy download should match.

1. **NetInfo** → `getConnectivitySnapshot` (`connectivity.ts:56-65`); `useConnectivity` refetches on focus (`useConnectivity.ts:44-58`).
2. **Pref** — `getUploadOverCellular` wired into orchestrator (`uploadOrchestrator.ts:62-64`).
3. **SyncScreen** — `cellularBlocked` disables button + early return (`SyncScreen.tsx:59`, `68-70`, `169`). Test: `SyncScreen.test.tsx:228-236`.
4. **Hint** — `SyncActionControls` shows cellular message (`SyncActionControls.tsx:101-107`). Test: `SyncActionControls.test.tsx:68-77`.
5. **Orchestrator** — `transportAllowsUpload` → `'waiting_wifi'`; auto path emits event (`uploadOrchestratorCore.ts:238-241`). Test: `uploadOrchestrator.test.ts:147-155`.
6. **Pref flip** — re-evaluates auto-upload (`uploadOrchestratorCore.ts:287-289`).

**Download contrast:** `start()` never checks; `resume()` / auto-resume hard-require Wi‑Fi regardless of toggle.

---

## Existing code to reuse (PRECEDENT)

| Concern | Verdict | Evidence |
|---------|---------|----------|
| Upload gate logic | **Extend → extract** | `uploadOrchestratorCore.ts:56-68` → shared `transportAllowsTransfer` |
| Connectivity | **Reuse** | `connectivity.ts`, `useConnectivity.ts` |
| Cellular pref | **Reuse** | `userPreferences.ts`, `usePreferences.ts` |
| Sync UI block | **Extend** | `SyncScreen.tsx:58-59`, `SyncActionControls.tsx` |
| Download queue | **Extend** | `useDownloadQueue.ts:243-293`, `downloadQueueAutoResume.ts` |
| Prepare offline | **Extend** | `usePrepareOfflineDownload.ts:452`, `PrepareForOfflineScreen.tsx:28` (add transport copy) |
| Global status | **Extend** | `useSyncStatus.ts:29`, `syncStatusState.ts` |
| Prepare-offline prompt | **Resemble** | `prepareOfflineTrigger.ts:19-20` — align with shared helper |
| Download progress UI | **Resemble** | `DownloadProgressSection.tsx` — no blocked state today |

**Gap:** No shared module; six copy-pasted predicates; UI label promises download respects toggle but code does not.

---

## Open questions (incl. adversarial)

| # | Finding | Resolution in plan |
|---|---------|-------------------|
| 1 | Download `start()` bypasses all gates | Apply shared gate before `worker.start` |
| 2 | `resume()` blocks cellular even when toggle on | Replace `isOnline && isWifi` with shared helper |
| 3 | Auto-resume ignores pref; no pref listener on download path | Subscribe like upload (`uploadOrchestratorCore.ts:287-289`) |
| 4 | Ethernet: `isWifi=false` — blocked unless toggle; `prepareOfflineTrigger` uses `isCellular` only | **Product call:** treat ethernet as Wi‑Fi-equivalent OR require toggle; document in plan step 0 |
| 5 | Mid-session Wi‑Fi→cellular: upload continues; download worker ungated | **Out of scope** v1 — only gate start/resume/auto-resume |
| 6 | `deriveSyncPageStatus` maps `waiting_wifi` → `uploadComplete` (`deriveSyncPageStatus.ts:29-30`) | Fix when unifying — blocked transport ≠ complete |
| 7 | `sync.ts` metadata sync online-only, no Wi‑Fi gate | **Out of scope** — metadata vs bulk transfer |
| 8 | No `useDownloadQueue` transport tests | Add per AC |

**Uncertain:** Whether in-flight downloads should abort on cellular (uploads don’t abort Wi‑Fi→cellular today). Whether queued-but-blocked downloads need visible “waiting for Wi‑Fi” in Prepare-for-offline UI.
