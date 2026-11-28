# QA process (merge → nightly → pass/fail)

Canonical **when / who / board handoff** for Fluent Mobile QA. For install steps on a phone, see [qa-preview-testing.md](qa-preview-testing.md). Opt-in Maestro E2E (engineering / debug; not a merge gate): [maestro.md](maestro.md). Multi-account nightly checklist: [qa-multi-account-nightly.md](qa-multi-account-nightly.md).

**Invariant:** Engineer approval + green required CI is enough to **merge**. Device QA is **post-merge** on the next **nightly** Android APK (main). QA no longer blocks merge.

> Historical note: pre-merge “QA must pass this PR’s `preview-build` before merge” is retired. Issue **#330** (automated merge gate until QA pass) is **superseded** by this policy — leave it open until Product/eng closes it; do not implement that gate.

## Mental model

### Branch 1 — Does this change require QA?

| Needs QA? | Examples | Path |
| --- | --- | --- |
| **No** | Logging, internal refactors, instrumentation, docs-only, Dependabot with no runtime UX, some performance-only changes | Engineering review → merge when CI is green |
| **Yes** | UI, native modules, mic / camera / filesystem / permissions, sync behavior, anything QA must verify on device | Merge when approved → automation hands off to QA (below) |

When unsure, treat it as **Needs QA**.

### Branch 2 — Post-merge QA (nightly)

```text
PR ready
   |
   v
Engineer approval + CI green
   |
   v
Merge to main
   |
   v
Needs QA?
  /    \
No      Yes
|        |
Automation:  Automation:
- Comment   - Comment on linked issue(s)
- Project 4 - Add assignee @Roslin22
  → Done    - Project 4 → In QA
- Close        |
  issue        v
         Next nightly APK (15:17 America/Los_Angeles; Slack in same run; GitHub may delay hours)
               |
               v
             QA on nightly
            /  \
         Pass   Fail
          |      |
          |    New bug ticket
          |    (code already on main)
          |
          v
      Passed QA
          |
          v
      Done / release process
```

## Ownership

| Role | Owns |
| --- | --- |
| **Developer** | Decide Needs QA?; keep `Refs #NNN` correct; do **not** wait on QA to merge once an engineer approved |
| **Reviewer / merger** | Approve and merge when CI is green (agents still do not merge — [delivery](../../.cursor/rules/delivery.mdc)) |
| **CI** | On merge: **Needs QA? Yes** → handoff comment, assign Roslin, Project 4 → `In QA`. **Needs QA? No** → Project 4 → `Done` + close linked issues. Nightly posts install URL on recent QA-handoff issues |
| **QA** | Pass/fail on the **nightly** build that includes the merge (not an isolated PR preview, not production) |

## Needs QA? heuristics

**Yes:**

- User-visible UI or navigation changes
- Recording / playback / mic / camera / filesystem / permissions
- Sync, offline, or data that QA must exercise on device
- Native modules, Expo config plugins, or anything that needs a device APK to validate
- Agent-authored features that touch the surfaces in [AGENTS.md](../../AGENTS.md) § Human-only verification

**No (engineering-only):**

- Docs, CI YAML, agent rules, comments
- Pure refactors with no behavior change
- Logging / metrics / instrumentation only
- Dependabot bumps with no app UX impact (still run CI)

## Status on Project 4

| Step | Status |
| --- | --- |
| Coding (`/start-issue`) | `In Progress (Dev)` (agent CLI) |
| PR open (`/create-pr`) | `In PR Review` (agent CLI) |
| Merged (**Needs QA? Yes**) | `In QA` (automation; issue stays open) |
| Merged (**Needs QA? No**) | `Done` + GitHub issue **closed** (automation) |
| QA pass on nightly | `Passed QA` (human) |
| After release (Needs-QA path) | `To Deploy` / `Done` — humans |

Still never put `Closes` / `Fixes` / `Resolves` in the PR body — engineering-only close is post-merge automation only.

### Optional isolated `preview-build`

The **`preview-build`** label still builds an isolated PR APK for **debugging**. It comments on the **PR only**. It does **not** move cards to `In QA` and does **not** start the QA queue. Default QA install path is the **nightly**.

## Developer checklist (QA-required)

1. Open PR with `Refs #NNN` on its own Details line (never `Closes` / `Fixes` / `Resolves`; do not use `Part of #NNN` for the ticket that should get QA handoff).
2. Check **Needs QA? Yes** in the PR body.
3. Get engineer approval + green CI → **merge** (human merger).
4. Confirm automation commented on the issue, assigned `@Roslin22`, and moved Project 4 → **In QA** (or move/assign manually if secrets were unavailable).
5. On QA fail after merge: open a **new** bug ticket; fix on a new branch/PR.

## Developer checklist (engineering-only)

1. Open PR with `Refs #NNN` (never closing keywords).
2. Check **Needs QA? No** in the PR body.
3. Get engineer approval + green CI → **merge** (human merger).
4. Confirm automation moved Project 4 → **Done** and closed the issue. If secrets were unavailable, manually move the issue to **Done**, verify that the move succeeded, and then close the issue.

## CI / automation (current)

| Piece | Behavior |
| --- | --- |
| [`.github/workflows/qa-handoff.yml`](../../.github/workflows/qa-handoff.yml) | On merge: **Yes** → comment + assign Roslin + `In QA`; **No** → `Done`, then comment + close (skip comment/close if the Done move fails) |
| [`.github/scripts/project-board-cli.cjs`](../../.github/scripts/project-board-cli.cjs) | Agent `/start-issue` / `/create-pr` Status moves |
| [`.github/workflows/nightly-preview.yml`](../../.github/workflows/nightly-preview.yml) | Daily binary APK; comments install URL on issues with a recent QA-handoff marker |
| [`.github/workflows/preview-build.yml`](../../.github/workflows/preview-build.yml) | Optional label → isolated PR APK (**PR comment only**) |

## Related

- Install / phone steps: [qa-preview-testing.md](qa-preview-testing.md)
- **Multi-account nightly script:** [qa-multi-account-nightly.md](qa-multi-account-nightly.md) (#375)
- Board rules: [project-board.md](project-board.md)
- Issue / PR linking: [../issue-tracking.md](../issue-tracking.md)
- CI inventory: [../ci.md](../ci.md)
- Agent delivery: [../../AGENTS.md](../../AGENTS.md)

## Next nightly scenarios

Human pass on the **nightly** Android APK. Record the nightly comment URL or
EAS build id with the result. A unit-test run is not this evidence. Maestro
flows that still tap `drafting-tab-bible`, `record-tab`, or `home-tab-my-work`
target the retired screens and are not this pass
([maestro.md](maestro.md)).

Controls: [Next UI](../features/next-ui-redesign/README.md). Multi-account rows
stay in [qa-multi-account-nightly.md](qa-multi-account-nightly.md).

### Upgrade

On a device that already has an older Fluent install (a stored
`pref_ui_version`, a `/verse-detail` link, or a paused take):

1. Install the nightly over that install.
2. Open Settings from the Home avatar → **Accounts on this device** →
   **Settings**. Confirm there is no **UI version** row. Drafting unit,
   cellular uploads, Prepare for Offline, Clear cache, Add user, and Log out
   are still there.
3. Open a saved `/verse-detail` recovery link (`recoverSessionKey` and
   `recoverVerse`). It lands on the passage for that chapter and verse. A
   chapter link with no recovery opens Observer for a read-only account and
   the passage at the first verse otherwise. A broken link stays on the
   adapter with **Go back**, and **Try again** when the read failed.
4. Cold start with a paused take for the active account. The alert offers
   **Resume** and **Discard**. Resume opens the passage on the saved verse.
   A failed resume offers **Retry** and **Discard**.

### Offline

1. Prepare for Offline from Settings, then enable airplane mode.
2. Home and the book page show the last cached chapters. An empty project is
   an empty list.
3. Open a prepared passage. Listen plays the downloaded source. Missing audio
   leaves Play disabled and keeps the verse label.
4. Open notes from the script, Translation Questions from the title sheet, and
   Images and maps from the Resources card. Empty content stays empty. A
   failed load offers Retry.
5. Record a take. It stays on the device. Sync waits until the network returns.

### Role

1. Drafter or peer: a Home or book tap opens the passage when `chapterOpen`
   allows work. Open Peer Check re-checks the Translator grant at the tap.
2. Observer (grant plus project membership): the same tap opens the read-only
   Observer screen (`observer-draft`). Losing the grant does not open the
   editor.
3. A chapter whose project cannot be read does not open the editor.
4. Send appears on the passage title sheet only for an account allowed to
   send. The label names the next stage.

### Accessibility

On the nightly, at the passage and on Home:

1. TalkBack reads Listen, Record, and Resume recording, plus the avatar
   **Accounts** label.
2. Largest font size and largest display size: scripture uses the 1.3 cap
   (`fontScale.readingMax`). Line height is capped with it (see the
   [theme guide](ui-version-theming.md#large-text)). Nothing required is
   clipped off screen.
3. Telugu sample text keeps the taller `typeTelugu` line heights.
4. Canvas (the passage player) uses light status and navigation icons.
   Hardware chrome uses dark icons.
5. Remove animations: the player and Resources card still open and close.

### Recovery

The launch alert offers one paused take. A successful Resume does not prompt
for another marker in that same launch. The other marker stays on disk.

1. Record a verse take, set Settings **Drafting unit** to Pericope, background
   the app, and relaunch. **Resume** opens the passage on the saved verse in
   the unit that was saved.
2. Record a pericope take, set **Drafting unit** back to Verse, background,
   and relaunch. **Resume** opens that passage in the saved unit.
3. On a later alert, **Discard** deletes that paused take's segments and stays
   on Home. It does not upload the take.

Pass or fail follows the rest of this process: a fail after merge gets a new
bug ticket. This section does not change who merges or when QA runs.
