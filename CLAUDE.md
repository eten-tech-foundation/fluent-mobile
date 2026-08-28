# Claude / cross-tool agents — Fluent Mobile

This file is the **entrypoint for non-Cursor agents** (Claude Code, Codex, Copilot Chat, etc.). Cursor also injects [`.cursor/rules/`](.cursor/rules/); those `.mdc` files are plain Markdown with YAML frontmatter — **read them** even if your tool does not auto-load Cursor rules.

## Read in this order

1. [`AGENTS.md`](AGENTS.md) — delivery judgment (AC, scope, abstraction, device QA)
2. [`docs/AGENT_ONBOARDING.md`](docs/AGENT_ONBOARDING.md) — setup, architecture, commands
3. [`docs/issue-tracking.md`](docs/issue-tracking.md) — Project 4 board, branches, PRs
4. [`docs/guides/project-board.md`](docs/guides/project-board.md) — **board mutation hard rules**
5. [`docs/guides/qa-process.md`](docs/guides/qa-process.md) — Needs QA? / post-merge nightly QA
6. [`docs/guides/expo-first-dependencies.md`](docs/guides/expo-first-dependencies.md) — prefer Expo packages
7. [`.cursor/rules/`](.cursor/rules/) — always-on + topic rules (`delivery`, `architecture`, `android-only`, `project-board`, `expo-first-dependencies`, …)
8. [`.claude/commands/`](.claude/commands/) — canonical slash commands (`/start-issue`, `/create-pr`, …). Cursor `/` palette shims live in [`.cursor/commands/`](.cursor/commands/).

## Precedence

**This repository’s** `docs/`, `AGENTS.md`, and `.cursor/rules/` win over org-wide / umbrella agent playbooks. See [`.cursor/rules/rule-precedence.mdc`](.cursor/rules/rule-precedence.mdc).

## Non-negotiables (short)

- Android-only permanently; CNG — do not commit generated `android/`
- Never push or merge to `main`; ticketed branch + PR; PR body from [`.cursor/templates/pr-template.md`](.cursor/templates/pr-template.md). Full loop: `/start-issue NNN` (chains to `/create-pr`). Delivery-only: `/create-pr` (`/open-pr` alias).
- Do not reorganize Project 4 (`Dev Ready` / Product columns) without an approved change set
- Do **not** move or edit tickets that are not fluent-mobile / Project 4 (other repos, other projects, Linear) without stopping and per-ticket confirmation — [`.cursor/rules/foreign-tickets.mdc`](.cursor/rules/foreign-tickets.mdc)
- Prefer Expo SDK modules; do not rip out React Navigation without a ticket
- Needs QA per [docs/guides/qa-process.md](docs/guides/qa-process.md) → post-merge handoff → human Android device QA on the **nightly** (merge is not blocked on QA)

## Package manager / Node

- **npm** only (`package-lock.json`)
- Node `>= 24.14.0`
