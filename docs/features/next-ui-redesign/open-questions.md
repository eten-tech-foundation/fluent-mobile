# Next UI open questions

A running list of what's undecided across the redesign: design calls, product
calls, API gaps and architecture decisions. Anything that blocks or shapes a
component or screen goes here, so it's answered once and not rediscovered per
ticket.

## How to use this doc

- **Add** a question under its area. IDs are global, not per area: take the
  highest ID in Open or Decided, plus one, so an ID is never reused. Say
  what's blocked, what we'd do in the meantime, and who needs to answer:
  design, product, API or dev.
- **Answer** by moving it to [Decided](#decided) with the answer, the date and
  where it landed (PR, Figma, issue). Keep the ID.
- **Unmerged work:** when a question points at code that's only on a branch,
  name the branch, so a grep on `main` coming up empty isn't confusing.
- **Link** to it from code comments, PRs and issues as `open-questions Q7`.
- Screen-level detail (what each element can wire to) lives under
  [Screen notes](#screen-notes), one section per screen.

## Open

### Foundations

The token-level detail is in the
[theme audit](theme-figma-audit.md#still-open).

- **Q1 · Font families** *(design)*. Figma's Google Sans Flex, DM Mono and
  Noto Sans Telugu are placeholders. Code renders the named type styles in
  the system sans and `monospace` until this is decided; then it's loading the
  fonts and changing `nextFontFamilies` in `src/theme/nextFoundation.ts` (on
  `jskager/feature/696-named-type-styles`; on `main` the only knob is
  `nextTypography.fontFamily`).
  Google Sans Flex would need static weight files, since RN on Android doesn't
  drive variable font axes.
- **Q2 · Gradients, strokes and `space/48`** *(design)*. `fade/reading` is
  encoded as `theme.fade.reading`; `gradient/accent` and `Fluent Gradient`
  aren't yet. `stroke/1` and `stroke/2` land with #693. `space/48` is the
  screen top inset in Figma (code would use safe-area insets). Needed before
  the note overlays.

### Components

- **Q3 · What Eject does** *(design)*. The Record mode Hardware panel has
  Record · Play · Eject. Eject has no defined action, so the gallery only
  acknowledges the press.
- **Q4 · Take card and Take chip tokens** *(design)*. The Record page's take
  card and take stacking frames are exploration frames with plain hex and no
  bound variables. They need roles bound before they're built. The Level wave
  inside them is already built against roles (`fg/primary` bars, `fg/inactive`
  resting ticks), which disappear on the card's current dark grey.
- **Q5 · Level wave numbers** *(design)*. Figma doesn't draw the short
  variant lifting or the long variant scrolling, so two values are code-side
  guesses: the short variant lifts to 16pt, and the long variant's recording
  front holds two thirds across before scrolling.
- **Q6 · Live mic levels** *(dev)*. Metering is on in the recording engine,
  and the Next player's take card draws live levels (`useLiveLevels` maps dB
  to 0–1). Saved takes keep their wave only for the session, since levels
  aren't stored. Touches recording, so it needs device QA.
- **Q20 · Contrast of unplayed and resting marks** *(design)*. Figma binds
  unplayed Wave bars to `fg/inactive`, and the Level wave's resting ticks use
  it too. That's about 1.5:1 on `bg/default` in Canvas and Hardware (WCAG
  asks 3:1 for graphics you need to read), and identical to `surface/default`
  in Canvas, so on a Canvas card they vanish. Keep it as a deliberate quiet
  state, or move them to `fg/secondary` like the short Level wave's dots?
- **Q7 · Listen / Record segmented control** *(design)*. The Pericope screen
  has a Listen | Record segmented button that isn't a Foundations component
  yet.

### Architecture

- **Q9 · App-level player for "Now playing"** *(dev)*. Source playback lives
  in `SourceAudioProvider`, scoped to `DraftingScreen`, and stops when you
  leave it (`useSourceAudio.ts:252-260`). A mini player that survives
  navigation needs an app-level provider that keeps today's rules (draft and
  source audio never play together, recording stops playback, #235).

### Data and API

- **Q10 · Word-level timing** *(API)*. Nothing in the app or fluent-api has
  word or phrase timing; every audio endpoint is verse-level. Until it
  exists, the reading view highlights the current verse (Current), shows
  verses already read as Plain and upcoming verses as Chips.
- **Q11 · Where the step tracks come from** *(product + API)*. Hear & Heart,
  Setting the Stage, Defining the Scenes, Embodying the Text, Filling the Gaps
  and Speaking the Word don't exist in fluent-mobile, fluent-web or
  fluent-api. Only Source Text maps to real audio. Nearest lead: Aquifer
  "Guide" resources, which mobile doesn't call. Until then, screens ship
  Source Text only.
- **Q12 · Pericope window inside a chapter file** *(API)*. Source audio is
  one file per chapter with verse start times only. The uncalled
  `GET /projects/{projectId}/playback-audio/{bookCode}/{chapter}` adds
  `endSeconds` and `verseAddressable`. Is Playback Audio meant to replace
  `/source-audio`? Cross-chapter pericopes would need two files either way.
- **Q13 · Listened progress per track** *(product)*. The Pericope screen's
  progress rings imply we remember how far you've listened to each track.
  Nothing stores that today, in SQLite or the API.
- **Q14 · Waveform amplitude** *(API, optional)*. No API returns peaks, so
  waveforms stay decorative, as they are in Legacy.
- **Q18 · Which pericope set the designs assume** *(design + product)*. The
  Figma example, "The Last Supper", Mark 14:22–25, doesn't come out of either
  set the app ships: FCBH groups Mark 14:22–26 with no title, and FIA groups
  14:20–26 as "Jesus celebrates the Passover festival with his disciples". Is
  the design using another set (an API-fetched one via `GET
  /pericope-sets/{id}` could carry both), or is the example illustrative?
- **Q19 · What "Understanding" shows** *(product)*. The player's
  Understanding variant shows notes. Translation notes are wired today; is
  that the content, or Aquifer Guide content?

### Review

From Foundations › 10 · Review and the Record page's "Record & Review –
states" (10 frames): reviewers take turns on the official take, listening,
recording voice comments at points on its timeline and passing the turn; the
translator hears them all last.

- **Q21 · One phone or many?** *(design + product)*. "Seats", "holding the
  turn" and a Pass button read like a group passing one phone around. Is
  review in person on one device, remote with each reviewer on their own
  phone, or both? One device can mostly ride on today's take sync; many
  devices needs a review backend with turn state and probably push
  notifications ("your turn").
- **Q22 · Who are the reviewers?** *(product)*. Peer checker, community
  reviewers, Observers (#452), or anyone present? Do seats need accounts, or
  just a name for the round?
- **Q23 · How does this relate to the comment tickets?** *(product + design)*.
  #451 specs text and audio comments in a half drawer, one level of threading
  and emoji reactions; #703 adds comment counts to My Work rows. The Review
  design is turn-based voice comments on the take timeline. Replace those
  tickets, or keep both?
- **Q24 · What does the API store?** *(API)*. Nothing exists today: no
  comments, review rounds, reviewers, turn order or comment audio. Depends on
  Q21–Q23. Review also needs the official take to sync (#701).

### Screens

- **Q15 · Pericope title fallback** *(design)*. The bundled FCBH set has no
  titles at all. In FIA about half the rows have none, and split pericopes
  mostly title only the first part (17 of 119 later parts have one). What
  does a header show without a title? The reference range is the obvious
  choice.
- **Q16 · Page dots paging rule** *(design)*. The player's page dots need a
  paging rule for verse text: by verse, or by measured height?
- **Q17 · What Previous / Next skip in the player** *(design)*. Verse,
  pericope or track? Record already moves between pericopes; track skip
  depends on Q11.
- **Q25 · Values with no Foundations token** *(design)*. The book and passage
  pages use a few values Figma doesn't define: one spring for the sheet, take
  fan and Track row (`NEXT_SPRING`), 0.7 opacity on a pressed book cover, the
  hero's 36 × 4 grab handle, a 12pt check on the fan's official badge, the
  Track row's 8pt unheard dot, and no glow on the official take card (Figma
  shows one, which is a gradient-style effect like Q2). Deleting a take adds
  a 300ms hold to pick it up, a 5s undo window, the 82% scrim, the 22% red
  tint over the bin and a 160ms drop. The undo card and the bin also use raw
  colors in Figma (2557-1257, 2557-1092); code maps them to
  `surface/sunken`, `border/highlight`, `surface/inverse` and `accent/record`,
  and the bin's lighter dashed ring to `fg/on-accent` at 40%.

## Decided

Rows marked — were decided before this doc had IDs.

| ID | Question | Answer | Date | Where |
| --- | --- | --- | --- | --- |
| Q8 | Where Next screens branch on UI version | One signed-in shell: route files under `(app)` pick the Legacy or Next screen; v2 screens live in `src/app/v2/screens/`. Both share hooks and services, and the rules inside `RecordTab` / `DraftingScreen` move into shared hooks. A separate `/v2` route tree was dropped in the #727 review | 2026-10-21 | [v2-feature-manifest.md](v2-feature-manifest.md#v2-routes) |
| — | Header progress dots on the Pericope screen | They're a resting waveform: Level wave, short variant | 2026-10-13 | Figma Level wave `2595:772` |
| — | Speaker grill hole color | `surface/inverse` (was the `bone/800` primitive) | 2026-10-14 | Figma Speaker grill `2409:533` |
| — | Icon/md size | `theme.controlSizes.icon20` | 2026-10-14 | `jskager/feature/695-hardware-panel` |

## Screen notes

### Listen player

Scrubbed 2026-10-14 against `origin/main` at `fecd07d`. Figma:
[Player - The Last Supper - Source Text](https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2440-30858).

**Proposed v1:** the Source Text player only, with verse-level highlighting,
the waveform clipped to the pericope with verse chips, page dots, and the
Hardware panel, as a v2 screen on the hooks `DraftingScreen` uses today (Q8).

**How you get here today:** a chapter row in `ViewProject`
(`src/app/tabs/ViewProject.tsx:76`) or `MyWorkTab`
(`src/app/tabs/MyWorkTab.tsx:53`) goes through `hrefs.verseDetail` to
`src/routes/(app)/(stack)/verse-detail.tsx`, which renders `DraftingScreen`.
The source player is docked under the Bible and Record tabs there.

| UI element | Status | Source | Legacy uses it? | Offline? | Dev check |
| --- | --- | --- | --- | --- | --- |
| Pericope verses (22–25) | Wired | `useBibleTabUnits` (`src/hooks/useBibleTabUnits.ts:25`) → `getPericopesForChapter` (`src/db/queries.ts:1199`) | Yes: `BibleTab.tsx:85`, `RecordTab.tsx:~395-423` | Yes (bundled sets, refreshed by `syncPericopes`) | Only when the drafting unit is `pericope` and the project has a pericope set. Neither shipped set produces the Figma 22–25 window (FCBH 22–26, FIA 20–26; Q18) |
| Header title "THE LAST SUPPER" | Wired, partial | `pericope_title` via `PericopeGroupResult.pericopeTitle` (the DB title, not the range builder below); Legacy at `RecordTab.tsx:423` | Yes | Yes | Often null (Q15); FIA titles this pericope differently (Q18) |
| Minimize to Now playing | Missing (app) | Player scoped to `DraftingScreen.tsx:451` | No | n/a | Q9 |
| Verse text | Wired | `bible_texts` via `getBibleTexts` (`queries.ts:1072`), `BibleUnit.bodyVerses` (`src/utils/bibleTabUnits.ts:27`) | Yes | Yes (SQLite) | One plain string per verse, no word markup |
| Word styles (Plain / Current / Phrase / Chip) | Missing | No word or phrase timing anywhere | No | n/a | Q10 |
| Current verse while playing | Wired | `verseAtPositionMs`, polled every 250ms (`useSourceAudio.ts:283-307`); `DraftingContext.currentlyPlayingVerse` | Yes (Bible tab row highlight) | Yes when downloaded | Needs `verseTimestamps`; without them it stays on the selected verse (#595) |
| Source Text audio | Wired | `FluentAPI.getChapterSourceAudio` (`api.ts:473`) via `useSourceAudio` | Yes (`SourceAudioPlayerBar`) | Yes if prepared; otherwise signed URLs that expire | Whole chapter file (Q12) |
| Other tracks | Missing | Not found in app, web or API | No | No | Q11 |
| Waveform bar heights | Static | Decorative, like Legacy `PlaybackProgressBar` | Yes (decorative) | n/a | Q14 |
| Played bars, playhead, seek | Wired | `useSourceAudio` `positionMs` / `durationMs` / `seek` on `usePlaybackEngine` | Yes (`SourceAudioPlayerBar.tsx:165-178`) | Yes when downloaded | Chapter-relative; rebase to the pericope |
| Verse segments and chips | Wired, partial | `subdivisionTickMarks` (`bibleTabUnits.ts:183`) from `verseTimestamps` | Yes (ticks on the source dock, #408) | Yes when downloaded | Start times only (Q12) |
| Reference "Mark 14:22–25" | Wired | `pericopeTitle()` range builder (`bibleTabUnits.ts:69`, a different thing from the DB title above) | Yes | Yes | n/a |
| Page dots | Static (derived) | Would be computed from `bodyVerses` | No | Yes | Q16 |
| Play / Pause | Wired | `SourceAudioShell` `handlePlayPause` (`SourceAudioShell.tsx:125`) | Yes | Yes when downloaded | Keep the draft/source exclusivity bridge (`SourceAudioShell.tsx:263`) |
| Previous / Next | Wired (as unit nav) | `RecordTab.tsx:427-450` pericope prev/next; selecting a verse seeks to its start | Yes (Record tab) | Yes | Q17 |
| Mode toggle (Listen / Record) | Wired (equivalent) | Hardware panel `recordMode` / `modeLocked` (on `jskager/feature/695-hardware-panel`); Legacy is the Bible → Record tab switch (`DraftingScreen.tsx:471`) with the capture-leave guard (`:110`) | Yes (as tabs) | Yes | Lock while capturing, same as today |
| Understanding variant notes | Wired | `useTranslationNotesForUnit` → `GET /projects/{projectId}/translation-resources/notes/{bookCode}/{chapter}/{verse}` | Yes (Resources tab) | Partial (#578 still open) | Q19 |
