# Pericope View Audit

> **Status: device run complete; gaps not filed yet.** Six gaps are
> confirmed (five on device, one from code). GitHub issues are pending
> approval.

## Overview

**Feature:** Verse/Pericope drafting unit — Settings toggle, Bible tab pericope
cards and source-audio caption, Record tab pericope title/navigation/source
text, pericope capture and cross-granularity take labels, stitched playback,
pericope-mode chapter advancement, and pericope boundary data (bundled sets)  
**Auditor:** Jonathan Seehagen (`@JonathanSeehagen`)  
**Date tested:** 2026-09-24 – 2026-09-25  
**Build/version:** Local run of merged `main` @ `4ebeae2` (`expo-dev-client` + Metro)  
**Environment:** Dev — `dev.api.fluent.bible`; Local — fluent-api `main` @ `acc1404` (Genesis, Exodus)  
**Device and OS:** Xiaomi Redmi Note 9 Pro, Android 10 (API 29), physical device  
**Audit sub-issue:** [#534](https://github.com/eten-tech-foundation/fluent-mobile/issues/534) (epic [#526](https://github.com/eten-tech-foundation/fluent-mobile/issues/526))

## Related Issues

Product specs (source of expected behavior):

- [#407](https://github.com/eten-tech-foundation/fluent-mobile/issues/407) — Add Verse/Pericope toggle to mobile Settings (Closed; PR #434)
- [#408](https://github.com/eten-tech-foundation/fluent-mobile/issues/408) — Update Bible tab for Verse/Pericope toggle (Open; PRs #535, #541 merged; QA found source-audio scrub restarts)
- [#409](https://github.com/eten-tech-foundation/fluent-mobile/issues/409) — Update Record tab for Verse/Pericope toggle (Closed; PR #467)
- [#410](https://github.com/eten-tech-foundation/fluent-mobile/issues/410) — Mixed-mode recording with cross-granularity take labels (Open, passed QA; PR #473)
- [#411](https://github.com/eten-tech-foundation/fluent-mobile/issues/411) — Cross-granularity playback with stitching (Open, passed QA; PR #506)
- [#542](https://github.com/eten-tech-foundation/fluent-mobile/issues/542) — Chapter advancement requires every verse/pericope recorded (Closed; PR #550)

Engineering / data:

- [#438](https://github.com/eten-tech-foundation/fluent-mobile/issues/438) — Sync pericope boundaries to local SQLite, set-level hybrid (Closed; PR #445)
- [#447](https://github.com/eten-tech-foundation/fluent-mobile/issues/447) — Bundle FIA/FCBH pericope set JSON in the APK (Closed; PR #450)
- [fluent-api#309](https://github.com/eten-tech-foundation/fluent-api/issues/309) — `GET /pericope-sets/{id}` with ETag (Open; implemented on fluent-api `main` in fluent-api PR #345, 2026-09-22)
- [#412](https://github.com/eten-tech-foundation/fluent-mobile/issues/412) — Source audio player for the Bible tab (Closed; PR #455)

Bug fixes and regressions:

- [#540](https://github.com/eten-tech-foundation/fluent-mobile/issues/540) — Pericope Next/Previous navigation and full source text (Closed; PR #543)
- [#474](https://github.com/eten-tech-foundation/fluent-mobile/issues/474) — Pericope take subtitle truncation (Closed as opened by mistake)
- [#544](https://github.com/eten-tech-foundation/fluent-mobile/issues/544) — Draft waveform scrubbing restarts instead of seeking (Open)
- [#564](https://github.com/eten-tech-foundation/fluent-mobile/issues/564) — Bible unit tap no longer opens Record (Open; from #527 audit, regression of #408)
- [#571](https://github.com/eten-tech-foundation/fluent-mobile/issues/571) — Stitched take row misaligned (Open; from #528 audit)

Adjacent (owned by sibling audits, listed for cross-reference):

- [#528](https://github.com/eten-tech-foundation/fluent-mobile/issues/528) — Play, record, and re-record audio audit (pericope capture G.27, stitched row G.28)
- [#527](https://github.com/eten-tech-foundation/fluent-mobile/issues/527) — Drafting page audit
- [#529](https://github.com/eten-tech-foundation/fluent-mobile/issues/529) / [#530](https://github.com/eten-tech-foundation/fluent-mobile/issues/530) — Going offline / returning online audits
- [#256](https://github.com/eten-tech-foundation/fluent-mobile/issues/256) — Conflict detection for offline takes (Open)

## Expected Behavior

Consolidated from the specs above. Where a later ticket or a product comment
supersedes an earlier requirement, the later one wins and is noted.

- **Toggle:** Settings has a Verse / Pericope control. The choice immediately
  changes the display unit on the Bible and Record tabs, with no partial
  mixing, and persists per user (#407). #407 also asks to sync the preference
  to the account; engineering deferred that (see Open Questions).
- **Bible tab, pericope mode:** one card per pericope, titled by verse range
  (never "Pericope N"). Recorded pericopes show a green check, partially
  recorded ones an amber loader icon (#408). Toggling re-renders the list and
  re-runs auto-select of the last unrecorded unit (#408; product accepted it
  not working in pericope mode — chadw-eten, 2026-09-18).
- **Source audio:** the caption reads `Pericope N / total` or `Verse N / total`.
  Verse-boundary ticks appear only when the API provides verse timestamps;
  otherwise a plain scrubber (#408). Scrubbing seeks to the chosen position
  (#408 QA; product: "needs to be fixed").
- **Cross-chapter pericopes:** a pericope spanning two chapters appears as a
  card in both chapters, fully interactive from either, and counts only
  toward its starting chapter's progress (#408).
- **Unit tap:** tapping a unit selects it and opens Record (#47, regressed per
  #564).
- **Record tab, pericope mode:** the title is the pericope range, with the
  pericope title as a subtitle when available, and never a "Pericope 1 of 7"
  counter (#409). Next/Previous jump to the adjacent pericope, and the source
  text shows every verse of the pericope (#540). The draft waveform is a
  continuous scrubber without ticks; verse mode keeps verse ticks (#409).
- **Mixed-mode recording:** recording is never blocked by takes at the other
  granularity. Takes are labeled `Take N - Pericope - vv. X-Y` or
  `Take N - Verse - v. X` in either view. A pericope take appears on every
  verse it spans, counts against each verse's 5-take cap, and deleting it
  from one verse removes it everywhere (#410).
- **Stitched playback:** in pericope view, verse takes are stitched into one
  row labeled `Take N - Stitched - vv. X-Y` that uses one slot, cannot be
  deleted, and plays the recorded verses in order and stops when coverage is
  partial (#411). The timer resetting per segment was accepted by product.
- **Chapter advancement:** in pericope mode, the stage-advance CTA appears
  only when every pericope of the chapter has a recording, and only while the
  last pericope is displayed (#542, PR #550).
- **Boundary data:** pericope boundaries come from the project's
  `pericope_set_id`, seeded from the APK-bundled FCBH/FIA sets, with a
  set-level API refresh for other sets or new versions — never one request
  per chapter (#438, #447, fluent-api#309). Works offline once seeded.

## Code Review Notes (pre-device)

Read on `main` @ `4ebeae2`, plus `fluent-api` `main` @ `49929e7` and
`fluent-web` `main` for cross-checks (read-only):

- **Mock data:** none in the pericope path. Bible/Record units come from
  SQLite (`pericope_verses`) seeded from the bundled
  `assets/pericope-sets/FCBH-All-Books.json` and `FIA-All-Books.json`
  (`src/services/pericopeSets.ts`). There are no stubs or placeholder lists.
- **API ready, not wired (epic mock/API rule):** `syncPericopes`
  (`src/services/sync.ts`) hydrates only bundled sets (`FCBH_SET_ID = 1`,
  `FIA_SET_ID = 2`). Any other set logs "blocked on network path
  (fluent-api#309)" and gets no pericope rows. `GET /pericope-sets/{id}` with
  ETag/304 has since landed on fluent-api `main` (PR #345, 2026-09-22), but
  mobile has no `FluentAPI.getPericopeSet`. The doc comment above
  `syncPericopes` still says the step no-ops for every set and points to a
  "#TBD" follow-up that was never filed.
- **Pericope takes never upload:** the upload worker and pending counts only
  take verse takes (`UPLOADABLE_PENDING_WHERE` in `src/db/queries.ts`:
  `IFNULL(r.granularity, 'verse') = 'verse'`, comment "Pericope takes stay
  local until #410"). `getUnuploadablePendingSummary` counts them as
  `pericopeOnly`, and the Sync page shows "N recordings can't upload yet —
  missing bible text or pericope-only takes." fluent-api's verse-audio routes
  are keyed by one `bibleTextId` (`PUT /verse-audio/{projectUnitId}/{bibleTextId}`),
  so there is no API to receive a range take. No mobile or fluent-api issue
  tracks this (searched "pericope upload", "range take", "pericope take",
  "pericope recording").
- **Advancement ignores upload state:** `confirmStageAdvancement`
  (`src/services/stageAdvance.ts`) submits the chapter to the API with no
  check on pending or unuploadable takes. A chapter drafted only with
  pericope takes can therefore move to Peer Check while none of its audio has
  reached the server.
- **Pericope-mode completeness only counts pericope takes:**
  `isChapterFullyRecordedPericopeMode` (`src/db/queries.ts`) requires, for
  every pericope, a selected take whose range equals that pericope exactly.
  Verse takes (the stitched row) do not count. The Bible tab's
  `unitRecordedStatus` (`src/utils/bibleTabUnits.ts`) counts verse coverage,
  so a pericope fully recorded verse-by-verse shows a green check on the
  Bible tab while the Record tab hides the advance CTA.
- **Set without local data:** when the project has a `pericope_set_id` but no
  local rows (unbundled set, or a book missing from the bundle), both tabs
  silently fall back to verse mode (`effectiveUnit` in
  `src/hooks/useBibleTabUnits.ts`; comment in `RecordTab.tsx` "Falls back to
  the verse reference silently"). In that state `isOnLastUnit`
  (`RecordTab.tsx`) requires `activePericope !== null`, which never happens,
  so the stage-advance CTA can never show while Settings says Pericope.
- **Cross-chapter pericope into an unassigned chapter (not reproduced):**
  Bible texts are synced for assigned chapters (`getChaptersToSync`,
  `src/db/repository.ts`), and card bodies (`buildBibleUnits`) render `''`
  for verses with no local text. This suggested a gap, but B.12 showed the
  full text of Exodus 5:22–6:13 with Exodus 6 unassigned, so no ticket was
  filed.
- **Preference not synced to the account:** `setDraftingUnit`
  (`src/services/draftingUnitPreference.ts`) writes a `drafting_unit_dirty`
  flag with no reader (`isDraftingUnitDirty` has no callers). fluent-api
  `/self/settings` has no drafting-unit key (`userSettingsObjectSchema`
  holds only `checkIgnoredWordPairs`), and fluent-web keeps `displayMode` in
  its local app store. Engineering deferred account sync on #408; no ticket
  tracks it.
- **Maestro coverage:** only `.maestro/flows/sync/settings-persistence.yaml`
  touches the toggle. No flow covers pericope cards, pericope navigation,
  pericope capture or stitched playback, so the device script below covers
  the whole feature by hand.

## Test Results

Scenario numbers match the device test script used for this audit
(section letter + step). Statuses: Pass · Fail · Blocked (intended, could not
be executed) · Inconclusive (executed, result unclear) · Skipped
(deliberately not attempted).

The run is split across two environments:

- **Dev** — the cloud dev API (`dev.api.fluent.bible`), all books available.
  Used for UI and local-first behavior that needs no backend inspection.
  Nothing here advances a chapter or otherwise changes shared stage data.
- **Local** — a local fluent-api (`main` at or after `49929e7`, so
  `GET /pericope-sets/{id}` exists) with Genesis and Exodus only. Used for
  scenarios that are verified in the backend database or that need data set
  up on purpose (unassigned neighbor chapter, project without a pericope
  set).

| # | Env | Scenario | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| A.1 | Dev | Settings → Drafting unit | Verse / Pericope control; default Verse (#407) | As expected | Pass |
| A.2 | Dev | Switch to Pericope → kill app → relaunch | Pericope retained (#407) | As expected | Pass |
| A.3 | Dev | Second account on the device | Its own preference (default Verse) (#407) | As expected | Pass |
| B.4 | Dev | Bible tab in pericope mode | Spinner then cards, no verse-row flash; range titles, never "Pericope N" (#408) | As expected | Pass |
| B.5 | Dev | Expand / collapse a card | Expanded: superscript verse numbers, highlighted border; collapsed preview without numbers (#408) | As expected on `4ebeae2`. With PR #573 (fix for #564), tapping the card also opened Record, so a pericope could not be collapsed on the Bible tab (auditor's review on PR #573); PR commit `62389bc` splits the chevron from the card tap, not yet device-tested | Pass |
| B.6 | Dev | Recorded status on cards | Green check (all verses), amber loader (some), none (#408) | As expected | Pass |
| B.7 | Dev | Toggle Verse ↔ Pericope | List re-renders at the new unit; auto-select in pericope mode accepted as not required (#408) | As expected | Pass |
| B.8 | Dev | Source audio caption and ticks | `Pericope N / total`; ticks only with verse timestamps (#408) | Caption `WEB-9879db Source Audio · Pericope 1 / 6`: the label is the project Bible abbreviation from dev data (`bibleAbbreviation`, `SourceAudioShell.tsx`). No source audio with verse timestamps was found, so ticks could not be checked | Pass (caption) · Blocked (ticks) |
| B.9 | Dev | Scrub source audio in pericope mode | Seeks to position, does not restart (#408 QA) | Behavior varied between attempts; the auditor could not tell reliably whether scrubbing seeks or restarts. #408 QA reported the same intermittent restart | Inconclusive |
| B.10 | Dev | Tap a pericope card | Selects it and opens Record (#47, #564) | Tapping a card selects it but does not open Record. Fix in open PR #573, which the auditor confirmed on device | **Fail** → existing #564 |
| B.11 | Dev | Cross-chapter pericope, both chapters assigned | Card in both chapters with full range; interactive from either (#408) | As expected | Pass |
| B.12 | Local | Cross-chapter pericope, other chapter not assigned | Full source text for every verse in the range | New project with Exodus 5 assigned and Exodus 6 not: FIA pericope Exodus 5:22–6:13 shows the full text | Pass |
| C.13 | Dev | Record tab title in pericope mode | Range title + pericope title subtitle (FIA); no "Pericope 1 of 7" (#409) | Range title shown, no counter. No subtitle on Mark 8:31–9:1: in the bundled FIA data only the first part of a split pericope has a title (29a "Jesus is the Messiah and must suffer and die"; 29b is null), and FCBH has no titles. Follows the spec ("when available"); see Open Questions | Pass |
| C.14 | Dev | Next / Previous | Jump pericope to pericope; disabled at chapter bounds (#540) | As expected | Pass |
| C.15 | Dev | Source text in pericope mode | All verses of the pericope (#540) | As expected | Pass |
| C.16 | Dev | Draft waveform | Pericope: continuous, no ticks; Verse: ticks (#409) | No tick marks on the draft waveform in either mode. Pericope mode matches (continuous). Verse-mode ticks were deferred in PR #467 because every verse take is single-verse audio, so there is no boundary to mark; PR #467 said it would become buildable once #410 landed (it has, PR #473), and no follow-up was filed. See Open Questions | Pass |
| D.17 | Dev | Record a pericope take | Label `Take N - Pericope - vv. X-Y`, full range, not truncated (format #410; "never truncated" #411) | Mark 1:1–13 pericope take: the label is cut to `Take N - Pericope - vv. …` on the phone width (`numberOfLines={1}` beside the timer in `DraftTakeRow`) | **Fail** → Candidate 6 |
| D.18 | Dev | Switch to Verse mode | Pericope take on every spanned verse, same label (#410, #411) | As expected | Pass |
| D.19 | Dev | 5-take cap with a shared pericope take | Shared take counts on each verse; Record New Take disabled at 5 (#410) | As expected | Pass |
| D.20 | Dev | Delete the shared take from one verse | Removed from every verse (#410) | As expected | Pass |
| E.21 | Dev | Verse takes viewed in pericope mode | One `Stitched` row, plays in order, no delete (#411) | As expected; the #571 row misalignment was not reported in this run | Pass |
| E.22 | Dev | Partial verse coverage in pericope mode | Plays recorded verses in order and stops; Bible shows amber icon (#408, #411) | As expected | Pass |
| F.23a | Dev | Advance CTA, pericope takes on every pericope (do not tap) | CTA only on the last pericope, once all are recorded (#542) | CTA appears only on the last pericope once every pericope has a take | Pass |
| F.23b | Local | Advance a chapter drafted only with pericope takes | Chapter does not reach Peer Check without its audio on the server | CTA appeared only on the last pericope (matches #542). Exodus 5 advanced; `chapter_assignments.chapter_status = peer_check` with no `verse_audio_recordings` rows for Exodus 5–6 | **Fail** → Candidate 2 |
| F.24 | Dev | Chapter fully recorded verse-by-verse, then pericope mode (do not tap) | Bible shows checks; CTA on last pericope (see Open Questions) | Bible tab shows every pericope as recorded (green check); no advance CTA on the last pericope | **Fail** → Candidate 3 |
| G.25 | Local | Pericope take → Sync page | Take uploads | The take was recorded (the only pending take was a pericope take). Sync header shows "Online · some takes can't upload", red "1 recording can't upload yet — missing bible text or pericope-only takes.", and Sync Now is disabled | **Fail** → Candidate 1 |
| G.26 | Local | Pericope take in the backend database | Audio row exists for the take's verses | No `verse_audio_recordings` rows for Exodus 5–6 | **Fail** → Candidate 1 |
| H.27 | Dev | Airplane mode, pericope mode | Cards, titles, navigation, capture and stitched playback work offline | As expected | Pass |
| H.28 | Dev | Kill and reopen offline in pericope mode | Mode and pericope data retained | As expected | Pass |
| I.29a | Local | Project with `pericope_set_id = NULL` | Clear pericope behavior or a visible explanation; CTA still reachable | Genesis 1 with Settings on Pericope: Bible tab shows verse rows and Record shows a verse reference, with no message explaining that pericopes are unavailable. CTA step not run. Per code, a NULL set uses verse rules for the CTA; the hidden CTA applies only to a set id with no local rows (Code Review Notes) | **Fail** → Candidate 5 |
| I.29b | Local | Project on an unbundled set (id ≠ 1, 2) | Pericopes hydrate from `GET /pericope-sets/{id}` | Not run: needs a fabricated set in the local DB; the gap is established from code (endpoint on fluent-api `acc1404`, no mobile client) | Skipped |

## Offline and Synchronization Results

Pericope boundaries are bundled in the APK and read from SQLite, so the view
itself is local-first. Upload and conflict handling of verse takes belong to
the sibling audits; pericope-take upload is checked here because it is
specific to this feature.

| Scenario | Result | Notes |
|---|---|---|
| Feature used while offline | Pass | H.27 |
| App closed and reopened offline | Pass | H.28 |
| Device returns online | Fail | G.25 — pericope takes stay pending and Sync Now is disabled; verse takes → #530 |
| Offline changes synchronize | Fail | G.25–G.26 — pericope takes never upload (Candidate 1) |
| Conflicting changes are handled | N/A | #256 (open), sibling audits |

## Gaps Identified

Each confirmed gap has a task document under [`tickets/`](./tickets/).
One code-level candidate (cross-chapter text from an unassigned chapter) was
not reproduced on device (B.12) and stays in Code Review Notes. Candidate 4
is confirmed from code under the epic's rule (API ready, mobile not
wired).

Searched for existing issues before drafting (pericope, pericope upload,
range take, pericope take, verse toggle, drafting unit, granularity, stitch,
cross-granularity, mixed-mode).

### Candidate 1: Pericope takes never upload to the server

**Severity:** High (drafted audio stays on the device)  
**Launch blocker:** To be decided with product  
**Related issue:** [#410](https://github.com/eten-tech-foundation/fluent-mobile/issues/410) (API gap noted, no follow-up filed)  
**Development task:** [tickets/upload-pericope-takes.md](./tickets/upload-pericope-takes.md) — tracked in fluent-mobile for now; the fluent-api task (range-take upload) will be opened at implementation time, pending confirmation with the API owner  
**Evidence:** G.25, G.26

### Candidate 2: Chapter can advance while its pericope takes cannot upload

**Severity:** High  
**Launch blocker:** To be decided with product  
**Related issue:** [#542](https://github.com/eten-tech-foundation/fluent-mobile/issues/542)  
**Development task:** [tickets/guard-advance-with-unuploadable-pericope-takes.md](./tickets/guard-advance-with-unuploadable-pericope-takes.md)  
**Evidence:** F.23b, G.25

### Candidate 3: Verse takes do not count toward pericope-mode completeness

**Severity:** Medium  
**Launch blocker:** No  
**Related issue:** [#542](https://github.com/eten-tech-foundation/fluent-mobile/issues/542), [#411](https://github.com/eten-tech-foundation/fluent-mobile/issues/411)  
**Development task:** [tickets/pericope-completeness-counts-verse-takes.md](./tickets/pericope-completeness-counts-verse-takes.md)  
**Evidence:** F.24

### Candidate 4: Mobile does not use the set-level pericope API

**Severity:** Medium (projects on unbundled sets have no pericope view)  
**Launch blocker:** No  
**Related issue:** [#438](https://github.com/eten-tech-foundation/fluent-mobile/issues/438), [fluent-api#309](https://github.com/eten-tech-foundation/fluent-api/issues/309)  
**Development task:** [tickets/wire-pericope-set-api.md](./tickets/wire-pericope-set-api.md)  
**Evidence:** Code Review Notes (API ready, mobile not wired); I.29b

### Candidate 5: Pericope mode without local set data falls back silently

**Severity:** Medium  
**Launch blocker:** No  
**Related issue:** [#409](https://github.com/eten-tech-foundation/fluent-mobile/issues/409), [#542](https://github.com/eten-tech-foundation/fluent-mobile/issues/542)  
**Development task:** [tickets/pericope-mode-without-set-data.md](./tickets/pericope-mode-without-set-data.md)  
**Evidence:** I.29a

### Candidate 6: Pericope take label is truncated on the Record tab

**Severity:** Low  
**Launch blocker:** No  
**Related issue:** [#410](https://github.com/eten-tech-foundation/fluent-mobile/issues/410), [#474](https://github.com/eten-tech-foundation/fluent-mobile/issues/474) (closed as opened by mistake)  
**Development task:** [tickets/pericope-take-label-truncation.md](./tickets/pericope-take-label-truncation.md)  
**Evidence:** D.17 (screenshot to attach on the issue)

Existing open issues re-checked on device (no new ticket unless the behavior
differs): [#408](https://github.com/eten-tech-foundation/fluent-mobile/issues/408)
source-audio scrub (B.9), [#564](https://github.com/eten-tech-foundation/fluent-mobile/issues/564)
unit tap (B.10), [#571](https://github.com/eten-tech-foundation/fluent-mobile/issues/571)
stitched row alignment (E.21, not reported).
[#544](https://github.com/eten-tech-foundation/fluent-mobile/issues/544)
(draft scrub) was not re-checked here; it belongs to the #528 audit.

## Open Questions

- **Does a stitched pericope count as recorded for advancement?** #542 asks
  to "require every pericope in the chapter to have a recording", and its
  intro says a chapter "should not advance until every verse has a
  recording", which supports counting verse coverage; #411 treats a stitched
  row as one playable recording. The Bible tab already shows it as recorded
  (Candidate 3).
- **Account sync of the drafting unit (#407).** Neither mobile, fluent-web
  nor fluent-api stores the preference on the account. Keep it per device,
  or add a key to `/self/settings` on both clients?
- **Pericope takes and peer check.** Until range-take upload exists, should
  pericope capture be allowed at all in a build used for real drafting?
- **Projects without a pericope set.** Should the Pericope option be hidden or
  explained when the project has no set (Candidate 5)?
- **Titles for split FIA pericopes.** The bundled FIA data titles only the
  first part of a split pericope (Mark 29a has a title; 29b, 8:31–9:1, does
  not; 13 of 67 Mark pericopes are untitled). Should parts b/c/d show the
  title of part a?
- **Verse-mode tick marks on the draft waveform (#409).** PR #467 deferred
  this AC because verse takes are single-verse audio, saying it would become
  buildable once #410 landed. #410 has landed (PR #473), and nothing tracks
  it.
  Drop the AC, or define where ticks apply (for example the stitched row)?

## Audit Summary

**Overall result:** Pass with gaps

**Summary:**  
Pericope display works on device: the Settings toggle, Bible cards with
range titles and recorded status, Record title and pericope navigation,
mixed-mode labels, the shared 5-take cap, stitched playback and offline use
all pass. The main risk is that pericope takes never reach the server
(Candidate 1), yet a chapter drafted with them can still be sent to Peer
Check (Candidate 2); whether pericope capture is acceptable for launch
before range-take upload exists is a product decision, and Candidate 1 needs
a fluent-api change. Pericope-mode completeness disagrees with the Bible tab
status (Candidate 3). Projects on sets that are not bundled, or with no set,
get a silent verse view (Candidates 4 and 5). Long pericope labels are
truncated (Candidate 6). Unit tap does not open Record (B.10, existing #564;
fix in PR #573). Source-audio scrubbing (B.9) was inconclusive and remains
tracked on #408.

**Follow-up required:**

- [ ] All identified gaps have corresponding GitHub issues.
- [ ] Mobile and API dependencies are cross-linked.
- [ ] Launch-blocking gaps are clearly identified.
- [ ] Assessment has been reviewed and merged.

**Merged assessment:** _(pending PR merge; final link posted on #534)_
