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

For open PRs awaiting review, prefer **`In PR Review`**. For merged/completed work, set **`Done`**.

Do **not** use org Project 7 (“Fluent Mobile App”) as the primary tracker unless the team explicitly migrates.

## Where to file work

1. Create a **GitHub Issue** in `eten-tech-foundation/fluent-mobile` (needed for `#NNN`, branch names, and `Closes #NNN`).
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
- **Body:** link the issue under Details:
  - `Closes #NNN` when the PR **completes** the issue (auto-closes on merge to `main`)
  - For related work that must stay open, say “Part of #NNN” in prose, or link manually in the PR sidebar — do not use a closing keyword
- After opening a PR, set Project 4 Status to **`In PR Review`** (if not already)
- **Template:** [`.cursor/templates/pr-template.md`](../.cursor/templates/pr-template.md) — generate with `/generate-pr-description` or `/create-pr`

### Closing keywords

Use [GitHub closing keywords](https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue) (`Closes`, `Fixes`, `Resolves`) when the PR finishes the issue.

`Refs #NNN` is **not** a GitHub closing keyword — it will not auto-close. Prefer `Closes #NNN` for completed work. After merge, confirm Project 4 Status is **`Done`**.

## Agents / delivery

- Never push commits to `main` — feature branch + PR only ([delivery.mdc](../.cursor/rules/delivery.mdc))
- Done means acceptance criteria, not green CI alone ([AGENTS.md](../AGENTS.md))
- Triage and column moves: Project 4 Fluent Mobile Board — not the bare Issues index
- Dependabot PRs: follow [guides/dependabot-process.md](guides/dependabot-process.md)

## Related

- [docs/ci.md](ci.md) — CI workflows and required-check guardrails
- [docs/AGENT_ONBOARDING.md](AGENT_ONBOARDING.md) — setup and architecture map
