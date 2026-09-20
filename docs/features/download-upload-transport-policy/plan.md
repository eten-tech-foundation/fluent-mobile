# Plan — #546 Download/upload transport policy

**Slug:** `download-upload-transport-policy`  
**Live run (2026-09-20):** Resumed from dry-run; **Option A** (ethernet unmetered without toggle). `other` NetInfo types still require the cellular toggle.  
**Objective:** One transport policy for upload and download: Wi‑Fi-only by default, `uploadOverCellular` toggle applies to **both**; download `start`, `resume`, and auto-resume use the same gate as `transportAllowsUpload`; when upload and download disagree, Sync / Prepare-for-offline copy explains why.  
**Evidence base:** `docs/features/download-upload-transport-policy/exploration.md`  
**Issue:** [#546](https://github.com/eten-tech-foundation/fluent-mobile/issues/546)  
**Suggested order:** After #548; before or in parallel with #545. #545 should import `transportPolicy` if this lands first.

---

## Scope contract

Use this section at PR review time. **Implement only what is in “Mandatory”; do not touch “Forbidden”.**

### Mandatory (issue AC — must ship)

- [ ] **Document** transport policy in PR description (Step 0: ethernet Option A or B).
- [ ] **Implement** shared gate module; upload orchestrator imports it (behavior-preserving for upload first, then download).
- [ ] Download `start`, `resume`, and auto-resume use the same policy as upload (`transportAllowsTransfer` tri-state).
- [ ] When upload or download is blocked by transport, Sync page and Prepare-for-offline show explaining copy.
- [ ] Unit tests: wifi / cellular+toggle off / cellular+toggle on / ethernet-like / offline (`transportPolicy.test.ts` + download path tests).

**Issue AC3 clarification:** Issue says "If Sync Now is blocked by transport while downloads are allowed **(or vice versa)**, Sync / Prepare-for-Offline copy explains why." After this ticket, **both use the same policy** — there is no "vice versa" in the final state (only during phased PR implementation, if any). PR description should confirm: "Unified policy eliminates upload-blocked-download-allowed asymmetry; explaining copy is symmetric."

### Forbidden (do not implement in #546 PR)

| If you are about to… | It belongs to |
|----------------------|---------------|
| Align `getPendingUploadCount` / unuploadable pending / pericope | **#545** |
| Read or display `upload_error` on Sync page | **#548** |
| Fix `deriveSyncPageStatus` → false `uploadComplete` when pending remain | **#545** (see below) |
| Disable Sync Now when offline (UI-only gap today) | **#545** |
| Abort in-flight upload/download on Wi‑Fi→cellular flip | Out of scope (issue) |
| Change `sync.ts` metadata pull policy | Out of scope (issue) |

### Pre-implementation decisions (block PR until documented)

| Decision | Options | Default |
|----------|---------|---------|
| Ethernet / unmetered | **A:** `wifi \|\| ethernet` allows without toggle · **B:** only `wifi` | **A** (matches Chad report: downloads worked on non-wifi online) |
| Blocked download UX | Toast vs inline banner on Prepare-for-offline | Inline or toast — must match Sync hint tone |
| Mid-session transport change | — | **No abort** in v1 (exploration item 5) |

### Done when (verify before merge)

1. Cellular, toggle off → Sync Now blocked **and** Prepare-for-offline download blocked, with message (both blocked = no "vice versa" state).
2. Cellular, toggle on → upload and download both allowed.
3. Wi‑Fi → both allowed (toggle irrelevant).
4. Offline → both blocked with clear copy.
5. `grep` in PR: no stray `isOnline && isWifi` outside `transportPolicy.ts` (except tests documenting old behavior if needed).
6. PR does **not** change `deriveSyncPageStatus`, pending queries, or `upload_error` read path.
7. PR description confirms: "Issue AC3 'or vice versa' resolved — unified policy means upload and download always agree on transport gate; explaining copy is symmetric (not conditional on which is blocked)."

### PR checklist

```
[ ] Step 0 product decision (ethernet A/B) in PR description
[ ] Every GitHub issue AC checkbox mapped to code + test
[ ] uploadOrchestrator.test.ts:147-155 and SyncScreen.test.tsx:228 still green
[ ] No #545 / #548 files in diff unless importing transportPolicy from #546 into a follow-up branch
```

---

## AC mapping → files

| AC | Behavior | Primary files | Tests |
|----|----------|---------------|-------|
| **Unified policy** | Extract shared gate; upload orchestrator imports it | `src/utils/transportPolicy.ts` (new), `uploadOrchestratorCore.ts` | `transportPolicy.test.ts` (new), `uploadOrchestrator.test.ts` (keep green) |
| **Download gates** | `start`, `resume`, auto-resume honor same policy | `useDownloadQueue.ts`, `downloadQueueAutoResume.ts`, `usePrepareOfflineDownload.ts` | `useDownloadQueue.test.ts` (new), `downloadQueueAutoResume.test.ts` |
| **Explaining copy** | When blocked, Sync / Prepare-for-offline surfaces reason | `SyncScreen.tsx`, `PrepareForOfflineScreen.tsx` or download footer hooks, `constants/messages.ts` | component tests |
| **Unit tests** | wifi / cellular+toggle / ethernet-like / offline | `transportPolicy.test.ts` | |

---

## Terrain

- **Asymmetry table (today):**

| Path | Gate |
|------|------|
| Upload / Sync Now | `transportAllowsUpload` + `cellularBlocked` |
| Download `start` | None |
| Download `resume` / auto-resume | `isOnline && isWifi` only |

- **Six duplicate predicates** to collapse: `uploadOrchestratorCore.ts:56`, `useDownloadQueue.ts:285`, `downloadQueueAutoResume.ts:13`, `SyncScreen.tsx:58`, `useSyncStatus.ts:29`, `prepareOfflineTrigger.ts:19`.
- **Settings already lie gently:** “Upload/Download over cellular” (`SyncScreen.tsx:191`) — this ticket makes it true.

---

## Implementation sequence

### 0. Product decision (document in PR)

**Recommended:** `transportAllowsTransfer(isOnline, isWifi, isCellular, uploadOverCellular)` returns same tri-state as upload today, with explicit ethernet handling:

- Option A: `isWifi || type === 'ethernet'` counts as unmetered (allow without toggle).
- Option B: only `isWifi` (status quo for upload); ethernet needs toggle.

Pick A unless product objects — matches “downloads worked on Chad’s ethernet/hotspot” reports better.

### 1. Extract shared helper (TDD)

1. Create `src/utils/transportPolicy.ts`:
   - `transportAllowsTransfer(...): 'ok' | 'offline' | 'waiting_wifi'`
   - `isEffectivelyOnlineForTransfer(...): boolean` (for status chrome)
   - `isTransportBlockedForTransfer(...): boolean` (for disabling actions)
2. Migrate `uploadOrchestratorCore.ts` to import (no behavior change first).
3. Tests: offline; wifi; cellular toggle off/on; ethernet; `other` NetInfo type.

### 2. Apply to download paths

1. `useDownloadQueue.start` — if gate !== `'ok'`, log + return early (optionally set paused reason); do not call `worker.start`.
2. `useDownloadQueue.resume` — replace `isOnline && isWifi` with shared gate.
3. `downloadQueueAutoResume` — same gate; subscribe to pref changes (mirror upload orchestrator).
4. `usePrepareOfflineDownload.handleDownload` — check gate before `start`; show toast or inline message if blocked.

### 3. Align UI copy + status

1. Replace `cellularBlocked` / `effectivelyOnline` in `SyncScreen.tsx` with shared helpers.
2. Align `useSyncStatus.ts`, `prepareOfflineTrigger.ts`, `HomeScreen.tsx` eligible connection (single import).
3. Prepare-for-offline: when download blocked, footer or banner explains (reuse messages from Sync cellular hint where possible).

> **Not in #546:** `deriveSyncPageStatus` false `uploadComplete` when pending remain → **#545** only (`deriveSyncPageStatus.ts:29-30`).

### 4. Tests

1. `transportPolicy.test.ts` — matrix per AC.
2. `useDownloadQueue.test.ts` — `start` skipped on cellular without toggle; allowed with toggle.
3. `downloadQueueAutoResume.test.ts` — update: resume on cellular **with** toggle.
4. Keep `uploadOrchestrator.test.ts:147-155`, `SyncScreen.test.tsx:228` green.

---

## Out of scope

- Sync Now silent no-op / pending count mismatch (#545).
- `upload_error` display (#548).
- Aborting in-flight transfers on transport change.
- `sync.ts` metadata pull policy.
- iOS (Android-only app).

---

## Risks

| Risk | Mitigation |
|------|------------|
| Users lose cellular download ability they had via `start()` | Intended; copy explains; toggle enables |
| Ethernet regression if Option B | Document; prefer Option A |
| Partial migration leaves drift | Single module; grep for old patterns in PR |
| Auto-resume race on rapid connectivity flips | Match upload `evaluateChain` pattern if needed |

---

## Validation

**Local gates (live run):** full npm gate suite.

**Manual device flow:**
1. Cellular, toggle off — Sync Now blocked; Prepare-for-offline download blocked with message.
2. Cellular, toggle on — both upload and download allowed.
3. Wi‑Fi — both allowed (toggle irrelevant).
4. Offline — both blocked with clear copy.
5. Ethernet (if available) — verify chosen Option A/B behavior.

---

## Next live run (without `dry-run`)

- [ ] Branch `jonathanseehagen/fix/546-download-upload-transport-policy` from clean `main`.
- [ ] Step 0 product note in PR description.
- [ ] Implement steps 1–4; run gates + code-reviewer.
- [ ] Device QA matrix above.

**Suggested order vs #545:** #546 can land independently; #545 transport feedback should import shared helper if #546 lands first.
