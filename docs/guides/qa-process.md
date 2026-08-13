# QA process (PR → preview → merge)

Canonical **when / who / merge gate** for Fluent Mobile QA. For install steps on a phone, see [qa-preview-testing.md](qa-preview-testing.md).

**Invariant:** A PR that **requires QA** is **not mergeable** until QA has **passed the isolated preview build for that PR**.

## Mental model

### Branch 1 — Does this change require QA?

| Needs QA? | Examples | Path |
| --- | --- | --- |
| **No** | Logging, internal refactors, instrumentation, docs-only, Dependabot with no runtime UX, some performance-only changes | Engineering review → eligible to merge when CI is green |
| **Yes** | UI, native modules, mic / camera / filesystem / permissions, sync behavior, anything QA must verify on device | Author adds `preview-build` → QA flow below |

When unsure, treat it as **Needs QA**.

### Branch 2 — QA flow (`preview-build`)

```text
PR ready
   |
   v
Needs QA?
  /    \
No      Yes
|        |
Code     Add preview-build
review   label
         |
         v
   Isolated PR build
         |
         v
 CI posts install link
 to PR + issue
         |
         v
       QA
      /  \
   Pass   Fail
    |      |
    |    Document issue
    |    + In Progress (Dev)
    |      |
    |    Developer fixes
    |      |
    |    New preview
    |      |
    |______|
    |
    v
Eligible to merge
```

## Ownership

| Role | Owns |
| --- | --- |
| **Developer** | Decide Needs QA?; add `preview-build` when yes; keep `Refs #NNN` correct; do not merge QA-required PRs before QA pass |
| **CI** | Isolated Android preview APK for that PR; install comment on **PR** and linked issue; best-effort Project 4 → `In QA` |
| **QA** | Pass/fail on **that** preview build (not another PR’s APK, not nightly, not production) |
| **Reviewer / merger** | Enforce the merge gate manually until an automated gate exists |

## Needs QA? heuristics

**Yes (add `preview-build`):**

- User-visible UI or navigation changes
- Recording / playback / mic / camera / filesystem / permissions
- Sync, offline, or data that QA must exercise on device
- Native modules, Expo config plugins, or anything that needs a fresh APK to validate
- Agent-authored features that touch the surfaces in [AGENTS.md](../../AGENTS.md) § Human-only verification

**No (engineering-only):**

- Docs, CI YAML, agent rules, comments
- Pure refactors with no behavior change
- Logging / metrics / instrumentation only
- Dependabot bumps with no app UX impact (still run CI)

## Status on Project 4 (QA-required PRs)

Typical loop:

| Step | Status |
| --- | --- |
| Coding | `In Progress (Dev)` |
| PR open | `In PR Review` |
| `preview-build` ready / bot commented | `In QA` (automation moves from `In PR Review` / `In Progress (Dev)` when possible) |
| QA fail | Back to `In Progress (Dev)` (human); developer fixes → new preview |
| QA pass | `Passed QA` (human) → **then** eligible to merge |
| After merge | Leave open until release process; humans set `Done` — do **not** auto-close on merge |

Engineering-only PRs skip `preview-build` / `In QA` for this gate. They still use `In PR Review` and merge when review + CI allow.

### Post-merge / release QA

Production / tag (`v*`) and optional nightly APKs are **separate** from this PR gate. Do not use a nightly or another developer’s preview to satisfy “QA passed this PR.” Board columns after merge (`To Deploy`, `Done`) follow release process — see [project-board.md](project-board.md).

## Developer checklist (QA-required)

1. Open PR with `Refs #NNN` on its own Details line (never `Closes` / `Fixes` / `Resolves`; do not use `Part of #NNN` for the ticket that should get preview comments).
2. Add the **`preview-build`** label.
3. Wait for the bot comment on the **PR** and linked issue ([qa-preview-testing.md](qa-preview-testing.md)).
4. Confirm board moved to **In QA** (or move manually if `PROJECT_BOARD_TOKEN` was unavailable).
5. **Do not merge** until QA marks pass (`Passed QA` / explicit approval on the PR).
6. On fail: fix on the same branch → request a **new** preview (below) → QA retests.

## Re-request a preview (fail / retest)

`preview-build.yml` runs on **label added** (`pull_request` types: `labeled`) and always starts a **fresh** Android APK (`FORCE_NEW_BUILD=true`) for that PR’s head commit.

To get a new isolated build after more commits:

1. Remove the `preview-build` label from the PR.
2. Re-add the `preview-build` label.

That triggers a new workflow run, a new install comment, and another best-effort `In QA` move. Always install from the **latest** bot comment for that PR/issue.

## CI / automation (current)

| Piece | Behavior |
| --- | --- |
| [`.github/workflows/preview-build.yml`](../../.github/workflows/preview-build.yml) | Label `preview-build` → fresh EAS `preview` internal APK (binary only, no OTA) |
| [`.github/scripts/preview-notify-linked-issues.cjs`](../../.github/scripts/preview-notify-linked-issues.cjs) | Mirrors install comment to issues linked via `Refs #NNN`; moves Project 4 → `In QA` from `In PR Review` / `In Progress (Dev)` when `PROJECT_BOARD_TOKEN` is set |
| Merge eligibility | **Manual** — no required GitHub status/label yet that blocks merge until QA pass |

### Gap (manual gate)

There is **no** automated branch-protection check that blocks merging a QA-required PR until QA passes. Reviewers and mergers must enforce the invariant. Hardening (required label / checklist / status) is tracked in **#330**.

## Related

- Install / phone steps: [qa-preview-testing.md](qa-preview-testing.md)
- Board rules: [project-board.md](project-board.md)
- Issue / PR linking: [../issue-tracking.md](../issue-tracking.md)
- CI inventory: [../ci.md](../ci.md)
- Agent delivery: [../../AGENTS.md](../../AGENTS.md)
