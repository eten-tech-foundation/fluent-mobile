# v2 feature manifest

> **Working draft.** This plan changes as we prototype, review and test on
> devices. See the [Next UI README](README.md) for the current approach.

What the app does today (v1, "Legacy"), what v2 has designs for, what the
backend supports, and roughly what it takes to move each piece to v2. Built
2026-10-15 from `origin/main` at `fd4b966`, the fluent-api OpenAPI (v26.10.00,
127 operations), fluent-web `main`, and the Figma file's My Work, Listen and
Record pages.

Open design, product and API questions live in
[open-questions.md](open-questions.md) (PR #697); this doc refers to them by
ID.

## How to read the tables

| Column | Values |
| --- | --- |
| **v2 design** | ✅ designed in Figma · ◐ partly (a pattern or one state exists) · — none yet |
| **Backend** | **Wired** (mobile already calls it) · **Available** (fluent-api has it, mobile doesn't call it) · **Missing** (no endpoint) · **Local** (device only) |

## The biggest gaps

Ranked by how much they block a full switch to v2.

1. **No v2 design for most of the app.** Figma covers the drafting flow. Login,
   Home, My Work, Milestones, Sync, Prepare for Offline and Settings have no v2
   frames, and neither do the drafting flow's dialogs and edge states (crash
   recovery, recording gates, conflicts, stage advance, empty and error
   states). Agents can build these quickly, but shouldn't invent the design.
2. **The new v2 features have no backend.** The FIA step tracks and listened
   progress are the heart of the new pericope screen, and no endpoint provides
   either (Q11, Q13). The Figma example passage doesn't match the pericope sets
   the app ships (Q18). The biggest one is **Review**: voice comments recorded
   on the official take's timeline, taken in turns by reviewers. fluent-api
   has no comments, reviewers or review rounds at all, and the design differs
   from the comment tickets already filed (#451, #703; Q21–Q23).
3. **One architecture call blocks the Now playing bar.** An app-level player
   so audio survives navigation (Q9). Where v2 branches from Legacy (Q8) is
   settled: one signed-in shell, with route files picking the Legacy or Next
   screen.
4. **Recording rules live inside the v1 screen.** v2 gets its own screens and
   Legacy screens stay frozen (see [v2 routes](#v2-routes)), so the 76 Legacy-styled files
   don't need migrating. But `RecordTab.tsx` (1,785 lines, 17 effects, 6
   alerts) holds the stage-advance rules, recording gates and take handling,
   and `DraftingScreen` holds the leave-while-recording guard. Those move into
   shared hooks both versions call, so v2 reuses them instead of copying them.
5. **v1 bugs v2 inherits.** The drafting flow reuses v1's logic, so these come
   along: offline stage advances aren't queued (#257), only the picked take
   uploads and changing it doesn't sync (#701), takes play silent on Xiaomi
   (#707), and pericope uploads target an unmerged endpoint (fluent-api #391).

What isn't a gap: drafting itself. Listening, reading, recording, takes,
resources and stage advance all work in v1, and the backend supports them.
Moving them to v2 is wiring the new screens to the hooks v1 already has.

## v2 routes

One signed-in shell, the existing `(app)` drawer and stack. v2 screens live in
`src/app/v2/screens/`, and route files pick the Legacy or Next screen by UI
version at the same path, so params, back stack and every "go home" keep
working. Screens only v2 has (the chapter's passages, the player) get new
route files under `(app)` that only Next links to. Legacy screens don't change.
This follows the #727 review; a separate `/v2` route tree was tried and dropped.

- **Shared logic, not shared UI.** Both versions call the same hooks and
  services (auth, sync, uploads, recording engine, source audio, downloads).
  That's where the backend is wired today, so v2 screens get it for free.
  Bible, Resources, My Work and Prepare for Offline are already thin over hooks.
- **The one Legacy change:** lift the rules inside `RecordTab` and
  `DraftingScreen` into shared hooks (stage advance, recording gates, takes,
  leave guard), with Legacy calling them unchanged and the existing tests
  proving it.
- **Shared destinations stay as they are** (Settings, Sync, Prepare for
  offline, the drawer) until a v2 version replaces that route's screen.
- **Legacy Home behaviors v2 Home needs too:** the download-repair sync
  (`needsDownloadSync`), the Prepare for offline auto-prompt, the reauth
  banner, and the loading state after adding an account (`newUserLoading`).
- **Cost:** two UIs until Legacy is deleted. Logic fixes land in both; UI
  fixes don't.

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
| Unit navigation | Previous / next unit with reference and pericope title | ◐ The book page's passages. In pericope mode the Hardware panel's Previous / Next turn the player's pages instead; in verse mode they'll jump verses (Q17, Q28) | Local |
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
| Settings | UI version, Prepare for offline, cellular uploads, verse or pericope drafting, clear cache, add user, log out, session expired | — | Local |

## 2. New in v2

Things the Figma designs add that v1 doesn't do.

| Feature | What it needs | v2 design | Backend |
| --- | --- | --- | --- |
| FIA step tracks | Each pericope lists steps (Hear & Heart, Setting the Stage, Defining the Scenes, Embodying the Text, …) to listen to before recording | ✅ | **Missing.** No endpoint names these steps; Aquifer Guide content is the likely source, unconfirmed (Q11) |
| Listened progress | A progress ring per track showing how much you've heard | ✅ | **Missing** (Q13). Could ride on `…/editor-state` or `/self/settings` with an API change |
| Now playing bar | Audio keeps playing in a mini player when you leave the player | ✅ | Local, but needs an app-level player (Q9) |
| Word and phrase highlight | Highlight the spoken word and its phrase | ✅ | **Missing** word timing (Q10); verse-level in v1 |
| Understanding view | Notes tied to the phrase being read | ✅ | Wired per verse; per-phrase mapping not checked |
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
| `GET /config/features` | Server-side feature flags for v2 rollout |

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
- #701 selected-take sync and #257 offline stage advance: not MVP, but Review
  needs #701.

### Hold until after the summit

- #536 Upgrade to Expo SDK 58 (unassigned). A framework upgrade near the
  freeze is the biggest schedule risk in the backlog.
- #691 bootsplash major and #499 Prettier 3 / TypeScript 7 are already
  deferred.

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

## v2 as a beta

After the summit, v2 stays in the app as a beta so backend hooks and
connectors can land a little at a time.

- **Gate:** the Legacy / Next toggle in Settings (default Legacy), labelled
  "Next (beta)". Later, `GET /config/features` can turn it on per user or
  project from the server.
- **Who gets it:** the team on the nightly APK (QA API), and wider testers on
  the Play internal track, which is the only place production builds go today.
- **Safe to switch back and forth:** v2 writes through the same hooks and
  services as v1, so a take recorded in v2 shows up in v1. A connector that
  writes a new shape of data needs a v1 read path or a migration first.
- **Connectors land on `main` behind the toggle**, one small PR each: the
  endpoints mobile can adopt today first, then the API work as it ships.
- **Unfinished areas** link to the v1 screen rather than show an empty v2 one.
- **Review contract:** PRs that only touch v2 screens, `src/components/ui`, the
  gallery or docs get a light review, since Legacy users can't reach them.
  PRs that touch shared hooks or services get the normal review. Needs the
  team's OK.

### Before a public release

- Make v2 the default, then retire the toggle and the Legacy routes.

## Known v1 issues that carry over

Fix these regardless of v2, since v2 reuses the same logic:

- Offline stage advances aren't queued and can be reverted by the next sync (#257).
- Only the picked take reaches the server, changing the pick doesn't sync (#701), and deleting a take doesn't remove the uploaded audio.
- Takes recorded since #567 play silence on Xiaomi devices (#707, High).
- "Maximum update depth exceeded" during Record tab playback (#569).
- The Prepare for Offline Download button disappears when a chapter is selected (#702).
- The Privacy Policy is placeholder text.
