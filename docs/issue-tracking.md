# Issue tracking (fluent-mobile)

## Where to file work

**GitHub Issues:** https://github.com/eten-tech-foundation/fluent-mobile/issues

For now, **GitHub Issues** are the ticket tracker for this repo (not Linear). Prefer a GitHub issue for every non-trivial change before opening a PR.

## Labels

Use existing repo labels when they fit (`documentation`, `bug`, Dependabot labels, etc.). Do not invent a large label taxonomy in docs — keep labels light until the team agrees on a board.

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
- **Body:** **required** — fill [`.cursor/templates/pr-template.md`](../.cursor/templates/pr-template.md) (TLDR, Reviewer checklist, Details, Technical changes, Testing, How to verify, Follow-ups). Prefer `/generate-pr-description` or `/create-pr`. Do not ship a short Summary/Test plan substitute.
  - Under Details: `Closes #NNN` when the PR **completes** the issue (auto-closes on merge to `main`)
  - For related work that must stay open, say “Part of #NNN” in prose, or link manually in the PR sidebar — do not use a closing keyword
- **Template source of truth:** [`.cursor/templates/pr-template.md`](../.cursor/templates/pr-template.md) — also required by [delivery.mdc](../.cursor/rules/delivery.mdc)

### Closing keywords

Use [GitHub closing keywords](https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue) (`Closes`, `Fixes`, `Resolves`) when the PR finishes the issue.

`Refs #NNN` is **not** a GitHub closing keyword — it will not auto-close. Prefer `Closes #NNN` for completed work.

## Agents / delivery

- Never push commits to `main` — feature branch + PR only ([delivery.mdc](../.cursor/rules/delivery.mdc))
- Done means acceptance criteria, not green CI alone ([AGENTS.md](../AGENTS.md))
- Dependabot PRs: follow [guides/dependabot-process.md](guides/dependabot-process.md)

## Related

- [docs/ci.md](ci.md) — CI workflows and required-check guardrails
- [docs/AGENT_ONBOARDING.md](AGENT_ONBOARDING.md) — setup and architecture map
