# QA process (merge → nightly → pass/fail)

Canonical **when / who / board handoff** for Fluent Mobile QA. For install steps on a phone, see [qa-preview-testing.md](qa-preview-testing.md).

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
Done     Automation:
(for     - Comment on linked issue(s)
 eng)    - Add assignee @Roslin22
         - Project 4 → In QA
         |
         v
   Next nightly APK (06:00 UTC)
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
| **CI** | On merge of Needs-QA PRs: issue handoff comment, assign Roslin, best-effort Project 4 → `In QA`. Nightly posts install URL on recent handoff issues |
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

## Status on Project 4 (QA-required work)

| Step | Status |
| --- | --- |
| Coding | `In Progress (Dev)` |
| PR open | `In PR Review` |
| Merged (Needs QA? Yes) | `In QA` (automation from `In PR Review` / `In Progress (Dev)` when possible) |
| QA pass on nightly | `Passed QA` (human) |
| After release | `To Deploy` / `Done` — humans; do **not** auto-close on merge |

Engineering-only PRs skip the QA handoff. They still use `In PR Review` and merge when review + CI allow.

### Optional isolated `preview-build`

The **`preview-build`** label still builds an isolated PR APK for **debugging**. It comments on the **PR only**. It does **not** move cards to `In QA` and does **not** start the QA queue. Default QA install path is the **nightly**.

## Developer checklist (QA-required)

1. Open PR with `Refs #NNN` on its own Details line (never `Closes` / `Fixes` / `Resolves`; do not use `Part of #NNN` for the ticket that should get QA handoff).
2. Check **Needs QA? Yes** in the PR body.
3. Get engineer approval + green CI → **merge** (human merger).
4. Confirm automation commented on the issue, assigned `@Roslin22`, and moved Project 4 → **In QA** (or move/assign manually if secrets were unavailable).
5. On QA fail after merge: open a **new** bug ticket; fix on a new branch/PR.

## CI / automation (current)

| Piece | Behavior |
| --- | --- |
| [`.github/workflows/qa-handoff.yml`](../../.github/workflows/qa-handoff.yml) | On merge: if Needs QA? Yes → comment + assign Roslin + best-effort `In QA` |
| [`.github/workflows/nightly-preview.yml`](../../.github/workflows/nightly-preview.yml) | Daily binary APK; comments install URL on issues with a recent handoff marker |
| [`.github/workflows/preview-build.yml`](../../.github/workflows/preview-build.yml) | Optional label → isolated PR APK (**PR comment only**) |

## Related

- Install / phone steps: [qa-preview-testing.md](qa-preview-testing.md)
- **Multi-account nightly script:** [qa-multi-account-nightly.md](qa-multi-account-nightly.md) (#375)
- Board rules: [project-board.md](project-board.md)
- Issue / PR linking: [../issue-tracking.md](../issue-tracking.md)
- CI inventory: [../ci.md](../ci.md)
- Agent delivery: [../../AGENTS.md](../../AGENTS.md)
