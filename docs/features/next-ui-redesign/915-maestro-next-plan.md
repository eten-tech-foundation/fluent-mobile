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

## Current state (2026-11-25)

- Next surfaces for #908–#914 have merged PRs. GitHub issues stay open for QA.
- Maestro has **zero** Next IDs (`home-header`, `passage-record`, `observer-screen`, …).
- Shared helpers all assume Legacy Home tabs and `drafting-tab-bar`.
- Settings still has `settings-ui-version`. Journeys must not switch into Legacy
  or tap `passage-classic`.

## Implementation tracker

Tick the item when the **YAML** is retargeted at Next. After the Device
label, write `pending` / `Pass` / `Fail` / `Blocked` / `waived` and a date.
Do not tick if the flow still requires Legacy tabs, `drafting-tab-bar`,
`record-start-button`, `passage-classic`, or a Settings switch into Legacy.

`Blocked` is valid progress (fixture/media/control missing). Deleting the
item to stay green is not.

### Slices

- [ ] **1 — Inventory** — mapping confirmed on device
- [x] **2 — Shared helpers** — YAML retargeted; Device: pending
- [x] **3 — Auth + navigation** — YAML retargeted; Device: Pass 2026-11-25 except fixture-blocked / empty-assignments
- [ ] **4 — Capture / recovery / leave guards**
- [ ] **5 — Resources, review, Observer, Send**
- [ ] **6 — Offline, sync, accounts, edges**
- [ ] **7 — Evidence pack + PR** (`Refs #915`, Needs QA? Yes)

### Slice 1 — Inventory

- [x] Home / Book selector sketch mapped in source (`home-header`, `home-books`, `home-next-*`, `book-passage-*`) — Device: pending
- [ ] Passage record / listen / send / review IDs confirmed on device
- [ ] Questions / images / Observer IDs confirmed on device
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
- [x] `flows/navigation/my-work-to-drafting-existing-session.yaml` — Device: Blocked 2026-11-25 (`MAESTRO_FIXTURE_CHAPTER_ID` missing from `.env.maestro`; scrolled `home-next-undefined`)
- [x] `flows/navigation/home-tabs-existing-session.yaml` — Device: Pass 2026-11-25
- [x] `flows/navigation/tab-switching.yaml` — Device: Pass 2026-11-25
- [x] `flows/navigation/empty-assignments.yaml` — Device: pending

Home tabs (My Work / Projects) have no Next equivalent. Replacement is Home
books / Next up / Book gallery, not a fake two-tab bar.

### Slice 4 — Capture, recovery, leave guards

- [ ] `flows/recording/record-stop-play-delete.yaml` — Device: pending
- [ ] `flows/recording/recording-nav-guard.yaml` — Device: pending
- [ ] `flows/recording/take-view-toggle.yaml` — Device: pending
- [ ] `flows/recording/take-view-existing-session.yaml` — Device: pending
- [ ] `flows/recording/verse-bounds.yaml` — Device: pending
- [ ] `flows/recording/verse-bounds-existing-session.yaml` — Device: pending
- [ ] `flows/recording/complete-idle-lock-existing-session.yaml` — Device: pending

Leave confirmation and playback release must hold across cancelled navigation
and retained screens.

### Slice 5 — Resources, review, Observer, Send

- [ ] `flows/drafting/tabs.yaml` — Device: pending — Passage (no drafting tabs)
- [ ] `flows/drafting/tabs-existing-session.yaml` — Device: pending
- [ ] `flows/drafting/bible-verse-to-record.yaml` — Device: pending — `passage-record`
- [ ] `flows/drafting/bible-verse-opens-record-existing-session.yaml` — Device: pending
- [ ] `flows/drafting/resources-sections.yaml` — Device: pending — questions / images
- [ ] `flows/drafting/resources-populated-existing-session.yaml` — Device: pending
- [ ] `flows/drafting/resources-empty-existing-session.yaml` — Device: pending
- [ ] `flows/drafting/images-fullscreen.yaml` — Device: pending — `passage-image-*`
- [ ] `flows/drafting/source-audio-dock.yaml` — Device: pending — `passage-listen`
- [ ] `flows/ownership/ownership-states.yaml` — Device: pending — Book + Passage
- [ ] `flows/ownership/ownership-status-existing-session.yaml` — Device: pending
- [ ] `flows/ownership/ownership-auto-claim.yaml` — Device: pending
- [ ] `flows/ownership/ownership-taken-warning.yaml` — Device: pending
- [ ] `flows/ownership/ownership-conflict.yaml` — Device: pending
- [ ] `flows/ownership/ownership-open-peer-check.yaml` — Device: pending — `passage-open-review` / Send
- [ ] Observer journey — Device: pending — `observer-screen` (add flow if none exists; do not skip)
- [ ] Send / later-stage journey — Device: pending — `passage-send*` (add flow if none exists; do not skip)

If a Next control is missing on device, Device = **Blocked** + follow-up
issue. #908–#914 may still be in QA.

### Slice 6 — Offline, sync, accounts, edges

- [ ] `flows/offline/login-offline.yaml` — Device: pending
- [ ] `flows/offline/storage-management.yaml` — Device: pending
- [ ] `flows/offline/prepare-offline-entry-existing-session.yaml` — Device: pending
- [ ] `flows/offline/pfo-header-copy-existing-session.yaml` — Device: pending
- [ ] `flows/offline/pfo-download-button-persist.yaml` — Device: pending
- [ ] `flows/offline/c0051-matthew1-small-download-existing-session.yaml` — Device: pending
- [ ] `flows/offline/d0702-ee-gospel-ch1-download-persist-existing-session.yaml` — Device: pending
- [ ] `flows/offline/d0702-book-ch1-unavailable-persist.yaml` — Device: pending
- [ ] `flows/offline/d0702-assert-hydration-available.yaml` — Device: pending
- [ ] `flows/offline/d0702-assert-hydration-unavailable.yaml` — Device: pending
- [ ] `flows/sync/sync-now.yaml` — Device: pending
- [ ] `flows/sync/sync-entry-existing-session.yaml` — Device: pending
- [ ] `flows/sync/status-existing-session.yaml` — Device: pending
- [ ] `flows/sync/record-to-synced.yaml` — Device: pending
- [ ] `flows/sync/prepare-offline-entry.yaml` — Device: pending
- [ ] `flows/sync/settings-persistence.yaml` — Device: pending
- [ ] `flows/accounts/multi-account-isolation.yaml` — Device: pending
- [ ] `flows/edges/login-validation.yaml` — Device: pending
- [ ] `flows/edges/wrong-credentials.yaml` — Device: pending
- [ ] `flows/edges/forgot-password.yaml` — Device: pending
- [ ] `flows/edges/legal-pages.yaml` — Device: pending
- [ ] `flows/edges/mic-denied.yaml` — Device: pending
- [ ] `flows/edges/cellular-toggle.yaml` — Device: pending
- [ ] `flows/edges/deep-link-home.yaml` — Device: pending
- [ ] `flows/edges/deep-link-signed-in.yaml` — Device: pending
- [ ] `flows/edges/home-sync-sole-entry-existing-session.yaml` — Device: pending
- [ ] `flows/edges/settings-privacy-existing-session.yaml` — Device: pending
- [ ] `flows/edges/settings-terms-existing-session.yaml` — Device: pending
- [ ] `flows/edges/settings-terms-scroll-existing-session.yaml` — Device: pending

### Slice 7 — Evidence and PR

- [ ] Each required run has Pass / Fail / Blocked + build / device / content
- [ ] Human nightly results attached separately from automated success
- [ ] Waivers (if any) named on the ticket with a follow-up issue
- [ ] PR opened: `Refs #915`, Part of #894, Needs QA? Yes
- [ ] Board → In PR Review

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

## Done when (from the ticket)

- [ ] Every retired Legacy journey assertion has a Next replacement or a ticket-level waiver with follow-up
- [ ] Next smoke path: auth/restore, Home/Book, capture/recovery/review/delete-undo, all-owner review, resources, Observer, Send, later-stage
- [ ] Offline content, pending transfers, account switch, and role/read-only stay tested through Next entry points
- [ ] Required journeys never depend on classic tabs or a switch into Legacy, and do not pass by skipping unavailable controls
- [ ] Capture leave confirmation and playback release across route transitions, including cancelled navigation
- [ ] Old marker/route fixtures keep saved-session identity and access to preserved media after upgrade
- [ ] Execution records identify Pass, Fail, or Blocked with build/device/content
- [ ] #915 can close on that evidence before #916/#917 close
