# Issue tracking (fluent-mobile)

## Canonical board (source of truth)

**Fluent Mobile Board** — [org Project 4, view 9](https://github.com/orgs/eten-tech-foundation/projects/4/views/9)

| | |
| --- | --- |
| Org project | [Fluent](https://github.com/orgs/eten-tech-foundation/projects/4) (project **#4**) |
| Mobile triage view | **View 9 — Fluent Mobile Board** |
| Status / columns | Set on **Project 4** only (not by scanning the repo Issues list) |

The [repo Issues list](https://github.com/eten-tech-foundation/fluent-mobile/issues) is **not** the triage board. Cards are still GitHub Issues (`#NNN`) linked into Project 4; agents must treat **Project 4 → Fluent Mobile Board** as canonical for backlog, in-progress, review, and done.

### Project 4 Status options (as of 2026-07)

`Backlog` · `In Progress (Product)` · `Product Ready` · `Sprint Shaping` · `Dev Ready` · `In Progress (Dev)` · `In PR Review` · `In QA` · `Passed QA` · `To Deploy` · `Done`

For open PRs awaiting review, prefer **`In PR Review`**. After merge (or when ready for QA), set **`In QA`**. Set **`Done`** only after QA completes — never auto-close issues on PR merge.

Do **not** use org Project 7 (“Fluent Mobile App”) as the primary tracker unless the team explicitly migrates.

### Agent board mutations (mandatory)

Agents must follow [guides/project-board.md](guides/project-board.md) before changing Project 4 Status or Priority:

- Do **not** move `Dev Ready` cards to `Backlog` / `Sprint Shaping` to sequence work — use Priority inside `Dev Ready`, or ask.
- Do **not** edit `In Progress (Product)` (or other Product-owned columns) unless the tech lead explicitly names those issues.
- Broad board sweeps require a proposed change set and explicit approval.

## Where to file work

1. Create a **GitHub Issue** in `eten-tech-foundation/fluent-mobile` (needed for `#NNN`, branch names, and `Refs #NNN`).
2. **Add the issue to Project 4** and set Status on the Fluent Mobile Board (view 9).
3. Assign the owner on the issue.

Prefer a ticketed card for every non-trivial change before opening a PR. **Not Linear.**

## Labels

Use existing repo labels when they fit (`documentation`, `bug`, Dependabot labels, etc.). Keep labels light; column status lives on Project 4.

## Branch naming

```text
{author}/{type}/{issue-number}-{short-slug}
```

Examples:

- `mrace/chore/173-phase1-agent-process-docs`
- `mrace/fix/88-auth-token-accessor`
- `mrace/feature/113-api-client-standard`

| Segment | Values |
| ------- | ------ |
| `author` | Local part of `git config user.email` (e.g. `mrace`) |
| `type` | `feature`, `fix`, or `chore` only |
| `issue-number` | GitHub issue number (digits only in the branch segment) |
| `slug` | 3–6 meaningful words from the issue title |

See [`.cursor/commands/create-pr-branch.md`](../.cursor/commands/create-pr-branch.md).

## Pull requests

- **Base branch:** `main`
- **Title:** `[#NNN]: Short description` (or `#NNN: Short description`) — match existing PR style in this repo
- **Body:** **required** — fill [`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md) / [`.cursor/templates/pr-template.md`](../.cursor/templates/pr-template.md) (same content: TLDR, Reviewer checklist, Details, Technical changes, Testing, How to verify, Follow-ups). The **`PR Description`** check fails empty / CodeRabbit-only bodies. Prefer `/generate-pr-description` or `/create-pr`. Do not ship a short Summary/Test plan substitute.
  - Under Details: `Refs #NNN` on its own line (links the issue without closing it)
  - Do **not** use GitHub closing keywords (`Closes`, `Fixes`, `Resolves`) — merged PRs must not auto-close issues
  - **Assignee:** agents must assign the PR to the author (`--assignee @me`)
  - **Development sidebar:** closing keywords are the only API-friendly way to auto-populate GitHub’s “linked issues” widget; we refuse those keywords, so link `#NNN` manually in the PR sidebar when the widget is empty (or ask a human). `Refs #NNN` still cross-references the issue in timelines.
  - For related / stacked work that is not the full ticket, say “Part of #NNN” in prose, or link manually in the PR sidebar
- After opening a PR, set Project 4 Status to **`In PR Review`** (if not already)
- After merge (or when ready for QA), set Project 4 Status to **`In QA`** — leave the GitHub issue **open**
- **Template source of truth:** [`.cursor/templates/pr-template.md`](../.cursor/templates/pr-template.md) — also required by [delivery.mdc](../.cursor/rules/delivery.mdc); generate with `/generate-pr-description` or `/create-pr`

### Linking without auto-close

Use `Refs #NNN` (or sidebar linking) so GitHub [does not auto-close](https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue) the issue on merge.

Never use `Closes`, `Fixes`, or `Resolves` in PR bodies for ticketed work. Issues stay open until QA finishes; humans set **`Done`** (and may close the issue) after **Passed QA** / release process — not on merge alone.

Put `Refs #NNN` on its **own line** under Details (see the PR template). Preview-build notification ([`.github/scripts/preview-notify-linked-issues.cjs`](../.github/scripts/preview-notify-linked-issues.cjs)) treats that form as the linked ticket for install comments and Project 4 → **In QA**. `Part of #NNN` is ignored by that script (stacked/partial work stays out of automatic QA handoff).

## Agents / delivery

- Never push commits to `main` — feature branch + PR only ([delivery.mdc](../.cursor/rules/delivery.mdc))
- Done means acceptance criteria, not green CI alone ([AGENTS.md](../AGENTS.md))
- Triage and column moves: Project 4 Fluent Mobile Board — not the bare Issues index
- Dependabot PRs: follow [guides/dependabot-process.md](guides/dependabot-process.md)

## Related

- [guides/project-board.md](guides/project-board.md) — board mutation hard rules for agents
- [guides/expo-first-dependencies.md](guides/expo-first-dependencies.md) — prefer Expo packages
- [docs/ci.md](ci.md) — CI workflows and required-check guardrails
- [docs/AGENT_ONBOARDING.md](AGENT_ONBOARDING.md) — setup and architecture map
- [CLAUDE.md](../CLAUDE.md) — cross-tool agent entrypoint
