# #915 — Migrate Maestro journeys to Next

Status: implementation plan. Not a runtime change until the PR lands.
Part of [#894](https://github.com/eten-tech-foundation/fluent-mobile/issues/894).
Ticket: [#915](https://github.com/eten-tech-foundation/fluent-mobile/issues/915).
Branch: `jonathanseehagen/chore/915-migrate-e2e-journeys`.

One ticket, one PR. Implement in slices on that branch. Do not split into
stacked PRs. Do not remove Legacy screens in this PR.

## What this is

Maestro YAML still clicks Legacy chrome (`home-tab-my-work`, `drafting-tab-bar`,
`record-start-button`). The app default is already Next (`DEFAULT_UI_VERSION =
'next'`). After login, those selectors miss.

This ticket retargets the journeys at Next Home / Book / Passage / Observer,
covers the same workflows, and records Pass / Fail / Blocked. It can close
**before** [#916](https://github.com/eten-tech-foundation/fluent-mobile/issues/916)
and [#917](https://github.com/eten-tech-foundation/fluent-mobile/issues/917).
Those tickets remove the version switch and classic routes.

Workflow map: [retirement-checklist.md](retirement-checklist.md) (#907).
How to run Maestro: [guides/maestro.md](../../guides/maestro.md).

## What this is not

| Later ticket | What it does |
| --- | --- |
| #916 | Migrate saved UI choice; remove the Settings version switch |
| #917 | Startup and links through Next only |
| #919 | Delete unused Legacy Home / book modules |
| #920 | Delete classic drafting |

No new test framework, no CI redesign, no fixture mutations, no dropping
domain/service unit tests.

## Rule: do not delete a scenario to stay green

A Maestro flow is a user journey (login, open a chapter, record, play, delete,
Observer, Send). Green means that journey still ran against Next.

Wrong: delete `record-stop-play-delete.yaml`, comment out the Record assert,
wrap it in a `when:` that never appears, or tap `passage-classic` so Legacy
chrome makes the test pass.

Right: keep the flow, point it at the Next `testID`. If the control or fixture
is missing, record **Blocked** (or Fail) with a follow-up — not a no-op. A
scenario only disappears with an explicit ticket-level waiver and a linked
issue.

## Current state (2026-11-26)

- Next surfaces for #908–#914 have merged PRs. GitHub issues stay open for QA.
- Maestro YAML is retargeted at Next (`home-header`, `passage-record`,
  `observer-screen`, …). Journeys must not switch into Legacy or tap
  `passage-classic`. Settings still has `settings-ui-version` (#916).
- Device evidence for slices 3–6 is on this branch (uncommitted YAML + one
  commit on `jonathanseehagen/chore/915-migrate-e2e-journeys`). PR is not open.

## Implementation tracker

Tick the item when the **YAML** is retargeted at Next. After the Device
label, write `pending` / `Pass` / `Fail` / `Blocked` / `waived` and a date.
Do not tick if the flow still requires Legacy tabs, `drafting-tab-bar`,
`record-start-button`, `passage-classic`, or a Settings switch into Legacy.

`Blocked` is valid progress (fixture/media/control missing). Deleting the
item to stay green is not.

### Slices

- [x] **1 — Inventory** — mapping confirmed on device (selector sketch + slices 3–6)
- [x] **2 — Shared helpers** — YAML retargeted; Device: pending
- [x] **3 — Auth + navigation** — YAML retargeted; Device: Pass 2026-11-25/26 except logged-out existing-session pending and empty-assignments Blocked (Account B has Next up)
- [x] **4 — Capture / recovery / leave guards**
- [x] **5 — Resources, review, Observer, Send** — YAML retargeted; Device: Pass 2026-11-26 on Passage chrome / resources / Listen; Blocked on Observer, Send (0 takes), ownership labels, populated/empty resource fixtures
- [x] **6 — Offline, sync, accounts, edges** — YAML retargeted; Device: Pass 2026-11-26 on sync/PFO/settings/login/mic/record-to-synced/multi-account/login-offline (launch-then-airplane)/`fluent:///` deep links/PFO book persist; Blocked on empty fixtures, D-0702/C-0051, terms overflow. Leftover `fluent://home` mapping is #917 (journeys now use index `/`)
- [ ] **7 — Evidence pack + PR** — pack written 2026-11-26; PR/board held (no commit)

### Slice 1 — Inventory

- [x] Home / Book selector sketch mapped in source (`home-header`, `home-books`, `home-next-*`, `book-passage-*`) — Device: pending
- [x] Passage record / listen / send / review IDs confirmed on device — Device: 2026-11-26 `passage-record` / `passage-listen` / `passage-player` Pass; `passage-send*` Blocked (0 recorded verses); Review still Blocked (no other recorder)
- [x] Questions / images / Observer IDs confirmed on device — Device: 2026-11-26 `passage-questions` / `passage-images-*` Pass; `observer-screen` Blocked (no observer assignment)
- [ ] Every Legacy assertion in slices 4–6 has a Next cell or a waiver row

### Slice 2 — Shared helpers

- [x] `shared/nav/goto-home.yaml` — Device: pending — waits on `home-header`
- [x] `shared/ensure/ensure-at-home.yaml` — Device: pending — `home-header` + `home-scroll`
- [x] `shared/ensure/ensure-home-settled.yaml` — Device: pending — dismiss PFO until `home-header`
- [x] `shared/ensure/ensure-warm-home.yaml` — Device: pending — via ensure-home-settled
- [x] `shared/nav/open-my-work-chapter.yaml` — Device: pending — `home-next-{id}:`
- [x] `shared/nav/open-any-chapter.yaml` — Device: pending — Next up / book passage
- [x] `shared/nav/open-fixture-chapter.yaml` — Device: pending — book page + `book-passage-*`
- [x] `shared/nav/open-fixture-chapter-from-milestone.yaml` — Device: pending — `home-book-{unitId}:`
- [x] `shared/ensure/ensure-take-capacity.yaml` — Device: pending — Next `passage-record` or Legacy start
- [x] `shared/nav/sync-now-and-return.yaml` — Device: pending — return to `home-header`
- [x] `shared/nav/open-drawer.yaml` — Device: pending — `home-account` → `home-accounts`
- [x] `shared/nav/goto-sync.yaml` — Device: pending — `home-sync`
- [x] `shared/nav/goto-settings.yaml` — Device: pending — `home-accounts-settings`
- [x] `shared/ensure/ensure-no-modal.yaml` — Device: pending — also dismisses `home-accounts`
- [x] `shared/ensure/ensure-on-login.yaml` — Device: pending — still login chrome
- [x] `shared/ensure/ensure-signed-in.yaml` — Device: pending — via ensure-home-settled
- [x] `shared/ensure/ensure-warm-session.yaml` — Device: pending — via ensure-home-settled

Keep fixture chapter IDs. Do not mutate shared fixtures to make a flow pass.

### Slice 3 — Auth + navigation

- [x] `flows/harness/launch.yaml` — Device: Pass 2026-11-25 — still login screen (unchanged)
- [x] `flows/auth/login-happy-path.yaml` — Device: Pass 2026-11-25
- [x] `flows/auth/session-restore.yaml` — Device: Pass 2026-11-25
- [x] `flows/auth/logout.yaml` — Device: Pass 2026-11-25
- [x] `flows/auth/loggedout-local-validation-existing-session.yaml` — Device: pending
- [x] `flows/auth/loggedout-forgot-password-local-existing-session.yaml` — Device: pending
- [x] `flows/navigation/projects-to-drafting.yaml` — Device: Pass 2026-11-25
- [x] `flows/navigation/my-work-to-drafting.yaml` — Device: Pass 2026-11-25
- [x] `flows/navigation/my-work-to-drafting-existing-session.yaml` — Device: Pass 2026-11-26 — Home → `home-next-49577` → `passage-header` + `passage-record|listen` → back
- [x] `flows/navigation/home-tabs-existing-session.yaml` — Device: Pass 2026-11-25
- [x] `flows/navigation/tab-switching.yaml` — Device: Pass 2026-11-25
- [x] `flows/navigation/empty-assignments.yaml` — Device: Blocked 2026-11-26 — Account B (`MAESTRO_EMAIL_2`) has Next up (Genesis 1 hero, 54 chapters). YAML asserts `home-next-up-empty` vs `home-next-up-hero` (not `home-next-.*`, which also matches the empty id). Needs a member-without-assignments account; do not mutate this fixture

Home tabs (My Work / Projects) have no Next equivalent. Replacement is Home
books / Next up / Book gallery, not a fake two-tab bar.

### Slice 4 — Capture, recovery, leave guards

- [x] `flows/recording/record-stop-play-delete.yaml` — Device: Blocked 2026-11-26 — record → Pause → eject → fan → play/pause Pass on Psalms 3. Delete stays Blocked: Maestro 2.10 has no hold-then-drag (`longPressOn` then `swipe` is two gestures; `direction:UP` overshoots the 86dp bin). Keep asserting `passage-take-undo`
- [x] `flows/recording/recording-nav-guard.yaml` — Device: Pass 2026-11-25 — live take → system Back → "Recording in progress" / `passage-confirm` → Resume (`passage-confirm-cancel`) keeps recording → Back → Discard (`passage-confirm-confirm`). Close in the hero is the same `close()`; Maestro tap on `passage-close` does not fire through the header GestureDetector
- [x] `flows/recording/take-view-toggle.yaml` — Device: Pass 2026-11-25 — Legacy mine/all toggle → title sheet `passage-open-review` → `passage-review`; Account A has one recorder, so the Review branch was not offered (same gate as Legacy)
- [x] `flows/recording/take-view-existing-session.yaml` — Device: Blocked 2026-11-25 (`MAESTRO_FIXTURE_CHAPTER_ID` / `MAESTRO_FIXTURE_TAKE_VIEW_ALL_MARKER` missing; preflight). Hard `passage-open-review` → `passage-review-owner-*` + marker. Sibling `take-view-toggle` Pass
- [x] `flows/recording/verse-bounds.yaml` — Device: Pass 2026-11-25 — `passage-listen` → `passage-verse-position` + `passage-key-previous` / `passage-key-next`
- [x] `flows/recording/verse-bounds-existing-session.yaml` — Device: Pass 2026-11-25 — Listen on Psalms 3 starts at chip `2` (previous disabled); next chip `3`. Env `VERSE_REF_*` must be on `maestro-env.sh` allowlist; do not store `^…$` in `output` (Maestro 2.10). Sibling `verse-bounds` Pass
- [x] `flows/recording/complete-idle-lock-existing-session.yaml` — Device: Pass 2026-11-26 — Next-up status contains project name → title sheet `passage-book` → scroll UP to `book-chapter-49575` Complete → Passage: `passage-record` absent, `passage-notices-blocked` ("Recording isn't open…"), `passage-takes-meta` ("Takes aren't on this phone"), Listen opens player with no record/eject/fan. Needs `MAESTRO_FIXTURE_CHAPTER_ID=49575` / `_LABEL=Psalms 1` (not the draft 49577 default)

Leave confirmation and playback release must hold across cancelled navigation
and retained screens.

### Slice 5 — Resources, review, Observer, Send

- [x] `flows/drafting/tabs.yaml` — Device: Pass 2026-11-26 — login → open-any-chapter → `passage-record|listen`, resources peek, title sheet `passage-open-questions` (no drafting tabs)
- [x] `flows/drafting/tabs-existing-session.yaml` — Device: Pass 2026-11-26 — `open-my-work-chapter` 49577 → `passage-record|listen`, resources peek, title sheet `passage-open-questions`
- [x] `flows/drafting/bible-verse-to-record.yaml` — Device: Pass 2026-11-26 — tap `passage-script-verse-*`; Record/Listen stay on Passage (verse list skipped when already in script)
- [x] `flows/drafting/bible-verse-opens-record-existing-session.yaml` — Device: Pass 2026-11-26 — tap `passage-script-verse-2` + `passage-verse-row-2` on Psalms 3; Record/Listen stay on Passage (`MAESTRO_FIXTURE_VERSE_NUMBER=2`)
- [x] `flows/drafting/resources-sections.yaml` — Device: Pass 2026-11-26 — `passage-resources-open` → images card (`passage-images-*`) → collapse → title sheet `passage-open-questions` → `passage-questions`
- [x] `flows/drafting/resources-populated-existing-session.yaml` — Device: Blocked 2026-11-26 — `MAESTRO_EXPECT_RESOURCES_POPULATED_SECTION` / content marker empty (fails before UI)
- [x] `flows/drafting/resources-empty-existing-session.yaml` — Device: Blocked 2026-11-26 — `MAESTRO_EXPECT_RESOURCES_EMPTY_FIXTURE` empty (fails before UI)
- [x] `flows/drafting/images-fullscreen.yaml` — Device: Blocked 2026-11-26 — `MAESTRO_FIXTURE_MINE_LABEL` empty (Maestro scrolls for `"undefined"`)
- [x] `flows/drafting/source-audio-dock.yaml` — Device: Pass 2026-11-26 — `passage-listen` opens `passage-player`; back returns to `passage-header`
- [x] `flows/ownership/ownership-states.yaml` — Device: Blocked 2026-11-26 — `MAESTRO_FIXTURE_MINE_LABEL` empty (scrolls for `"undefined"`). YAML is Next book-page `book-chapter-*-meta`
- [x] `flows/ownership/ownership-status-existing-session.yaml` — Device: Blocked 2026-11-26 — `MAESTRO_EXPECT_OWNERSHIP` empty (fails before UI)
- [x] `flows/ownership/ownership-auto-claim.yaml` — Device: Blocked 2026-11-26 — `MAESTRO_FIXTURE_CLAIM_LABEL` empty (same fixture gap as siblings)
- [x] `flows/ownership/ownership-taken-warning.yaml` — Device: Blocked 2026-11-26 — `MAESTRO_FIXTURE_OTHER_LABEL` empty
- [x] `flows/ownership/ownership-conflict.yaml` — Device: Blocked 2026-11-26 — `MAESTRO_FIXTURE_CONFLICT_LABEL` empty
- [x] `flows/ownership/ownership-open-peer-check.yaml` — Device: Blocked 2026-11-26 — `MAESTRO_FIXTURE_OPEN_PEER_CHECK_LABEL` empty
- [x] Observer journey — Device: Blocked 2026-11-26 — `flows/drafting/observer-existing-session.yaml` added; Account A Next-up opens `passage-header` (translator), not `observer-screen`. Needs an observer assignment fixture
- [x] Send / later-stage journey — Device: Blocked 2026-11-26 — `flows/drafting/send-title-sheet.yaml`; Psalms 3 title sheet still has book/questions/classic only (no `passage-send*`). Do not skip-green

If a Next control is missing on device, Device = **Blocked** + follow-up
issue. #908–#914 may still be in QA.

### Slice 6 — Offline, sync, accounts, edges

- [x] `flows/offline/login-offline.yaml` — Device: Pass 2026-11-26 — `maestro-test-offline-login.sh` launches online, then airplane, then submit → `login-global-error`. Do not `hideKeyboard` (Android BACK). Airplane-off also restores emulator Wi-Fi
- [x] `flows/offline/storage-management.yaml` — Device: Pass 2026-11-26 — Settings → PFO → project-row → `manage-device-storage-section` + `storage-available-bytes`
- [x] `flows/offline/prepare-offline-entry-existing-session.yaml` — Device: Pass 2026-11-26 — `goto-settings` → `settings-prepare-offline` → `prepare-offline-screen` → back
- [x] `flows/offline/pfo-header-copy-existing-session.yaml` — Device: Pass 2026-11-26 — project-row-561 + "Prepare for Offline" / download instruction copy
- [x] `flows/offline/pfo-download-button-persist.yaml` — Device: Pass 2026-11-26 — `MAESTRO_PFO_BOOK_NAME=Psalms`; expand Assigned chapters → toggle Select all in Psalms; Download footer stays; no download tap
- [x] `flows/offline/c0051-matthew1-small-download-existing-session.yaml` — Device: Blocked 2026-11-26 — pinned to Legacy drawer accounts 9/10/12 + project-row-13 (not Account A)
- [x] `flows/offline/d0702-ee-gospel-ch1-download-persist-existing-session.yaml` — Device: Blocked 2026-11-26 — same Legacy drawer / dedicated D-0702 fixture
- [x] `flows/offline/d0702-book-ch1-unavailable-persist.yaml` — Device: Blocked 2026-11-26 — D-0702 nested fixture
- [x] `flows/offline/d0702-assert-hydration-available.yaml` — Device: Blocked 2026-11-26 — D-0702 nested (must follow ch1 select)
- [x] `flows/offline/d0702-assert-hydration-unavailable.yaml` — Device: Blocked 2026-11-26 — D-0702 nested
- [x] `flows/sync/sync-now.yaml` — Device: Pass 2026-11-26 — `goto-sync` → settle, no metadata/retry error → Home
- [x] `flows/sync/sync-entry-existing-session.yaml` — Device: Pass 2026-11-26 — `home-sync` → `sync-screen` + `sync-upload-cellular` → back
- [x] `flows/sync/status-existing-session.yaml` — Device: Blocked 2026-11-26 — `MAESTRO_EXPECT_SYNC_STATUS_TITLE` empty (fails before UI)
- [x] `flows/sync/record-to-synced.yaml` — Device: Pass 2026-11-26 — record → eject → `goto-sync`; Next auto-uploaded so Sync Now was already gone ("Online · all synced"); no metadata/retry error
- [x] `flows/sync/prepare-offline-entry.yaml` — Device: Pass 2026-11-26 — Settings → PFO → `project-row-*` → resources section + download footer
- [x] `flows/sync/settings-persistence.yaml` — Device: Pass 2026-11-26 — cellular switch + drafting-unit pericope persist after back → Settings
- [x] `flows/accounts/multi-account-isolation.yaml` — Device: Pass 2026-11-26 — Next-up below books (scroll); Settings log-out below fold (scroll); A label absent on B, returns on A; sync on active user
- [x] `flows/edges/login-validation.yaml` — Device: Pass 2026-11-26 — empty / malformed email / empty password. Do not `hideKeyboard` (Android BACK backgrounds the app)
- [x] `flows/edges/wrong-credentials.yaml` — Device: Pass 2026-11-26 — `login-global-error`, stay on login
- [x] `flows/edges/forgot-password.yaml` — Device: Pass 2026-11-26 — sent view → back to login
- [x] `flows/edges/legal-pages.yaml` — Device: Pass 2026-11-26 — login privacy + terms → back
- [x] `flows/edges/mic-denied.yaml` — Device: Pass 2026-11-26 — mic deny launch → Passage `passage-header` + `passage-record|listen`; optional `passage-record` tap did not crash
- [x] `flows/edges/cellular-toggle.yaml` — Device: Pass 2026-11-26 — `sync-upload-cellular` on Sync
- [x] `flows/edges/deep-link-home.yaml` — Device: Pass 2026-11-26 — `openLink: fluent:///` (Next index `/`) lands login chrome. Leftover `fluent://home` mapping is #917
- [x] `flows/edges/deep-link-signed-in.yaml` — Device: Pass 2026-11-26 — signed-in `home-header` then `fluent:///` stays on Home
- [x] `flows/edges/home-sync-sole-entry-existing-session.yaml` — Device: Pass 2026-11-26 — one `home-sync`; open via `goto-sync` (plain tap flakes on Maestro 2.10)
- [x] `flows/edges/settings-privacy-existing-session.yaml` — Device: Pass 2026-11-26 — `home-accounts-privacy` → body copy → back
- [x] `flows/edges/settings-terms-existing-session.yaml` — Device: Pass 2026-11-26 — `home-accounts-terms` → body copy → back
- [x] `flows/edges/settings-terms-scroll-existing-session.yaml` — Device: Blocked 2026-11-26 — last paragraph already in viewport (overflow precondition; tagged fixture-blocked)

### Slice 7 — Evidence and PR

- [x] Each required run has Pass / Fail / Blocked + build / device / content — see [Evidence pack](#evidence-pack-2026-11-26)
- [x] Human nightly results attached separately from automated success — **not claimed here**. Local Debug+Metro on Pixel_7 is engineering evidence only. Nightly APK QA is post-merge (`Needs QA? Yes`)
- [x] Waivers (if any) named on the ticket with a follow-up issue — **none**. Blocked rows are not waivers; follow-ups listed in the pack. No scenario deleted
- [ ] PR opened: `Refs #915`, Part of #894, Needs QA? Yes — **held** (no commit this session). Draft body in the pack
- [ ] Board → In PR Review — after the PR opens

Unit tests in this ticket only if a helper/script contract changes. #915 owns
cross-screen journeys, not `homeRoute.test.tsx` / `chaptersRoute.test.tsx`
repairs.

## Delivery

| Item | Value |
| --- | --- |
| PR title | `[#915]: Migrate Maestro journeys to Next` |
| Details | `Refs #915` and prose `Part of #894`. No closing keywords |
| Needs QA? | Yes. Human nightly on the APK is the real pass. CI green is not |
| Local gates | `format:check` → `lint` → `architecture-guard` → `typecheck` → `npm test -- --ci` |

Temporary Next setup: default is already Next. Assert Next chrome on launch. If
a warm device is stuck on Legacy, one test-only Settings → Next tap is allowed.
Never add a production “open Legacy” selector.

## Slice order

Do them in order. Each slice should leave the tree buildable. Helpers first:
rewriting forty flows while `goto-home` still waits on `home-tab-my-work` is
wasted work. Tick progress only in the [implementation tracker](#implementation-tracker).

## Selector sketch (confirm on device)

| Surface | Legacy (do not keep as the required path) | Next |
| --- | --- | --- |
| Home | `home-tab-my-work`, `home-tab-projects`, `my-work-row-*`, `milestone-row-*` | `home-header`, `home-scroll`, `home-books`, `home-book-*`, `home-next-*`, `home-account`, `home-sync` |
| Book | `chapter-row-*` | `book-header`, `book-list`, `book-chapter-*`, `book-passage-${chapterId}-${key}` |
| Passage chrome | `drafting-tab-bar`, `drafting-tab-bible`, `drafting-tab-resources`, `drafting-tab-record`, `drafting-header-back` | `passage-record`, `passage-listen`, `passage-open-questions`, `passage-open-review`, `passage-send`, `passage-handle` |
| Record | `record-start-button`, `record-stop-button`, `record-play-button-*`, `record-delete-selected-button-*` | `passage-record`, `passage-listen`, `passage-take-undo`, `passage-player`, `passage-takes` |
| Review | Record tab take list | `passage-review`, `passage-review-owner-*`, `passage-review-play-*` |
| Questions | `resources-section-translationQuestions` | `passage-questions`, `passage-question-${id}-toggle` |
| Images | `resources-section-imagesMaps` | `passage-images-list`, `passage-image-${id}` |
| Observer | Legacy observer draft chrome | `observer-screen`, `observer-back`, `observer-tab-*`, `observer-draft-*` |
| Accounts | Drawer | `home-accounts`, `home-account-${userId}`, `home-accounts-log-out` |

Never require `passage-classic` or `settings-ui-version` → Legacy for a
passing journey.

## How to check a slice

Local Debug + Metro (not Expo Go). Emulator packager host is `10.0.2.2`, not
Mac `localhost` / IPv6. See [maestro.md](../../guides/maestro.md).

```bash
ANDROID_SERIAL=emulator-5554 npm run maestro:android:up
REACT_NATIVE_PACKAGER_HOSTNAME=10.0.2.2 npm run maestro:metro
# smallest:
npm run maestro:test:harness
# after slice 3:
bash scripts/maestro-test.sh --config .maestro/config.yaml \
  .maestro/flows/navigation/projects-to-drafting.yaml
```

Harness / smoke / auth **clear state**. Do not run them on a signed-in session
you need to keep. Mutating / fixture-blocked flows need
`MAESTRO_FIXTURE_CHAPTER_ID` on the allowlist; missing fixture is BLOCKED, not
green.

Inspect screenshots under `.maestro/test_output/` on failure. Do not widen
selectors until they pass.

## Risks

- Shared helpers: one wrong Home ID breaks most of the suite.
- #908–#914 still open for QA: a missing Next control is Blocked, not skip-green.
- Maestro cannot be fully proven in CI. Needs QA? Yes; nightly is the pass.
- Two ADB devices: set `ANDROID_SERIAL`. `maestro:android:up` will not guess.

## Evidence pack (2026-11-26)

Engineering Maestro on **local Debug + Metro**, not the nightly APK. Do not
treat this table as human QA.

| Field | Value |
| --- | --- |
| Device | Pixel_7 AVD, `emulator-5554`, Android 35 |
| Build | Expo SDK 57 / RN 0.86 Debug client; `MAESTRO_LAUNCH_MODE=metro`; packager `10.0.2.2:8081` |
| App | `com.eten.fluent` `0.0.1` |
| Content | Account A translator; project **561** (MIlestones Psalms UI V2); draft chapter **49577** Psalms 3; Complete idle-lock **49575** Psalms 1 |
| Dates | Slice 3–4: 2026-11-25. Slices 5–6: 2026-11-26 |
| Fail | **0** |

Local gates (repo files; `pr-reviews/` is local-only via `.git/info/exclude` and
is not on CI):

1. `npm run format:check` — pass
2. `npm run lint` — 0 errors (24 pre-existing warnings)
3. `npm run architecture-guard` — ok
4. `npm run typecheck` — 0 errors outside `pr-reviews/`
5. `npm test -- --ci` — 420 passed, 1 skipped, 4756 tests

### Blocked (keep the journey; do not skip-green)

These are **not** ticket-level waivers. YAML still asserts the Next control.

| Cluster | Flows | Why | Follow-up |
| --- | --- | --- | --- |
| Empty `.env.maestro` labels | ownership \*, resources populated/empty, images-fullscreen, sync status title, take-view marker | Maestro interpolates `"undefined"` | Fill labels; do not mutate shared fixtures |
| Dedicated PFO accounts | C-0051, D-0702 \* | Legacy drawer accounts 9/10/12 + project-row-13 | Dedicated PM9 / project 13 session |
| Observer | `observer-existing-session` | Account A opens Passage, not `observer-screen` | Observer assignment fixture |
| Send | `send-title-sheet` | Psalms 3 is 0/7 recorded — no `passage-send*` | Takes on the draft fixture |
| Terms overflow | `settings-terms-scroll-existing-session` | Last paragraph already in viewport | Longer copy / overflow precondition |
| Capture delete drag | `record-stop-play-delete` | Record/play/eject Pass; Maestro 2.10 has no hold-then-drag onto `passage-bin` | Maestro drag, or TalkBack Delete |
| Empty assignments | `empty-assignments` | Account B has Next up (Genesis 1 hero), not `home-next-up-empty` | Member-without-assignments account |
| Sibling pending | logged-out existing-session | YAML retargeted; needs `MAESTRO_LOGGED_OUT_FRESH_STATE` | Re-run on a signed-out session |

### Pass (high-signal)

Auth/restore/logout, Home/Book open, recording nav-guard, verse bounds, Complete
idle-lock, Passage tabs/resources/Listen, PFO entry + storage + download-button
persist, sync-now, settings-persistence, cellular, login edges, mic-denied,
record-to-synced (Next auto-upload → All synced), multi-account isolation,
login-offline (launch-then-airplane), `fluent:///` deep links (logged-out and
signed-in), my-work-to-drafting existing-session.

### Draft PR (do not open until commit)

Title: `[#915]: Migrate Maestro journeys to Next`

Needs QA? **Yes**. `Refs #915`. Part of #894. No closing keywords.

### Done when (from the ticket)

- [x] Every retired Legacy journey assertion has a Next replacement or a ticket-level waiver with follow-up — replacements are in YAML; Blocked rows have follow-ups above; no silent deletes
- [ ] Next smoke path: auth/restore, Home/Book, capture/recovery/review/delete-undo, all-owner review, resources, Observer, Send, later-stage — **partial**: Observer, Send, all-owner review, delete-drag still Blocked on fixtures
- [x] Offline content, pending transfers, account switch, and role/read-only stay tested through Next entry points — PFO, record-to-synced, multi-account, login-offline Pass
- [x] Required journeys never depend on classic tabs or a switch into Legacy, and do not pass by skipping unavailable controls
- [x] Capture leave confirmation and playback release across route transitions, including cancelled navigation — `recording-nav-guard` Pass
- [ ] Old marker/route fixtures keep saved-session identity and access to preserved media after upgrade — journeys use `fluent:///`; leftover `fluent://home` is #917
- [x] Execution records identify Pass, Fail, or Blocked with build/device/content
- [ ] #915 can close on that evidence before #916/#917 close — after PR + nightly; Blocked fixtures/links remain visible
