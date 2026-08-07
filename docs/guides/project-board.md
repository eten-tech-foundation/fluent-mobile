# Project 4 board mutation rules (agents)

Canonical tracker: **Fluent Mobile Board** — [org Project 4, view 9](https://github.com/orgs/eten-tech-foundation/projects/4/views/9). See also [docs/issue-tracking.md](../issue-tracking.md).

This guide is for **any** coding agent (Cursor, Claude Code, Copilot, etc.). Board mistakes waste tech-lead time and fight Product ownership.

## Status meanings (do not reinvent)

| Status | Who owns it | Agent meaning |
| --- | --- | --- |
| `In Progress (Product)` | Product | Requirements / design still being shaped. **Do not edit** Status or Priority unless the tech lead **explicitly names** those issue numbers. |
| `Product Ready` / `Sprint Shaping` | Product + eng triage | Not a free-for-all backlog dump for agents. |
| `Dev Ready` | Eng can code | Product/engineering already approved this for implementation. **Do not** move these cards to `Backlog` or `Sprint Shaping` to “sequence” or “clean up” the board. |
| `In Progress (Dev)` | Assignee | Actively coding. |
| `In PR Review` | Reviewers | Open PR exists (or should). Prefer this over leaving a card in `Dev Ready` once a PR is up. |
| `In QA` / `Passed QA` / `To Deploy` / `Done` | QA / release | Follow human process. After merge, agents set **`In QA`** (not `Done`). Do **not** auto-close issues. Agents set `Done` only when a human/QA process asks, or when closing obsolete/duplicate work with an approved change set. |

## Hard rules

1. **No board sweeps without an approved change set.** Present proposed Status/Priority moves (grouped, with issue numbers + reason) and wait for explicit approval. Ambiguous approval = no approval.
2. **Never touch Product-owned columns by default.** Especially `In Progress (Product)` cards (e.g. Product claim/conflict work). Status **and** Priority are off-limits unless those issues were named in the approval.
3. **`Dev Ready` stays `Dev Ready`.** Sequencing for a new developer is done with **Priority** (`P0`/`P1`/`P2`) **inside** `Dev Ready`, or with verbal/PR guidance — not by relocating approved work to `Backlog` / `Sprint Shaping`.
4. **Do not merge PRs** unless the user explicitly asks to merge that PR (Dependabot squash-merge is the only standing exception when they ask to process Dependabot). Prefer opening/updating PRs only.
5. **Closing issues** (completed / duplicate / obsolete) still needs an approved change set when part of tracker cleanup. Cite evidence on `main` (commits, merged PRs, files) — never close from comments alone.
6. **One ticket = one PR** still applies ([AGENTS.md](../../AGENTS.md)). Board status for the ticketed issue: set **`In PR Review`** after opening the PR.

## Allowed without a full board audit

When implementing the **assigned** ticket only:

- Add the new issue to Project 4 if missing.
- Set that issue to `In Progress (Dev)` while coding (optional) and **`In PR Review`** when the PR is open.
- Set **`In QA`** after merge (or when ready for QA). Leave the GitHub issue open — never use closing keywords in the PR.
- Set **`Done`** only after QA completes (human/QA process), or when closing obsolete/duplicate work with an approved change set and evidence.

Do **not** “helpfully” reorder neighboring cards.

## Linking keywords and stacked PRs

Do **not** use GitHub closing keywords (`Closes`, `Fixes`, `Resolves`) — they auto-close issues on merge to `main`. Always use **`Refs #NNN`** for the ticket this PR implements, or **`Part of #NNN`** for stacked/partial work. After merge of a `Refs`-linked PR (or when ready for QA), move the card to **`In QA`**. Preview-build automation follows the same rule: it comments / moves **In QA** for `Refs #NNN` (and legacy closing keywords), and does **not** treat `Part of #NNN` as a linked ticket. See [docs/issue-tracking.md](../issue-tracking.md). (Historical: issue #274 required `Closes` on `main`-targeting PRs; superseded by #300.)

## Related

- Delivery / never push `main`: [`.cursor/rules/delivery.mdc`](../../.cursor/rules/delivery.mdc)
- Cursor always-on pointer: [`.cursor/rules/project-board.mdc`](../../.cursor/rules/project-board.mdc)
