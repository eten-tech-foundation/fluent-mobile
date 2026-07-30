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
| `In QA` / `Passed QA` / `To Deploy` / `Done` | QA / release | Follow human process; agents set `Done` only when closing completed work with evidence (and usually after merge). |

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
- Set **`Done`** after merge when the issue is completed and `Closes #NNN` did not auto-close, or when closing a completed epic with evidence.

Do **not** “helpfully” reorder neighboring cards.

## Closing keywords and stacked PRs

GitHub auto-closes only when a PR with `Closes #NNN` merges into **`main`**. Stacked PRs whose base is a feature branch must use **`Part of #NNN`** until the final PR targets `main`. See [docs/issue-tracking.md](../issue-tracking.md) and issue #274.

## Related

- Delivery / never push `main`: [`.cursor/rules/delivery.mdc`](../../.cursor/rules/delivery.mdc)
- Cursor always-on pointer: [`.cursor/rules/project-board.mdc`](../../.cursor/rules/project-board.mdc)
