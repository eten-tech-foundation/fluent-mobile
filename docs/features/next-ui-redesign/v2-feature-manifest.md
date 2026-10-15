# v2 feature manifest

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
| **Effort** | Mobile work for one developer, rough: **S** ≤ 1 day · **M** 2–4 days · **L** 1–2 weeks · **XL** 2+ weeks |

Effort assumes the Next UI foundations already in review (#693, #698, #699,
#700) and the Listen player prototype have landed. It covers UI and wiring to
existing hooks, not backend work.

## The headline

- **Most of v1 has no v2 design yet.** Figma covers the drafting flow (pericope
  list, pericope screen, player, recorder, notes). Login, Home, My Work,
  Milestones, Sync, Prepare for Offline and Settings have no v2 frames.
- **Flipping the UI version doesn't reskin the app yet.** 76 of the 100 UI files
  on `main` style themselves with the static Legacy theme, and only 4 read the
  runtime theme. Every screen needs migrating to `useThemedStyles` before Next
  shows up on it, redesign or not.
- **The backend covers almost all of v1.** Mobile calls 24 of 127 operations.
  The gaps are in what v2 adds: FIA step tracks, listened progress, word-level
  timing and a persistent player.
- **Rough total:** about 9–14 weeks of mobile work for one developer, in three
  phases (see [Effort and phasing](#effort-and-phasing)), plus backend work for
  the new v2 features.

## 1. Feature manifest (v1)

### Auth and accounts

| Feature | What we need to support | v2 design | Backend | Effort |
| --- | --- | --- | --- | --- |
| Launch and session restore | Open straight to the last signed-in account, offline included, with loading and error states | — | Local | S |
| Email login | Email and password, inline validation, show/hide password, a clear offline message | — | Wired: `POST /api/auth/sign-in/email`, `GET /users/email/{email}` | S |
| First-login sync | "Syncing…" until My Work is ready, then the rest of the catalog in the background | — | Wired (full sync) | S |
| Forgot password | Send a reset email, with Resend and Back to login | — | Wired: `POST /api/auth/forget-password` (the reset itself happens on web) | S |
| Session expired | Keep local data, show a banner, re-enter the password only, then sync | — | Wired | S |
| Log out | Warn about unsynced recordings, sign out, switch to another account on the device | — | Wired: `POST /api/auth/sign-out` | S |
| Multiple accounts | Up to 3 accounts per device: add, switch (not while recording), initials chip in the drafting header, takes credited to the account that recorded them | — | Wired + Local | M |

### Home and navigation

| Feature | What we need to support | v2 design | Backend | Effort |
| --- | --- | --- | --- | --- |
| Home shell | Drawer menu, sync status, Milestones and My Work tabs (My Work first) | — | Wired | M (needs an IA decision) |
| My Work | Chapters assigned to me (drafter or peer checker) with stage, sync state, ownership, last activity and a source-text download ring; pull to refresh | — | Wired. Available: `GET /projects/{id}/workflow-stages` for real stage labels | M |
| Milestones and chapter list | Milestones I belong to, then every chapter in one, with stage, sync, ownership and conflict icons; an "unassigned" state | — | Wired. Available: `GET /projects/{id}/chapter-assignments/progress` | M |
| Sync status icon | A cloud in every header (synced, syncing, pending, failed, offline) that opens Sync | — | Wired: `GET /health` | S |
| Drawer and legal pages | Settings, Privacy Policy, Terms, the device's accounts, Add user, Log out | — | Local | S |

### Ownership and claims

| Feature | What we need to support | v2 design | Backend | Effort |
| --- | --- | --- | --- | --- |
| Ownership and claims | Mine / someone else / unassigned icons; a warning (not a block) when someone else holds the chapter; the first recording claims an unassigned chapter, queued if offline | — | Wired: `POST /chapter-assignments/{id}/claim`. Available: `POST/DELETE …/presence` to warn about someone working right now | M |
| Conflicts | Flag claim races and take version conflicts; block stage advance while one is open | — | Wired. Available: `POST /verse-audio/{puid}/{btid}/resolve` (web resolves today) | M |

### Drafting (Listen and Record)

This is where v2 changes the structure: v1's Bible / Resources / Record tabs
become a chapter's pericope list → a pericope screen (tracks, Listen / Record,
Resources, Images) → the player and recorder.

| Feature | What we need to support | v2 design | Backend | Effort |
| --- | --- | --- | --- | --- |
| Chapter screen | Open on the first unrecorded unit, remember the last view per chapter, and confirm before leaving mid-recording | ✅ (new structure) | Wired | L |
| Verse and pericope lists | Units with recorded / partial / unrecorded state; verse or pericope mode per user; a fallback when pericopes aren't available | ✅ pericope list | Wired. Titles only in FIA, and the Figma example matches neither shipped set (Q15, Q18) | M |
| Source audio | Play, pause, scrub, verse position, source label; loading, "no audio" and retry states; offline playback when prepared; stops when recording | ✅ Listen player (prototype built) | Wired: `GET /projects/{id}/source-audio/…`. Available: `GET …/playback-audio/…` (verse end times, licence, TTS permission), TTS when no recording exists | L |
| Reading along | Highlight what's being read and keep it in view | ✅ word highlight + scrolling text | Verse-level only. Missing: word timing (Q10) | M |
| Resources | Translation notes, questions, images and maps for the selected verse or pericope, offline when downloaded | ◐ Understanding notes view, Resources and Images entries | Wired: `…/translation-resources/notes`, `questions`, `images`. Available: verse-range resources (fluent-api #389), Aquifer search and Guides | M–L |
| Unit navigation | Previous / next unit with reference and pericope title | ✅ Hardware panel keys (built) | Local | S |
| Recording | Record, pause, resume, stop; mic permission with a Settings link; live waveform and timer; error alerts | ✅ recorder, Level wave (built) | Local. Live mic levels need metering turned on (Q6) | M |
| Crash recovery | Pause when the app is backgrounded; offer to resume or discard a paused take after a crash | — (needs a v2 dialog) | Local | S |
| Recording gates | Wait for source text, block on Complete, block the drafter during open Peer Check | — (states need design) | Local | S |
| Takes | Up to 5 per unit: play one at a time, seek, pick the one to submit, delete, record another | ✅ take cards, stacking, delete, mark official | Local (only the picked take uploads). Available: `GET /verse-audio` to list and download server takes | L |
| Shared-device takes | All Takes view when another account on the device recorded the unit; mark one canonical (device only) | ◐ "Select canonical take", "Marked official" | Local. Available: resolve endpoint | M |
| Verse and pericope takes together | Label take types; a pericope take covers its verses; verse takes play stitched in pericope view | — | Local. Pericope uploads use `PUT /verse-audio/{puid}/range`, which isn't merged in fluent-api yet (#391) | M |

### Workflow

| Feature | What we need to support | v2 design | Backend | Effort |
| --- | --- | --- | --- | --- |
| Send to the next stage | Appears once every unit is recorded; confirm sheet; blocked by conflicts or takes that can't upload | — | Wired: `PATCH /chapter-assignments/{id}/submit`. Offline advances aren't queued (#257) | M |
| Stage badges | Not Started → Draft → Peer Check → Community Review → Linguist / Theological / Consultant Check → Complete | — | Labels are hard-coded. Available: `GET /projects/{id}/workflow-stages` | S |

### Sync, offline and downloads

| Feature | What we need to support | v2 design | Backend | Effort |
| --- | --- | --- | --- | --- |
| Sync page | Status line, chapters uploaded, pause / resume / cancel / sync now, failure reasons, the cellular setting | — | Wired | M |
| Automatic upload | Upload picked takes on Wi-Fi (or cellular if allowed), retry quietly, keep going in the background with a progress notification | n/a (system UI) | Wired: `PUT /verse-audio/…` | S |
| Prepare for offline | Auto-prompt for low-connectivity projects; pick a project and chapters; resource tiers with sizes and Customize; download queue with pause / resume / cancel; manage device storage | — | Wired: `…/translation-resources/manifest`, `…/source-audio/manifest` | L |

### Settings

| Feature | What we need to support | v2 design | Backend | Effort |
| --- | --- | --- | --- | --- |
| Settings | UI version, Prepare for offline, cellular uploads, verse or pericope drafting, clear cache, add user, log out, session expired | — | Local | M |

## 2. New in v2

Things the Figma designs add that v1 doesn't do.

| Feature | What it needs | v2 design | Backend | Effort |
| --- | --- | --- | --- | --- |
| FIA step tracks | Each pericope lists steps (Hear & Heart, Setting the Stage, Defining the Scenes, Embodying the Text, …) to listen to before recording | ✅ | **Missing.** No endpoint names these steps; Aquifer Guide content is the likely source, unconfirmed (Q11) | L, once the data exists |
| Listened progress | A progress ring per track showing how much you've heard | ✅ | **Missing** (Q13). Could ride on `…/editor-state` or `/self/settings` with an API change | M |
| Now playing bar | Audio keeps playing in a mini player when you leave the player | ✅ | Local, but needs an app-level player (Q9) | L |
| Word and phrase highlight | Highlight the spoken word and its phrase | ✅ | **Missing** word timing (Q10); verse-level in v1 | M (verse-level now) |
| Understanding view | Notes tied to the phrase being read | ✅ | Wired per verse; per-phrase mapping not checked | M |
| Pericope titles as headings | The pericope list and player header lead with titles | ✅ | Partial (Q15, Q18) | S |

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
| Nice to have | Waveform peaks, push notifications, take comments and review (#451, #703) |

### Found along the way

- **Likely bug:** once a conflict is resolved on web, the API marks the verse
  `resolved`, but mobile only accepts `clean` or `conflict`
  (`src/services/verseAudioContract.ts:86-88`). Re-recording that verse would
  probably fail to sync. Not reproduced yet.
- **Coverage script:** `npm run api:coverage` reports 28 operations called;
  the real number is 24, because it ignores the HTTP method and matches paths
  in comments.

## Effort and phasing

| Phase | What | Rough effort |
| --- | --- | --- |
| 0. Foundations | Tokens, type styles, Key, Switch, Round button, Progress ring, Waveform, Level wave, Hardware panel, Word | Done or in review |
| 1. Reskin the rest | Migrate the remaining screens (auth, Home, My Work, Milestones, Sync, Prepare for offline, Settings) to the runtime theme and Next components, keeping today's layout. Needs a light design pass, since these have no v2 frames | 2–3 weeks |
| 2. Drafting flow | Pericope list → pericope screen → player → recorder → resources, wired to the hooks v1 already uses; the UI-version branch point (Q8) | 4–6 weeks |
| 3. New v2 features | FIA step tracks, listened progress, Now playing bar, server takes, adopting `playback-audio` | 3–5 weeks, gated on backend answers |

Phases 1 and 2 can run in parallel with two people. These are planning
estimates from code size and the work so far, not team velocity, so treat
them as ranges to refine as each phase gets tickets.

## Known v1 issues that carry over

Fix these regardless of v2, since v2 reuses the same logic:

- Offline stage advances aren't queued and can be reverted by the next sync (#257).
- Only the picked take reaches the server, changing the pick doesn't sync (#701), and deleting a take doesn't remove the uploaded audio.
- Takes recorded since #567 play silence on Xiaomi devices (#707, High).
- "Maximum update depth exceeded" during Record tab playback (#569).
- The Prepare for Offline Download button disappears when a chapter is selected (#702).
- The Privacy Policy is placeholder text.
