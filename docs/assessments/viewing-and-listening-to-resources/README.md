# Viewing and Listening to Resources Audit

> **Status: device run complete; gaps filed.** Gaps 1–7 are filed as
> #591–#597 (sub-issues of #531). Gaps 1–6 were observed on device (Gap 6's
> trigger not isolated); Gap 7 is from file inspection.

## Overview

**Feature:** Drafting Resources tab (Translation Notes, Translation
Questions, Images & Maps: sections, unit sync, empty state, scroll and
accordion restore, error and Retry, fullscreen image viewer) and listening
to source audio in the shell player (play/pause, scrub, verse selection,
sequential playback, playing-verse highlight, draft/source exclusivity)  
**Auditor:** Jonathan Seehagen (`@JonathanSeehagen`)  
**Date tested:** 2026-09-25  
**Build/version:** Local run of merged `main` @ `fb634e5` (`expo-dev-client` + Metro, dev LogBox), not a distributed build or the nightly APK  
**Environment:** `https://dev.api.fluent.bible`  
**Device and OS:** Xiaomi Redmi Note 9 Pro, Android 10 (API 29), physical device  
**Audit sub-issue:** [#531](https://github.com/eten-tech-foundation/fluent-mobile/issues/531) (epic [#526](https://github.com/eten-tech-foundation/fluent-mobile/issues/526))

## Related Issues

Product specs (source of expected behavior):

- [#188](https://github.com/eten-tech-foundation/fluent-mobile/issues/188) — Resources tab with unit-synced content (Open; passed QA on 2026-09-02)
- [#189](https://github.com/eten-tech-foundation/fluent-mobile/issues/189) — Translation Notes section (Closed)
- [#190](https://github.com/eten-tech-foundation/fluent-mobile/issues/190) — Translation Questions section (Closed)
- [#191](https://github.com/eten-tech-foundation/fluent-mobile/issues/191) — Images & Maps section (Closed)
- [#192](https://github.com/eten-tech-foundation/fluent-mobile/issues/192) — Reuse the offline sync model for Resources (Closed)
- [#48](https://github.com/eten-tech-foundation/fluent-mobile/issues/48) — Bible tab verse list and sequential playback (Closed)
- [#235](https://github.com/eten-tech-foundation/fluent-mobile/issues/235) — Wire the source audio dock to real fetch and playback (Closed; replaces #48's "hide the player" with a visible empty state)
- [#412](https://github.com/eten-tech-foundation/fluent-mobile/issues/412) — Source audio player for the Bible tab (Closed; passed QA on 2026-09-15)
- [#408](https://github.com/eten-tech-foundation/fluent-mobile/issues/408) — Bible tab for the Verse/Pericope toggle (Open; QA found intermittent source-audio scrub restarts)

Engineering / API:

- [#381](https://github.com/eten-tech-foundation/fluent-mobile/pull/381) — Load Resources TN/TQ/Images via fluent-api (PR, merged 2026-08-25)
- [#387](https://github.com/eten-tech-foundation/fluent-mobile/pull/387) — Show Resources online without offline inventory gating (PR, merged 2026-08-25)
- [fluent-api#273](https://github.com/eten-tech-foundation/fluent-api/issues/273) — Aquifer-backed translation resources API for mobile (Open; shipped in fluent-api PR #274)
- [fluent-api#282](https://github.com/eten-tech-foundation/fluent-api/issues/282) — Source/reference audio API for the drafting dock (Closed)

Bug fixes and regressions:

- [#348](https://github.com/eten-tech-foundation/fluent-mobile/issues/348) — Images unavailable lacks Retry; Settings white screen on user switch (Closed; duplicate [#347](https://github.com/eten-tech-foundation/fluent-mobile/issues/347))
- [#417](https://github.com/eten-tech-foundation/fluent-mobile/issues/417) — Reference Images stored as `kind: text`, so Images & Maps stays hidden offline (Open)
- [#540](https://github.com/eten-tech-foundation/fluent-mobile/issues/540) — Pericope view Next navigation and source text (Closed)
- [#564](https://github.com/eten-tech-foundation/fluent-mobile/issues/564) — Bible unit tap no longer opens Record (Open; from #527)

Adjacent (owned by sibling audits, listed for cross-reference):

- [#578](https://github.com/eten-tech-foundation/fluent-mobile/issues/578) — Show downloaded resources offline in the Resources tab (Open; from #529)
- [#579](https://github.com/eten-tech-foundation/fluent-mobile/issues/579) — Play downloaded source audio offline (Open; from #529)
- [#504](https://github.com/eten-tech-foundation/fluent-mobile/issues/504) — Wire Tier 2/3 resources to the API in Customize download (Open; PR #562 open)
- [#446](https://github.com/eten-tech-foundation/fluent-mobile/issues/446) — Download queue keys on the Aquifer content id (Open)
- [#534](https://github.com/eten-tech-foundation/fluent-mobile/issues/534) — Pericope view audit (Open; Bible-tab cards, pericope source-audio scrub)
- [#544](https://github.com/eten-tech-foundation/fluent-mobile/issues/544) — Draft waveform scrubbing restarts instead of seeking (Open; draft takes, not source audio)

## Expected Behavior

Consolidated from the specs above. Where a later ticket supersedes an earlier
one, the later ticket wins.

- **Tab:** Resources is the second drafting tab (Bible, Resources, Record)
  and is always visible (#188).
- **Unit sync:** content follows the unit selected on Bible or Record and
  updates immediately when it changes. Scroll position and open sections are
  restored when the translator returns to a unit (#188).
- **Empty state:** when the unit has no resources of any kind, the tab shows
  a centered "No resources available for this verse" (#188). A section with
  no content for the unit is hidden entirely (#189, #190, #191).
- **Translation Notes:** top section, a collapsed accordion with a book-open
  icon. Each note is its own collapsed accordion, one per verse or passage
  covered by the unit, with paragraphs and lists preserved (#189).
- **Translation Questions:** below Notes, a collapsed accordion with a
  question icon. Each question is an accordion and its answer is hidden
  until tapped (#190).
- **Images & Maps:** bottom section, a collapsed accordion with an images
  icon. Each item is a thumbnail with title/caption and attribution.
  Thumbnails support pinch-to-zoom. Tapping opens a fullscreen view with
  pinch-to-zoom and pan (#191).
- **Errors:** each section has its own inline error with Retry, and one
  section's failure does not block the others (#189, #190, #191, #348).
- **Offline:** prepared resources are read with no network, and unprepared
  ones show as unavailable (#192). Owned by the #529 audit (#578).
- **Source audio player:** a shell-level bar above the Bible and Record tabs
  with a Play/Pause button (≥ 48 dp), a waveform with continuous scrubbing,
  and a unit counter such as "Verse 3 / 12". It loads the unit selected on
  the Bible tab (#412). Loading, empty ("No source audio") and error (Retry)
  states are visible (#235, which replaces #48's "hide the player").
- **Verse selection:** tapping a verse selects it and moves the player to
  that verse's start without auto-playing. During playback, the tap moves
  playback to that verse and it continues from there (#48).
- **Sequential playback:** playback continues through the chapter. The
  playing verse gets a row highlight that is distinct from the selected
  verse's left border (both can show together). The playing row is scrolled
  into view, the selected verse does not change, and playback stops at the
  end of the chapter without looping (#48).
- **Exclusivity and lifecycle:** source audio and draft takes never play at
  once, source audio stops while recording, and it stops or clears when the
  unit changes or the translator leaves drafting (#235).
- **Verse ticks:** tick marks appear only when the API provides verse
  timestamps; otherwise a plain scrubber (#408). Pericope-mode ticks and
  scrub belong to the #534 audit.

## Code Review Notes (pre-device)

Read on `main` @ `fb634e5`:

- **Mock data:** none in the running app. TN, TQ and Images & Maps load from
  fluent-api (`src/services/translationNotes.ts:107`,
  `translationQuestions.ts:107`, `imagesMaps.ts:73`), and source audio from
  `FluentAPI.getChapterSourceAudio` (`src/hooks/useSourceAudio.ts:172`).
  The old content mocks (`src/mocks/resources/*`,
  `src/app/tabs/resources/mockResourceData.ts`) have no production
  importers; they are dead code, not a mock-data gap. The Prepare for
  Offline catalog mock belongs to #529 (#504).
- **Empty TN / TQ sections are always shown online.** Online,
  `getVisibleResourceSections` returns all three sections
  (`src/utils/resourcesSectionInventory.ts:84-86`), and `ResourcesTab`
  hides only Images & Maps when it loads empty
  (`src/app/tabs/ResourcesTab.tsx:175-188`). An empty TN or TQ section
  still renders as an accordion that expands to nothing
  (`TranslationNotesSection.tsx:84-86`, `TranslationQuestionsSection.tsx:92-94`).
  So online the tab-wide empty state is never shown, and its copy is the
  offline one ("No resources are on this device yet…",
  `src/constants/messages.ts:24-25`), not #188's "No resources available
  for this verse". The same copy also shows while connectivity is still
  resolving (`ResourcesTab.test.tsx:253`).
- **Pericope unit reads one verse.** In pericope mode the Bible tab sets
  `selectedVerse` to the pericope's anchor verse (`BibleTab.tsx:117-124`).
  Resources loads and labels only that verse
  (`ResourcesTab.tsx:93-113`, `resourcesSectionInventory.ts:101`), and
  fluent-api only exposes single-verse routes
  (`GET /projects/{id}/translation-resources/{notes|questions|images}/{book}/{chapter}/{verse}`).
  #189 asks for one note per verse or passage covered by the unit.
- **No caption or attribution for images.** fluent-api returns
  `id`, `title`, `localizedName`, `url`, `thumbnailUrl?`, `size?`
  (`src/types/api/translationResources.ts:31-38`); the mapper keeps only
  title and URL (`src/services/imagesMaps.ts:29-47`). The UI renders
  caption and attribution only when present (`ImageThumbnail.tsx:92-95`),
  so #191's attribution never shows. `thumbnailUrl` is ignored, so each
  thumbnail downloads the full image.
- **Playing verse is not scrolled into view.** `BibleTab` scrolls only for
  the initial index (`initialScrollIndex`, `BibleTab.tsx:230-235`); nothing
  reacts to `currentlyPlayingVerse`. #48 asks to scroll the playing row into
  view when it is off-screen.
- **Verse seek and highlight depend on API timestamps.** `verseStartMs`
  returns 0 without timestamps (`src/hooks/sourceAudioHelpers.ts:53-69`),
  and the playing-verse poll is skipped without them
  (`useSourceAudio.ts:239-241`). On a project without verse timestamps,
  tapping a verse during playback goes back to the start of the chapter, and
  the highlight stays on the selected verse. #235 records this as a known
  limitation on DEV (timestamps of `0`).
- **Signed URL expiry is checked only when the chapter key changes.**
  `isCachedSourceAudioResponseValid` runs in the load effect
  (`useSourceAudio.ts:153-161`), so a URL that expires while the chapter
  stays open is still used by `play()`.
- **Header subtitle.** When any Resources section is in the offline
  inventory, the header shows "Downloaded resources for this project"
  under the verse reference, including online
  (`resourcesSectionInventory.ts:102-103`).
- **Formatting.** `tipTapToPlainText` keeps paragraphs and list items but
  renders ordered lists as `•` bullets (`src/utils/aquiferTipTapText.ts:35-46`).
- **Maestro coverage is chrome-only.** `drafting/resources-sections.yaml`
  and `drafting/source-audio-dock.yaml` only assert the tab and dock
  exist. `drafting/images-fullscreen.yaml` waits for
  `images-maps-thumbnail-.*`, a testID that no longer exists (thumbnails
  use `images-maps-item-*`, `images-maps-maximize-*`), so its fullscreen
  steps never run.

## Test Results

Scenario numbers match the device test script used for this audit (section
letter + step). Scenarios run with no problem reported are Pass. A.7 was
added during the run (not in the original script), and G.x is an extra
observation; both are included in the counts.

### Coverage counts

| Planned | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|
| 29 | 16 | 10 | 2 | 1 |

Failures and gaps do not map 1:1: A.6 and E.14 feed Gap 1, and G.18–G.20
together are Gap 5. E.13 fails on behavior already tracked by #578 and
#417, so it adds no gap; it counts once, as Fail (its isolation check
was Blocked).

| # | Scenario | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| A.1 | Drafting tab row | Bible, Resources, Record; Resources always visible (#188) | As expected | Pass |
| A.2 | Open Resources on a verse with content | Verse reference header; TN, TQ, Images & Maps collapsed with their icons (#189–#191) | As expected. The "Downloaded resources for this project" subtitle appears only after a Prepare for Offline download, as expected from `resourcesSectionInventory.ts:102-103` | Pass |
| A.3 | Change verse (Record chevrons / Bible tap) | Content follows the new verse immediately (#188) | As expected | Pass |
| A.4 | Open a section + scroll on verse X → verse Y → back to X | Open sections and scroll restored (#188) | As expected | Pass |
| A.5 | Verse with no resources at all | Sections hidden; centered "No resources available for this verse" (#188) | No verse without any resource was found | Blocked |
| A.6 | Verse missing one type | That section hidden (#189–#191) | Psalms 10:1: Images & Maps hidden (correct), but Translation Notes is shown and expands to an empty body. Mark 1: Translation Questions shows a spinner on expand, then an empty body | **Fail** → Gap 1 |
| A.7 | Resources opened while the screen is still loading | Loading indicator, then the sections | "No resources are on this device yet" flashes, then the sections appear | **Fail** → Gap 2 |
| B.7 | Expand Translation Notes | One collapsed accordion per note (#189) | As expected | Pass |
| B.8 | Open a note | Paragraphs and lists preserved (#189) | As expected | Pass |
| C.9 | Expand Translation Questions | Questions listed; answers hidden until tapped (#190) | As expected on a verse with questions (Psalms 10:1, one item) | Pass |
| D.10 | Expand Images & Maps | Thumbnails with title/caption and attribution (#191) | Title only (e.g. Mark 1 "Locations in the Book of Mark"); no caption or attribution | **Fail** → Gap 4 |
| D.11 | Pinch a thumbnail | Zooms (#191) | As expected | Pass |
| D.12 | Maximize → fullscreen | Pinch-zoom + pan; title; Close and Back exit (#191) | As expected; the title shows in the viewer header next to Close | Pass |
| E.13 | Section load failure (prepared chapter, airplane mode) | Inline error + Retry per section; others unaffected (#189–#191, #348) | Mark 1:3: TN and TQ both show "Unable to load" + Retry; Images & Maps is hidden. Prepared content is not read offline (#578) and images are stored as `kind: text` (#417). Isolation could not be checked because every visible section failed | **Fail** (tracked: #578, #417) · Blocked (isolation) |
| E.14 | Retry after the network returns | Section loads (#348) | Retry reloads each section and Images & Maps reappears. An empty TQ still expands to a blank body | **Fail** → Gap 1 |
| F.15 | Pericope mode → Resources | Resources for the whole pericope; range in the header (#188, #189) | Bible and Record show pericopes, but Resources shows "Mark 1:1" and only verse 1's content, as in verse mode | **Fail** → Gap 3 |
| G.16 | Player placement and label | Bar on Bible and Record, not on Resources; "<Bible> Source Audio · Verse N / M" (#412) | As expected | Pass |
| G.17 | Play / pause / resume | Real duration; resumes where paused (#235, #412) | As expected | Pass |
| G.18 | Tap a verse while stopped | Selects it; no auto-play; Play starts at that verse (#48) | Playback does not follow the verse. No project with verse timestamps was found (no ticks on any waveform) | **Fail** → Gap 5 |
| G.19 | Tap a verse while playing | Playback moves to that verse and continues (#48) | Same as G.18 | **Fail** → Gap 5 |
| G.20 | Highlight during playback | Playing row highlighted, selected border separate; selection unchanged (#48) | Same as G.18: the highlight cannot follow playback without timestamps | **Fail** → Gap 5 |
| G.21 | Playing verse scrolls off-screen | List follows the playing row (#48) | Cannot be triggered without verse timestamps | Blocked |
| G.22 | Play to the end of the chapter | Stops at the end, no loop; highlight clears (#48) | Stops at the end without looping; the button returns to Play, and Play starts again from the beginning. The waveform stays fully played with the playhead at the right edge and `5:42 / 5:42` (not reset to the start). The caption still reads `Verse 1 / 45` because nothing tracks the playing verse without timestamps (Gap 5) | Pass |
| G.23 | Scrub the waveform (verse mode) | Seeks to the position; does not restart (#408 QA) | Scrubbing sometimes restarts; already reported on #408 (open) | Skipped (tracked: #408) |
| G.24 | Playing → open Resources → back to Bible | Pauses when the bar is hidden; resumes from the same position | Source audio stops and resets when Resources opens (the player is disabled there, `SourceAudioShell.tsx:76-79`, and `useSourceAudio.ts:118-122` stops and clears it); back on Bible, Play starts from the beginning. The specs only require the bar on Bible and Record and stop/clear on leave (#235, #412), so this matches them; resuming is an open question | Pass |
| G.25 | Playing → leave drafting (back) | Source audio stops (#235) | As expected | Pass |
| G.26 | Record tab: source playing → play a take / record | Source stops; bar hidden during capture (#235) | Source stops when a take plays and during capture; afterwards the player is back at the start (stop, not pause: `RecordTab.tsx:757-778` calls `stop`). Matches #235; see Open Questions | Pass |
| G.27 | Project without source audio | "No source audio" state, no crash (#235) | As expected | Pass |
| G.x | Source audio use (Bible tab only, no draft takes) | No React errors | `Maximum update depth exceeded` in the dev LogBox while using the source audio player; exact trigger not isolated | **Fail** → Gap 6 |

## Offline and Synchronization Results

Resources and source audio are read-only here. Offline reads of prepared
content belong to the going offline audit (#529), which filed #578 and #579.

| Scenario | Result | Notes |
|---|---|---|
| Feature used while offline | Fail (tracked) | E.13 — prepared TN/TQ fail and Images & Maps is hidden; #578, #417 |
| App closed and reopened offline | N/A | Covered by #529 |
| Device returns online | Pass | E.14 — Retry recovers each section |
| Offline changes synchronize | N/A | Read-only feature; nothing to upload |
| Conflicting changes are handled | N/A | Read-only feature |

## Gaps Identified

Searched for existing issues before filing (resources, empty, attribution,
caption, pericope resources, timestamps, maximum update depth, maestro
images).

### Gap 1: Empty Translation Notes / Questions sections are shown online

**Severity:** Medium  
**Launch blocker:** No  
**Related issue:** [#188](https://github.com/eten-tech-foundation/fluent-mobile/issues/188), [#189](https://github.com/eten-tech-foundation/fluent-mobile/issues/189), [#190](https://github.com/eten-tech-foundation/fluent-mobile/issues/190)  
**Development task:** [#591](https://github.com/eten-tech-foundation/fluent-mobile/issues/591)

**Description:**  
Online, TN and TQ always render (`resourcesSectionInventory.ts:84-86`,
`ResourcesTab.tsx:175-188`), and only Images & Maps is hidden when empty. An
empty TN or TQ expands to a blank body. TQ also loads only when its section
is expanded, because `useTranslationQuestionsForUnit` runs inside the
accordion body (`TranslationQuestionsSection.tsx:34-39`;
`ResourceSectionAccordion.tsx:72` renders children only when expanded). So
the tab cannot know that TQ is empty, and it refetches on every expand. As a
result, #188's "No resources available for this verse" never appears online.

**Steps to reproduce:**

1. Online, open Psalms 10:1 → Resources.
2. Expand Translation Notes.

**Expected behavior:** empty sections are hidden; with nothing at all, the
centered "No resources available for this verse".  
**Actual behavior:** the TN section is shown and expands to nothing (TQ
in Mark 1: spinner, then nothing).  
**Evidence:** device run, A.6 and E.14.

### Gap 2: Offline empty message flashes while connectivity is resolving

**Severity:** Low  
**Launch blocker:** No  
**Related issue:** [#188](https://github.com/eten-tech-foundation/fluent-mobile/issues/188), [#192](https://github.com/eten-tech-foundation/fluent-mobile/issues/192)  
**Development task:** [#592](https://github.com/eten-tech-foundation/fluent-mobile/issues/592)

**Description:**  
Until `useConnectivity` resolves, `ResourcesTab` treats the device as
offline (`isOnline: hasResolved && isOnline`, `ResourcesTab.tsx:168`).
With nothing downloaded, no section is visible and the offline copy "No
resources are on this device yet. Download them from Prepare for Offline."
shows until connectivity resolves. A unit test currently requires this
(`ResourcesTab.test.tsx:253`).

**Steps to reproduce:**

1. Online, with no Prepare for Offline download, open a chapter.
2. Open Resources right away.

**Expected behavior:** a loading indicator, then the sections.  
**Actual behavior:** the offline empty message flashes first.  
**Evidence:** device run, A.7.

### Gap 3: Pericope mode shows Resources for the first verse only

**Severity:** High  
**Launch blocker:** To be decided with product  
**Related issue:** [#188](https://github.com/eten-tech-foundation/fluent-mobile/issues/188), [#189](https://github.com/eten-tech-foundation/fluent-mobile/issues/189), [#408](https://github.com/eten-tech-foundation/fluent-mobile/issues/408); API: [fluent-api#273](https://github.com/eten-tech-foundation/fluent-api/issues/273)  
**Development task:** [#593](https://github.com/eten-tech-foundation/fluent-mobile/issues/593) — tracked in fluent-mobile for now; the fluent-api task (verse-range resources) will be opened at implementation time

**Description:**  
In pericope mode the Bible tab sets `selectedVerse` to the pericope's
anchor verse (`BibleTab.tsx:117-124`), and Resources loads and labels only
that verse (`ResourcesTab.tsx:93-113`). fluent-api only exposes
single-verse routes. A translator working on a pericope misses the notes,
questions and images for every verse after the first.

**Steps to reproduce:**

1. Settings → Pericope.
2. Mark 1: select a multi-verse pericope, then open Resources.

**Expected behavior:** the pericope range in the header and resources for
every verse in it.  
**Actual behavior:** "Mark 1:1" and verse 1's resources only.  
**Evidence:** device run, F.15.

### Gap 4: Images & Maps show no caption or attribution

**Severity:** Medium  
**Launch blocker:** To be decided with product (image licenses may require
attribution)  
**Related issue:** [#191](https://github.com/eten-tech-foundation/fluent-mobile/issues/191); API: [fluent-api#273](https://github.com/eten-tech-foundation/fluent-api/issues/273)  
**Development task:** [#594](https://github.com/eten-tech-foundation/fluent-mobile/issues/594) — tracked in fluent-mobile for now; the fluent-api task (image caption and attribution) will be opened at implementation time

**Description:**  
fluent-api returns `id`, `title`, `localizedName`, `url`, `thumbnailUrl?`,
`size?` for images (`src/types/api/translationResources.ts:31-38`), and the
mapper keeps title and URL (`src/services/imagesMaps.ts:29-47`). The UI
already renders caption and attribution when present
(`ImageThumbnail.tsx:92-95`). `thumbnailUrl` is also ignored, so each
thumbnail loads the full image.

**Steps to reproduce:**

1. Online, Mark 1 → Resources → Images & Maps.

**Expected behavior:** title/caption and attribution under each thumbnail.  
**Actual behavior:** title only ("Locations in the Book of Mark").  
**Evidence:** device run, D.10.

### Gap 5: Source audio does not follow verses without verse timestamps

**Severity:** High (listen-then-record works only per chapter)  
**Launch blocker:** To be decided with product  
**Related issue:** [#48](https://github.com/eten-tech-foundation/fluent-mobile/issues/48), [#235](https://github.com/eten-tech-foundation/fluent-mobile/issues/235), [#408](https://github.com/eten-tech-foundation/fluent-mobile/issues/408); API: [fluent-api#282](https://github.com/eten-tech-foundation/fluent-api/issues/282)  
**Development task:** [#595](https://github.com/eten-tech-foundation/fluent-mobile/issues/595) — tracked in fluent-mobile for now; the fluent-api task (verse timestamps for launch projects) will be opened at implementation time

**Description:**  
Verse seek and the playing-verse highlight rely on `verseTimestamps` from
the source audio API. Without them `verseStartMs` returns 0
(`sourceAudioHelpers.ts:53-69`) and the highlight poll is skipped
(`useSourceAudio.ts:239-241`), so verse taps go back to the chapter start
and the highlight does not move. No project with verse timestamps was
found on dev (no ticks on any waveform), and #235 already noted DEV
timestamps of `0`. This needs a data decision (timestamps from fluent-api /
DBL for launch projects) and an honest UI when they are missing.

**Steps to reproduce:**

1. Online, open a chapter; the source audio waveform shows no ticks.
2. Play, then tap another verse.

**Expected behavior:** playback moves to the tapped verse and the playing
highlight follows playback (#48).  
**Actual behavior:** playback does not follow the verses.  
**Evidence:** device run, G.18–G.20.

### Gap 6: "Maximum update depth exceeded" while using the source audio player

**Severity:** Medium  
**Launch blocker:** No  
**Related issue:** [#569](https://github.com/eten-tech-foundation/fluent-mobile/issues/569) (same error on draft take playback), [#412](https://github.com/eten-tech-foundation/fluent-mobile/issues/412)  
**Development task:** [#596](https://github.com/eten-tech-foundation/fluent-mobile/issues/596)

**Description:**  
The dev LogBox showed `Maximum update depth exceeded` while only the
source audio player was used (Bible tab, no draft takes played). #569
covers the same error on the Record tab through `useVerseAudio`; the
source player runs a separate path (`useSourceAudio`, `SourceAudioShell`).

**Steps to reproduce:**

1. Dev build, Bible tab: play, pause, tap verses and scrub the source audio.
2. Watch the LogBox or Metro logs.

**Expected behavior:** no update-depth error.  
**Actual behavior:** `Maximum update depth exceeded` is logged.  
**Evidence:** device run, G.x (dev build LogBox); exact trigger not isolated.

### Gap 7: Maestro images fullscreen smoke never opens fullscreen

**Severity:** Low (test infra)  
**Launch blocker:** No  
**Related issue:** [#191](https://github.com/eten-tech-foundation/fluent-mobile/issues/191), [#491](https://github.com/eten-tech-foundation/fluent-mobile/issues/491)  
**Development task:** [#597](https://github.com/eten-tech-foundation/fluent-mobile/issues/597)

**Description:**  
`.maestro/flows/drafting/images-fullscreen.yaml` waits for
`images-maps-thumbnail-.*`, a testID that no longer exists (thumbnails use
`images-maps-item-*` and `images-maps-maximize-*`). The step is
conditional, so the flow passes without opening fullscreen.

**Steps to reproduce:**

1. Compare the flow's selectors with `ImageThumbnail.tsx` testIDs.

**Expected behavior:** the smoke opens and closes fullscreen on a fixture
verse with images.  
**Actual behavior:** the fullscreen branch never runs.  
**Evidence:** file inspection on `main` @ `fb634e5`.

### Not confirmed (code-only)

- **Playing row not scrolled into view (#48):** no code reacts to
  `currentlyPlayingVerse` (`BibleTab.tsx`), but G.21 could not be
  triggered without timestamps. Revisit with Gap 5.
- **Signed source audio URL expiry** is rechecked only when the chapter key
  changes (`useSourceAudio.ts:153-161`). Not observed.
- **Ordered lists rendered as bullets** (`aquiferTipTapText.ts:35-46`). Not
  observed in B.8.

### Already tracked (no new issue)

- Prepared resources are not read offline — [#578](https://github.com/eten-tech-foundation/fluent-mobile/issues/578) (E.13).
- Reference Images stored as `kind: text`, hidden offline — [#417](https://github.com/eten-tech-foundation/fluent-mobile/issues/417) (E.13).
- Source audio scrub sometimes restarts — [#408](https://github.com/eten-tech-foundation/fluent-mobile/issues/408) (G.23).

### Observed, no issue

- At the end of the chapter the source waveform stays fully played with the
  playhead at the right edge (G.22). Playback stopped as #48 requires and
  the button is back on Play; no spec asks the source player to reset, so
  this is left to the playback redesign mentioned on #412.

## Open Questions

- The header subtitle "Downloaded resources for this project" shows
  whenever anything is downloaded, even online and even when the content
  comes from the API or fails offline (E.13). Should it stay?
- #412 QA was passed pending a playback redesign by the design team. Should
  Gap 5 wait for that redesign or be fixed first?
- #188 passed QA on 2026-09-02. Can it be closed?
- Leaving the Bible tab for Resources, playing a draft take, or recording
  stops source audio and resets it to the start (G.24, G.26). Should it
  pause and keep the position instead, so the translator can go back to the
  source after reading a resource or listening to a take?

## Audit Summary

**Overall result:** Pass with gaps

**Summary:**  
Online, the Resources tab works on a physical Android 10 device: tab order,
unit sync, scroll and accordion restore, Translation Notes and Questions
accordions, image zoom and fullscreen, and Retry after the network returns.
The source audio player also passes its lifecycle checks: placement,
play/pause, stopping on leave, exclusivity with draft takes, and the
no-audio state. The main risks are content coverage: in pericope mode
Resources shows only the first verse (Gap 3), and source audio cannot follow
verses because no dev project has verse timestamps (Gap 5). Both need
fluent-api work, tracked in fluent-mobile for now (as in the #534 audit),
and a product decision on launch blocking before the November 2026 ETEN
Summit. Images lack attribution (Gap 4), which may be a licensing question.
The rest are empty and loading state issues (Gaps 1, 2), an update-depth
error in the source player (Gap 6), and a no-op Maestro smoke (Gap 7).
Offline reading of prepared content stays with #578 and #417.

The device run used a local run of merged `main` over Metro, not the
nightly APK. The update-depth error was observed through the dev LogBox.

**Follow-up required:**

- [x] All identified gaps have corresponding GitHub issues. _(#591–#597)_
- [ ] Mobile and API dependencies are cross-linked. _(#593, #594, #595 need fluent-api work; the fluent-api tasks are opened at implementation time)_
- [x] Launch-blocking gaps are clearly identified. _(Gaps 3, 4, 5: to be decided with product)_
- [ ] Assessment has been reviewed and merged.

**Merged assessment:** _(pending PR merge; final link posted on #531)_
