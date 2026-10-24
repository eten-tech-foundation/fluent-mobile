# Parallel fixture prep — D-0594-01 + D-0048-01

**Supervisor:** `bc-aa90e150` · **Local write:** 2026-10-23  
**Mode:** read-only inventory — no live credentialed API calls, no device mutation, no fabrication.

**Evidence roots consulted**

- `docs/assessments/maestro-acceptance-coverage/` (FAST_TRACK_QUEUE, coverage, evidence-reconciliation, supervisor packets)
- `/Users/matt/Documents/Codex/2026-10-19/task-10/artifacts/` (issue-history reconciliation, downloaded-metadata check, D0235, d0048-pr-751)

---

## Disposition (Matt decision)

| ID | Status | Latest known fixture state | Exact next decision for Matt |
|---|---|---|---|
| **D-0594-01** | `data_blocked` | QA `image2788` (project12 English 1PE1:1) still returns only `id` / `localizedName` / `title` / `url`; `caption`, `attribution`, `thumbnailUrl` **ABSENT** (observed 2026-10-23). API PR435 merged ≠ populated Aquifer/deploy proof. | **A)** Name/provide a nonempty caption+attribution(+thumbnailUrl) fixture or confirm deploy that populates them, **or** **B)** accept honest **BLOCKED** for missing populated metadata. |
| **D-0048-01** | `fixture_blocked` | No authoritative chapter id with nonempty `verseTimestamps` + playable source for simultaneous selected vs playing. Cached MAT1 sidecar still `verseTimestamps` count 0. PR751 merged (a11y) does not close E2E. | **A)** Name authoritative `verseTimestamps` fixture (project / book-chapter / bible) with nonempty timestamps, **or** **B)** accept honest **BLOCKED**. |

Do not assign runtime for either ID until Matt picks A or B.

---

## D-0594-01 — image caption / attribution / thumbnail

### Criterion

Images & Maps: when metadata is present, mobile must render caption + attribution and prefer `thumbnailUrl` for list preview (fullscreen keeps `url`). Source: fluent-mobile#594.

### What is already landed (not the blocker)

| Layer | Evidence |
|---|---|
| Mobile mapper/UI | PR678 merged 2026-10-14 (`parseTranslationImageItem` + thumbnail preview) |
| API optional schema | fluent-api PR435 merged 2026-10-21 — optional `caption` / `attribution` / `licenseInfo` pass-through; never fabricate |
| Viewer chrome (partial) | Fullscreen open/title/close retained separately; does **not** close #594 caption/attribution AC |

### Latest image2788 metadata state

| Fact | Source |
|---|---|
| Target image | `id: 2788`, title `Göreme Valley In Cappadocia` |
| Request | `GET /projects/12/translation-resources/images/1PE/1/1?languageCode=eng` (English sourceLanguageId 5) |
| Observed fields | `id`, `localizedName`, `title`, `url` |
| Absent fields | `caption`, `attribution`, `thumbnailUrl` |
| Observation time | `2026-10-23T01:58:11.110081+00:00` |
| Provenance | Parent-verified authenticated Chrome extension response (browser task `01a164b0-…`); recorded in `FAST_TRACK_QUEUE.json` / `coverage.json` `prerequisite_evidence_updates` |
| Upgrade vs older manifest | Earlier `.maestro/fixtures/b-image2788-metadata.manifest.json` used `UNKNOWN_NOT_OBSERVED` / nulls — that stance is superseded for **this exact QA response** by ABSENT (still not a cause claim) |

### What remains unproven

- Deployed API revision containing PR435 vs mere merge
- Whether Aquifer content for 2788 (or any other image) ever emits nonempty caption/attribution strings vs only `licenseInfo`
- Any alternate known-nonempty metadata oracle on cached accounts 10/9/12
- Mobile UI rendering of those fields (runtime not admitted)

### Explicit non-actions (retained)

- Stop hunting PM/browser resource-authoring routes (none found)
- Do not treat PNG bytes / title-only UI as caption proof
- Do not fabricate metadata or claim PASS from unit mock pass-through

### Exact ask for Matt

1. **Populated fixture path:** identify a project/image with nonempty `caption` and `attribution` (and `thumbnailUrl` if available) on a deployed QA API Matt authorizes for a later runtime pass; **or**
2. **Accept BLOCKED:** close D-0594-01 as blocked on missing Aquifer/populated metadata (API merge alone insufficient).

---

## D-0048-01 — selected vs currently-playing (`verseTimestamps`)

### Criterion

Bible tab: when a verse is selected and source audio is playing a **different** unit, selected and currently-playing visual states must be distinguishable. Requires natural playing advance via `verseTimestamps` (not manufactured by tapping another row, which couples select+scrub).

### What is already landed / retained

| Item | Status |
|---|---|
| Selected vs playing **styles** in `BibleTab` | Present in source (`rowSelected` / `rowPlaying`) |
| D-0048-02 (tap selects without autoplay) | **PASS retained** — separate criterion |
| Playing a11y labels | **PR751 MERGED** 2026-10-21 (`c37f3bf2`) — appends `, playing` to verse `accessibilityLabel`. Ledger text saying “RFR / unpublished” is **stale**. Still not live dual-state E2E without timestamps. |
| fluent-api#374 (parse DBL clock timecodes) | Closed via PR380 merged 2026-10-14 — unblocks parsing when provider supplies clock strings; **does not** attest a QA chapter with nonempty timestamps |

### Latest verseTimestamps fixture availability

| Fact | Source |
|---|---|
| Fixture id | `NOT_YET_IDENTIFIED` (`no-device-inventory-20261023.json`) |
| Best-studied chapter | project12 / assignment 1183 / 1PE 1 / bibleId 178 / user11 — sourceReadyPaused, Play enabled, UI “WEB Source Audio” |
| Timestamps on that path | Absent / empty — cached public source metadata has no usable `verseTimestamps` array (`d0048-auto/result.json` 2026-10-21) |
| Engine gate | `useSourceAudio` 250ms playing poll skipped when `!verseTimestamps?.length` → selected and playing stay coupled without timestamps |
| Offline sidecar sample | project13 MAT1 `source-audio-meta`: provider DBL, fields bible/bookCode/chapter/dblAudioBibleId/format/provider — **no** `verseTimestamps` (`downloaded-metadata-fixture-check-20261021.md`; D0235 RESULT 2026-10-22 still count 0) |
| D0595 runtime | `verseTimestamps` absent — no seek claim (`d0595-approved-runtime-…/manual-ready-result-copy.md`) |

### What remains unproven

- Any launch/QA project+chapter whose live `GET …/source-audio/{book}/{chapter}` returns nonempty advancing `startSeconds`
- Whether absence is provider (DBL/Aquifer) empty timecodes vs undeployed parser vs bible mismatch (WEB label ≠ provider proof)
- Live dual-state Maestro assertion (selected ≠ playing) on a served build

### Explicit non-actions (retained)

- Do not claim PASS from styles, unit tests, or PR751 a11y alone
- Do not invent independence by tapping a second verse row
- Do not attach public BSB timing files until exact paired narration identity is established
- Do not re-run empty-metadata hunts as substitute for Matt naming a fixture

### Exact ask for Matt

1. **Populated fixture path:** name authoritative `verseTimestamps` fixture — project id, book/chapter, source bible — known to return nonempty timestamps with playable audio so selected vs currently-playing can diverge; **or**
2. **Accept BLOCKED:** keep D-0048-01 blocked pending that fixture (D-0048-02 PASS remains).

---

## Cross-links (supervisor packet)

| Doc | Role |
|---|---|
| `../FIXTURE-PREP-PARALLEL.md` | Short parallel summary (same blockers) |
| `../DEVICE-READY-AND-APPROVAL-REQUEST.md` | Explicit non-goal: no D-0594 / D-0048 runtime in C0604 packet |
| `../run-manifest.json` | Decision still needed: “D0594 populated image metadata or accept BLOCKED” |
| `../../supervisor-bc-1c87660e-20261023/no-device-inventory-20261023.json` | Prior prep inventory (`data_blocked` / `fixture_blocked`) |

---

## Constraints honored this pass

- No credentialed live API probes
- No adb / Maestro / account / network / recording mutations
- No fabricated caption, attribution, or timestamp values
- No PASS/promotion inferred from merges alone
