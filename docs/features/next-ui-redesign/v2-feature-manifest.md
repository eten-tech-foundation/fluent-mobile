# v2 feature manifest

> **Historical plan, written 2026-10-15.** The tables record what the app did
> then and what the redesign was drawn to add. Current routing, theme, and
> recovery: [Next UI](README.md) and [theme](../../guides/ui-version-theming.md).
> The route map after #916–#920 is the [retirement checklist](retirement-checklist.md).

Inventory of the October 2026 app, the Figma frames, and the backend, plus a
rough effort guess for moving each piece. Built from `origin/main` at
`fd4b966`, the fluent-api OpenAPI (v26.10.00, 127 operations), fluent-web
`main`, and the Figma file's My Work, Listen and Record pages. Sentences
below that tell you to branch a route by UI version, freeze a removed screen,
or open classic drafting for Send are that plan. The shipped app does none of
those.

Open design, product and API questions live in
[open-questions.md](open-questions.md) (PR #697); this doc refers to them by
ID.

## How to read the tables

| Column | Values |
| --- | --- |
| **v2 design** | ✅ designed in Figma · ◐ partly (a pattern or one state exists) · — none yet |
| **Backend** | **Wired** (mobile already calls it) · **Available** (fluent-api has it, mobile doesn't call it) · **Missing** (no endpoint) · **Local** (device only) |

## The biggest gaps

Ranked on 2026-10-15 by how much they blocked a full switch. Still-open API
and design gaps stay open in [open questions](open-questions.md). The route
and screen items were finished by #916–#920.

1. **No v2 design for most of the app (October).** Figma covered the drafting
   flow. Login, Home, My Work, Milestones, Sync, Prepare for Offline and
   Settings had no v2 frames, and neither did the drafting flow's dialogs and
   edge states (crash recovery, recording gates, conflicts, stage advance,
   empty and error states). Home, login, Sync, Prepare for offline, and
   Settings have since shipped on the shared theme. Do not draw a second
   version of them.
2. **The new v2 features have no backend.** The FIA step tracks and listened
   progress are the heart of the new pericope screen, and no endpoint provides
   either (Q11, Q13). The Figma example passage doesn't match the pericope sets
   the app ships (Q18). The biggest one is **Review**: voice comments recorded
   on the official take's timeline, taken in turns by reviewers. fluent-api
   has no comments, reviewers or review rounds at all, and the design differs
   from the comment tickets already filed (#451, #703; Q21–Q23).
3. **An app-level player (Q9) was the open call for audio that survives
   navigation.** The passage player is what shipped. Q9 stays in open
   questions if a bar across other screens is still wanted. Route files do
   not pick between two screens.
4. **Recording rules moved into shared hooks.** `RecordTab.tsx` is gone.
   The passage calls `useRecordCaptureLeaveGuard` and `useDraftingUploadHold`.
   There is no frozen second screen to keep in parallel.
5. **Bugs the passage still shares with the old logic.** Offline stage
   advances are queued and synced on reconnect (#257, #770). Changing the
   selected take syncs (#701, #723), and takes other than the selected one
   upload (#716, #828). The October inventory also lists takes playing silent
   on Xiaomi (#707) and pericope uploads against fluent-api #391. Re-check
   those issues before treating them as open or fixed.

What was not a gap in October: listening, reading, recording, takes,
resources, and stage advance already had backend support. They now run on
the passage and the shared hooks.

## Routes

Shipped shape, replacing the October "pick a screen by UI version" plan. A
separate `/v2` route tree was tried and dropped in the #727 review. The
version branch inside the same path was removed in #917–#920.

Product screens live in `src/app/v2/screens/`. The route file re-exports one
screen, so params, the back stack, and `hrefs` stay on the existing paths.
Home, the book page, the passage, and Observer are those screens.
`verse-detail` adapts old URLs onto the passage or Observer. Settings, Sync,
and Prepare for offline stay on their routes. Accounts open from the Home
avatar sheet; drawer swipe is off.

The passage calls the same auth, sync, upload, recording, source-audio, and
download services. Home still carries the download-repair sync, the Prepare
for offline auto-prompt, the reauth banner, and `newUserLoading` after adding
an account. The [retirement checklist](retirement-checklist.md) is the route
table.

## Screen triage and drafts

Drafts for everything without a v2 frame are on the Figma page
[V2 · Gap screens](https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2644-6),
built from the Foundations components plus a few proposed parts (button,
field, list row, banner, dialog, chapter chip, avatar).

| Needs its own screen | Folds into an existing v2 mock | Just a dialog or state |
| --- | --- | --- |
| Login (+ can't connect, check email, session expired) | Milestones and chapter lists → Home | Leave while recording |
| Home: my chapters | Stage, ownership, conflict, sync → row meta and headers | Recovered recording |
| Prepare for offline | Resources → pericope screen and Understanding | Microphone is off |
| Settings | Takes, All Takes, canonical → recorder take cards | Log out with unsynced work |
| Sync (as a sheet) | Unit navigation, source text → Hardware panel, reading view | Send to next stage |
| Accounts (as a sheet) | Session expired → banner on Home | Recorder can't record yet (text syncing, Complete, Peer Check) |

**Not ours to design:** the microphone and notification permission prompts
and the upload notification (Android), the splash screen and app icon
(assets only), finishing a password reset or accepting an invite (fluent-web
from the email link), and the Expo dev menu (dev builds only). v1's 17
confirm dialogs use Android's native alerts, so v2 needs its own Dialog.

## 1. Feature manifest (v1)

### Auth and accounts

| Feature | What we need to support | v2 design | Backend |
| --- | --- | --- | --- |
| Launch and session restore | Open straight to the last signed-in account, offline included, with loading and error states | — | Local |
| Email login | Email and password, inline validation, show/hide password, a clear offline message | — | Wired: `POST /api/auth/sign-in/email`, `GET /users/email/{email}` |
| First-login sync | "Syncing…" until My Work is ready, then the rest of the catalog in the background | — | Wired (full sync) |
| Forgot password | Send a reset email, with Resend and Back to login | — | Wired: `POST /api/auth/forget-password` (the reset itself happens on web) |
| Session expired | Keep local data, show a banner, re-enter the password only, then sync | — | Wired |
| Log out | Warn about unsynced recordings, sign out, switch to another account on the device | — | Wired: `POST /api/auth/sign-out` |
| Multiple accounts | Up to 3 accounts per device: add, switch (not while recording), initials chip in the drafting header, takes credited to the account that recorded them | — | Wired + Local |

### Home and navigation

| Feature | What we need to support | v2 design | Backend |
| --- | --- | --- | --- |
| Home shell | Drawer menu, sync status, Milestones and My Work tabs (My Work first) | — | Wired |
| My Work | Chapters assigned to me (drafter or peer checker) with stage, sync state, ownership, last activity and a source-text download ring; pull to refresh | — | Wired. Available: `GET /projects/{id}/workflow-stages` for real stage labels |
| Milestones and chapter list | Milestones I belong to, then every chapter in one, with stage, sync, ownership and conflict icons; an "unassigned" state | — | Wired. Available: `GET /projects/{id}/chapter-assignments/progress` |
| Sync status icon | A cloud in every header (synced, syncing, pending, failed, offline) that opens Sync | — | Wired: `GET /health` |
| Drawer and legal pages | Settings, Privacy Policy, Terms, the device's accounts, Add user, Log out | — | Local |

### Ownership and claims

| Feature | What we need to support | v2 design | Backend |
| --- | --- | --- | --- |
| Ownership and claims | Mine / someone else / unassigned icons; a warning (not a block) when someone else holds the chapter; the first recording claims an unassigned chapter, queued if offline | — | Wired: `POST /chapter-assignments/{id}/claim`. Available: `POST/DELETE …/presence` to warn about someone working right now |
| Conflicts | Flag claim races and take version conflicts; block stage advance while one is open | — | Wired. Available: `POST /verse-audio/{puid}/{btid}/resolve` (web resolves today) |

### Drafting (Listen and Record)

This is where v2 changes the structure: v1's Bible / Resources / Record tabs
become a chapter's pericope list → a pericope screen (tracks, Listen / Record,
Resources, Images) → the player and recorder.

| Feature | What we need to support | v2 design | Backend |
| --- | --- | --- | --- |
| Chapter screen | Open on the first unrecorded unit, remember the last view per chapter, and confirm before leaving mid-recording | ✅ (new structure) | Wired |
| Verse and pericope lists | Units with recorded / partial / unrecorded state; verse or pericope mode per user; a fallback when pericopes aren't available | ✅ pericope list | Wired. Titles only in FIA, and the Figma example matches neither shipped set (Q15, Q18) |
| Source audio | Play, pause, scrub, verse position, source label; loading, "no audio" and retry states; offline playback when prepared; stops when recording | ✅ Listen player (prototype built) | Wired: `GET /projects/{id}/source-audio/…`. Available: `GET …/playback-audio/…` (verse end times, licence, TTS permission), TTS when no recording exists |
| Reading along | Highlight what's being read and keep it in view | ✅ word highlight + scrolling text | Verse-level only. Missing: word timing (Q10) |
| Resources | Translation notes, questions, images and maps for the selected verse or pericope, offline when downloaded | ◐ Understanding notes view, Resources and Images entries | Wired: `…/translation-resources/notes`, `questions`, `images`. Available: verse-range resources (fluent-api #389), Aquifer search and Guides |
| Unit navigation | Previous / next unit with reference and pericope title | ◐ The book page's passages (whole chapters in verse mode, Q31). In pericope mode the Hardware panel's Previous / Next turn the player's pages instead; in verse mode they step verses, and Listen and Record both swipe verse pages (Q17, Q31) | Local |
| Recording | Record, pause, resume, stop; mic permission with a Settings link; live waveform and timer; error alerts | ✅ recorder, Level wave (built). Record pauses and resumes a take; Eject finishes it (Q3) | Local. Live mic levels need metering turned on (Q6) |
| Crash recovery | Pause when the app is backgrounded; offer to resume or discard a paused take after a crash | — (needs a v2 dialog) | Local |
| Recording gates | Wait for source text, block on Complete, block the drafter during open Peer Check | — (states need design) | Local |
| Takes | Up to 5 per unit: play one at a time, seek, pick the one to submit, delete, record another | ✅ take cards, stacking, delete, mark official | Local (only the picked take uploads). Available: `GET /verse-audio` to list and download server takes |
| Shared-device takes | All Takes view when another account on the device recorded the unit; mark one canonical (device only) | ◐ "Select canonical take", "Marked official" | Local. Available: resolve endpoint |
| Verse and pericope takes together | Label take types; a pericope take covers its verses; verse takes play stitched in pericope view | — | Local. Pericope uploads use `PUT /verse-audio/{puid}/range`, which isn't merged in fluent-api yet (#391) |

### Workflow

| Feature | What we need to support | v2 design | Backend |
| --- | --- | --- | --- |
| Send to the next stage | Appears once every unit is recorded; confirm sheet; blocked by conflicts or takes that can't upload | ◐ The confirm's Dialog (built, in the gallery); a Home alert card and a Send button on the book page's chapter header (Q29, not built) | Wired: `PATCH /chapter-assignments/{id}/submit`. Offline advances aren't queued (#257) |
| Stage badges | Not Started → Draft → Peer Check → Community Review → Linguist / Theological / Consultant Check → Complete | — | Labels are hard-coded. Available: `GET /projects/{id}/workflow-stages` |

### Sync, offline and downloads

| Feature | What we need to support | v2 design | Backend |
| --- | --- | --- | --- |
| Sync page | Status line, chapters uploaded, pause / resume / cancel / sync now, failure reasons, the cellular setting | — | Wired |
| Automatic upload | Upload picked takes on Wi-Fi (or cellular if allowed), retry quietly, keep going in the background with a progress notification | n/a (system UI) | Wired: `PUT /verse-audio/…` |
| Prepare for offline | Auto-prompt for low-connectivity projects; pick a project and chapters; resource tiers with sizes and Customize; download queue with pause / resume / cancel; manage device storage | — | Wired: `…/translation-resources/manifest`, `…/source-audio/manifest` |

### Settings

| Feature | What we need to support | v2 design | Backend |
| --- | --- | --- | --- |
| Settings | v1 listed UI version plus Prepare for offline, cellular uploads, verse or pericope drafting, clear cache, add user, log out, session expired. Shipped Settings keeps those controls except the UI version row (#916). | — | Local |

## 2. New in v2

Things the Figma designs add that v1 doesn't do.

| Feature | What it needs | v2 design | Backend |
| --- | --- | --- | --- |
| FIA step tracks | Each pericope lists steps (Hear & Heart, Setting the Stage, Defining the Scenes, Embodying the Text, …) to listen to before recording | ✅ | **Missing.** No endpoint names these steps; Aquifer Guide content is the likely source, unconfirmed (Q11) |
| Listened progress | A progress ring per track showing how much you've heard | ✅ | **Missing** (Q13). Could ride on `…/editor-state` or `/self/settings` with an API change |
| Now playing bar | Audio keeps playing in a mini player when you leave the player | ✅ | Local, but needs an app-level player (Q9) |
| Word and phrase highlight | Highlight the spoken word and its phrase | ✅ | **Missing** word timing (Q10); verse-level in v1 |
| Understanding view | Notes tied to the phrase being read | ✅ | Wired per verse; phrases placed by matching the note's quote in its verse (#873, Q19) |
| Pericope titles as headings | The pericope list and player header lead with titles | ✅ | Partial (Q15, Q18) |
| Official take card | The take marked official shows as a blue (Accent) card with a Review chip: "Open" before anyone reviews, the comment count after | ✅ (Foundations › 10 · Review, Record page R&R 01, 10) | Partial. Mobile marks the official take on the device only; changing it doesn't sync (#701) |
| Review | From the official take, reviewers take turns: listen, play earlier comments, record a voice comment at a point on the timeline, pass to the next reviewer; the translator hears them all last. Earlier review rounds can be shown | ✅ (Record page › Record & Review – states, 10 frames) | **Missing.** No comments, audio comments, reviewer seats, turn order or review rounds in fluent-api (Q21–Q23) |

## 3. Backend parity

### Mobile can adopt today (no API work)

| Endpoint | What it gets us |
| --- | --- |
| `GET /projects/{id}/playback-audio/{book}/{chapter}` | Verse end times (cleaner pericope windows), licence notices, whether TTS is allowed. fluent-web already uses it |
| `POST /ai/tts/generate` + `GET /ai/tts/audio/{file}` | Spoken source text when no recording exists |
| `GET /verse-audio?projectUnitId&bibleId&bookId&chapterNumber` | List and download every take in a chapter: restore after reinstall, peer check listening, a real All Takes view |
| `POST /verse-audio/{puid}/{btid}/resolve` | Resolve take conflicts in the app instead of on web |
| `GET /projects/{id}/workflow-stages` | Real stage names and order instead of hard-coded ones |
| `GET/PUT /chapter-assignments/{id}/editor-state` | Resume where you were on another device |
| `POST/DELETE /chapter-assignments/{id}/presence` | Warn when someone else is in the chapter |
| `GET /config/features` | Server-side feature flags. The app does not use this to choose a UI |

### Needs API work

| Need | Ask |
| --- | --- |
| FIA step content | Confirm whether Aquifer Guide resources hold the step audio and text per pericope, or define where they come from (Q11) |
| Listened progress | Somewhere to store it per user and track (Q13) |
| Word or phrase timing | Alignment data for source audio (Q10). Optional for v1 of v2 |
| Pericope takes | Merge `PUT /verse-audio/{puid}/range` (fluent-api #391) |
| Verse-range resources | Merge fluent-api #389 |
| Removed from last project | Merge fluent-api #392 so sync doesn't hit a 403 |
| Review | A data model for review rounds on a take: reviewers, turn order, voice comments with a timestamp and audio upload, who has heard what. Shape depends on Q21 (one phone or many) |
| Nice to have | Waveform peaks, push notifications (likely needed if review is multi-device: "your turn") |

### Found along the way

- **Likely bug:** once a conflict is resolved on web, the API marks the verse
  `resolved`, but mobile only accepts `clean` or `conflict`
  (`src/services/verseAudioContract.ts:86-88`). Re-recording that verse would
  probably fail to sync. Not reproduced yet.
- **Unused Next components:** `TrackRow` and `LevelWave` have no callers
  outside their tests now (the book page uses Passage cover, and the take
  card draws with `Waveform`). Their gallery entries are gone; deleting the
  components and their tests is a follow-up.
- **One waveform:** `Waveform` covers playback and live recording, so it
  stays the only one and `LevelWave` goes. Smaller places, like a button
  showing playback or the mic level once you leave the player, get a compact
  size on `Waveform` that scales the row and bar heights together. Add it
  with the first button that needs it, not before.
- **Coverage script:** `npm run api:coverage` reports 28 operations called;
  the real number is 24, because it ignores the HTTP method and matches paths
  in comments.

## Effort, with agentic coding

Measured from this week's work: on Oct 13–14, the agentic workflow (Claude
building, a designer directing and reviewing) produced nine components, the
type styles and a clickable Listen player, about 4,200 lines with two review
passes each, in roughly a day and a half of sessions. Code isn't the
bottleneck. These are:

- **Design decisions.** Anything without a Figma frame waits on a designer.
- **PR review.** #639 took three days in review; #693 has been open since
  Oct 13. At that pace review, not building, sets the calendar.
- **Device QA.** Haptics, audio, recording and older Android versions need a
  person with a phone, on the nightly.
- **Backend answers** for the v2-only features.

| Phase | What | Agent work | Calendar, if review keeps up |
| --- | --- | --- | --- |
| 0. Foundations | Tokens, type styles, the core components | Done | Waiting on #693, #698, #699, #700 |
| 1. Everything without v2 frames | Build the drafted screens and dialogs (V2 · Gap screens) as new v2 routes on v1's hooks; promote the proposed parts to Foundations components | 2–3 days | 1–2 weeks (design sign-off on the drafts, ~6 PRs) |
| 2. Drafting flow | Lift RecordTab and DraftingScreen rules into shared hooks; then pericope list → pericope screen → player → recorder → resources as v2 routes | 3–5 days | About 2 weeks (device QA on audio and recording) |
| 3. New v2 features | FIA tracks, listened progress, Now playing bar, server takes, `playback-audio` | 1–2 days each once data exists | Set by the backend |
| 3b. Review | Build Seat, Thread turn, review controls and Review chip as components; the Review screen on the recording engine and player v1 already has | 3–5 days | Set by the review backend, the largest new API domain in v2 |

**Total: about 3–5 weeks on the calendar** to have the app on v2, minus the
backend-gated features, if PRs are reviewed within a day and design keeps
pace. If reviews take three days like #639, plan on double.

Where agents are weakest here, so it's worth a human eye: native audio
behaviour (audio focus, the foreground upload service, crash recovery), and
anything that only shows up on specific hardware, like #707. The rule that
keeps this safe is the one the screens already follow: reuse v1's hooks and
services, don't rewrite them.

## Summit MVP

Summit: second week of November 2026. Hard freeze: end of October (merged to
`main` by Fri Oct 30). The MVP is the translator's core loop in the v2
interface: open a chapter, listen to a passage, read along, record, play it
back, and have it upload. Everything else stays in v1, reachable from the v2
avatar.

| Capability | v1 today | MVP work |
| --- | --- | --- |
| Sign in, pick a chapter | ✅ | Keep v1 login; v2 Home on `useMyWorkChapters` |
| Listen to a passage | ✅ chapter audio, verse seek when timestamps exist | Wire the player prototype to `useSourceAudio`; stop at the pericope's end |
| Read along | ✅ verse highlight | Verse-level highlight (Q10) |
| Tap to hear (TTS) | ❌ | Only if the demo language has no recorded source audio |
| Record | ✅ | v2 recorder on `useVerseAudio` and the recording engine |
| Play back takes | ✅ | Take cards on the same hook |
| Upload in the background | ✅ | Reuse as is |
| Works offline at the venue | ✅ (Prepare for offline, #579) | Prepare demo phones in v1 beforehand |

**Cuts to fit the freeze:** the recording rules stay inside `RecordTab` until
after the summit (the v2 recorder calls the same hooks; sending to the next
stage stays in v1), and no TTS unless needed. Out of the MVP: FIA step tracks,
listened progress, word-level highlight, Review, the Now playing bar, and v2
versions of Settings, Sync and Prepare for offline.

| When | What |
| --- | --- |
| Oct 15–16 | Merge the foundations (#698 → #699 → #700 → #693). Pick the demo project and language. Raise the pre-freeze blockers below with the devs |
| Oct 19–21 | v2 Home as a route-leaf swap, pericope list, player on real source audio |
| Oct 22–23 | Word, recorder and takes, Hardware panel wiring, avatar links into v1 screens |
| Oct 26–28 | Device QA on the nightly, fixes, polish |
| Oct 29–30 | Buffer for last merges. Freeze |
| Nov 2–6 | Fixes only. Prepare demo phones offline, set them to Next, rehearse |

**MVP prerequisites:** a demo project on the FIA pericope set with recorded
source audio and verse timestamps (the Figma example doesn't match either
shipped set, Q18), and PR reviews turned around within a day. MVP work is
tracked here rather than as new GitHub issues.

## Existing issues

Open fluent-mobile issues and Project 4 items, triaged against the plan on
2026-10-15.

### Must land before the freeze

| Issue | Why it matters | Status |
| --- | --- | --- |
| #707 Silent playback of remuxed takes | Takes play silent on Xiaomi / Redmi phones | Open, assigned |
| #569 Max update depth during Record tab playback | PR #706 changes `usePlaybackEngine`, which the v2 player also uses | In PR review |
| #702 Prepare for Offline download button disappears | Needed to prepare the demo phones | Draft PR #705 |
| #483 Disk I/O error after a full offline sync on a device | Could hit the demo phones prepared for offline | Open, assigned |
| fluent-api #391 Pericope / verse-range take uploads | Without it, the demo records verse by verse | Open PR |

### In flight underneath v2

Low collision, since v2 only calls this code: #677 (resources offline, touches
`DraftingScreen`), #690 (sync on `/self` lists), #562 (Tier 2/3 resources in
Prepare for offline).

### Reshaped by the v2 designs

Settle these before anyone builds them:

- #451 comments and #703 comment counts vs. the Review design (Q23).
- #452, #505, #508 Observer view, My Work accordions and offline drafts: tied to
  who the reviewers are (Q22). #505 redesigns My Work, which v2 Home replaces.
- #408 Bible tab verse / pericope toggle (Passed QA in v1): v2 is
  pericope-first (Settings › Record by).
- Selected-take sync (#701, #723), upload of every take (#716, #828), and the
  offline stage-advance queue (#257, #770) shipped after this list was written.
  Next reads that queue for "waiting to send" on passage and book-page covers.
  Send is the passage title sheet (`passage-send`), not a second screen. The
  October note that Send lived in classic drafting is out of date (#908, #920).

### Workflows on the passage

The [retirement checklist](retirement-checklist.md) is the map. Classic
drafting and "Open in classic drafting" were removed in #920. `verse-detail`
only adapts old URLs onto the passage or Observer.

- **Send, resources, questions, and everyone's takes** are on the passage.
  Verse mode records in the player (Q31).
- **Observer** (`observer-draft`): an Observer's chapter opens read-only from
  Home and the book page, with the grant and membership re-checked at the tap.

The passage blocks and warns through the same shared rules:

- **Conflicts and uploads:** a sync conflict or takes that can't upload block
  Record. Home, Next up, and the book page show "Sync conflict" or "Upload
  pending", and Books count takes waiting to upload.
- **Ownership:** a chapter taken by someone else, an open Peer Check
  (Translator grant re-checked at the tap), and Observer chapters block or
  route through `chapterOpen`. Next up lists peer checks, open peer checks,
  and observed chapters under "Checking and observing". The book page names
  each chapter's stage and whose it is.
- **Recovery:** every paused take resumes on the passage page, in the unit it
  was saved in and on the verse it was keyed on, whatever the drafting setting
  (Q33).
- **Source text:** opening a passage repairs a blank language code and
  downloads missing text once when online.
- **Home:** milestones with no chapters still list, "recorded" counts chapters
  with takes, the accounts sheet has Privacy Policy and Terms of Use, and
  drawer swipe stays off.

### Hold until after the summit

- #536 Upgrade to Expo SDK 58 (unassigned). A framework upgrade near the
  freeze is the biggest schedule risk in the backlog.
- #691 bootsplash major and #499 Prettier 3 / TypeScript 7 are already
  deferred.
- Verse mode (Q31, #884): in pericope mode the verses recorded on
  their own have no tile in the take fan, so once a passage take is picked
  there's no way back to them there. A tile with a verses mark, which
  reselects each verse's take, would close that. It also fixes a full fan
  (5 passage takes) leading with take 1 while those verses are the draft.
- Passage page, no issue yet: resources go under the hero, in a new card,
  where the FIA listening materials were (Q11), until those have audio.

### Figma follow-ups

Foundations (`2308:6`) was synced with code on 11 Nov 2026: Jakarta and
Atkinson type styles with code's line heights and case, `space/20` and
`size/icon-20`, the screen header and Waveform patterns, Word Note and Note
dimmed, and stale masters moved to 11 · Not in the app. A new **V2 · As
built** page holds captures of every Next screen from the dev build (Home,
Accounts sheet, book page, passage, player Listen and Record, translation
note), so the design pages read as intent. Each design page carries a
"Design intent" note. What's left on the design frames:

- Screen header: Figma's Home, book page and note frames need the header
  padding (`space-20` sides, `space-12` above and below), the pinned header
  and a scrolled state with the `stroke/1` `shadow/edge` line. The pattern is
  in Foundations · 08.
- Waveform: the screens still use the Level wave and Progress dot (96
  instances). Code keeps only `Waveform`, so those should become a compact
  Wave bar once one exists.
- Passage row and Now playing: still on the screen pages (58 and 27
  instances), though the app has Passage covers and no Now playing bar.
- Gallery: the Dialog demo on 11 Nov was the player's take-pick confirm,
  while Figma's Dialog frame is the send confirm (2648-616). Send has since
  shipped on the passage title sheet.
- Word: the Word chip in notes is a space/2 shorter than its line, not a
  space/4.

### Elsewhere on Project 4

- fluent-web #422 (source audio in drafting, in progress) and the roadmap's
  "Text to Speech" item: mobile TTS would follow web.
- fluent-web #383 (audio review with take selection, In QA), #514 / #515 (take
  playback, Product Ready), and the roadmap's "Commenting on Audio" and "Audio
  Playback for Review": line up with Review.
- fluent-api #335 (assign the peer checker on submit, In QA): likely covers
  v1's open Peer Check gap.

Ours: #692, #694, #695, #696 (Next UI foundations). The Mobile Feature Audit
epic (#526) and its audits (#528–#534) are tracking chores with no effect on
the plan.

## After the summit

The Settings UI version switch was removed (#916). The app does not read a
feature flag to choose a second UI. The nightly APK (QA API) and the
Play internal track are still who has the app. Connectors land on `main` as
normal PRs. A new persisted shape still needs a migration.

Listen plays the chapter's source audio on the passage. FIA and other
material tracks are not connected (no API yet). Unfinished areas stay
unbuilt and linked from [open questions](open-questions.md). They do not open
another screen.

PRs that touch `src/app/v2/`, `src/components/ui`, the gallery, or shared
hooks get the normal review. Shared hooks and services are the product path.

## Known issues that carry over

The passage reuses the same logic. Status below is the October writeup and
was not re-checked for this doc:

- Offline stage advances are queued and pushed on reconnect (#257, #770). The
  passage shows that pending row as waiting to send. Confirming a sendable
  row is the title sheet (`passage-send`).
- Take upload is no longer selected-only, and deleting an uploaded take syncs
  (#716, #828). Changing the selected take syncs (#701, #723).
- Takes recorded since #567 play silence on Xiaomi devices (#707, High).
- "Maximum update depth exceeded" during Record tab playback (#569).
- The Prepare for Offline Download button disappears when a chapter is selected (#702).
- The Privacy Policy is placeholder text.
