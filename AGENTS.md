# Agent delivery guardrails — Fluent Mobile

Cross-tool source of truth for **delivery judgment** (any coding agent, IDE assistant, or human contributor). Architecture, commands, and CI gates live elsewhere; this file is the contract for *when work is done* and *how large a change should be*.

**Precedence:** fluent-mobile repo rules and docs win over org-wide umbrella playbooks. See [`.cursor/rules/rule-precedence.mdc`](.cursor/rules/rule-precedence.mdc).

## For agents / tools

| Start here | Purpose |
|------------|---------|
| [CLAUDE.md](CLAUDE.md) | Cross-tool entrypoint (Claude Code, Copilot, non-Cursor agents) |
| [docs/AGENT_ONBOARDING.md](docs/AGENT_ONBOARDING.md) | Setup, architecture map, common tasks |
| [docs/guides/project-board.md](docs/guides/project-board.md) | Project 4 board mutation hard rules |
| [docs/guides/expo-first-dependencies.md](docs/guides/expo-first-dependencies.md) | Prefer Expo SDK packages when available |
| [`.cursor/rules/`](.cursor/rules/) | Always-on + topic rules (plain Markdown — readable by any tool) |
| This file (`AGENTS.md`) | AC, scope, abstraction, and human QA gates |
| [docs/README.md](docs/README.md) | Docs directory convention — features/, runbooks/, guides/, tasks/. Brainstorming/writing-plans skill output goes to `docs/features/<slug>/`, not the skill's default `docs/superpowers/...` |

`.cursor/rules/*.mdc` are **not** Cursor-only secrets: any agent should open them. Cursor auto-injects a subset; Claude Code / Copilot should follow [CLAUDE.md](CLAUDE.md) and [`.github/copilot-instructions.md`](.github/copilot-instructions.md).

## Gates

### 1. Done = acceptance criteria, not green CI

Every ticket acceptance criterion is either **implemented** or **explicitly waived in the ticket** with a **linked follow-up issue**.

- A note in the PR body (“known limitations”) is **not** a waiver.
- Incomplete AC with no ticket-level waiver means the work is **not** ready for review.

### 2. One ticket = one PR

Do not implement or stub **adjacent** tickets unless the assigned ticket asks for it.

- Prefer a thinner slice of the assigned ticket over pulling in neighbors.
- If a ticket genuinely spans UI + native + DB + filesystem, **split by layer** or get **explicit human approval** to land as one PR **before** writing code.

### 3. Abstraction budget

No use-case-agnostic adapter, framework, or generic layer unless:

- a **second real caller** already exists in-repo, or
- the **ticket asks** for that abstraction.

Build for the case in front of you.

### 4. Human-only verification

If a change adds **native modules** or **mic / camera / filesystem / permissions** behavior (or otherwise **Needs QA** per [docs/guides/qa-process.md](docs/guides/qa-process.md)):

- Mark **Needs QA? Yes** on the PR (`Refs #NNN`). Unit tests and CI are not enough for device behavior.
- **Merge is not blocked on QA** — engineer approval + green CI is enough. After merge, automation hands the ticket to QA (`In QA`, `@Roslin22`); QA tests the **nightly** APK.
- Agents must **flag** Needs QA; do not claim device QA passed unless a human verified it on the nightly (or an optional PR preview used only for debugging).

### 5. Agent-authorship is a review heuristic

On feature PRs with heavy agent co-authorship, reviewers should prioritize **scope**, **abstraction**, and **AC vs CI** first — the usual failure modes for agent-assisted work — not only style or local correctness.

## Related

- Delivery / branch / PR process: [`.cursor/rules/delivery.mdc`](.cursor/rules/delivery.mdc) — **PR bodies must use** [`.cursor/templates/pr-template.md`](.cursor/templates/pr-template.md). Full loop: `/start-issue`; delivery-only: `/create-pr` (`.claude/commands/`).
- Issue tracking (Project 4 Fluent Mobile Board): [docs/issue-tracking.md](docs/issue-tracking.md)
- QA process / post-merge nightly: [docs/guides/qa-process.md](docs/guides/qa-process.md) · install how-to: [docs/guides/qa-preview-testing.md](docs/guides/qa-preview-testing.md)
- Board mutation rules: [docs/guides/project-board.md](docs/guides/project-board.md) · [`.cursor/rules/project-board.mdc`](.cursor/rules/project-board.mdc)
- Foreign tickets (other repos / projects / Linear): [`.cursor/rules/foreign-tickets.mdc`](.cursor/rules/foreign-tickets.mdc) — stop and get per-ticket confirmation
- Expo-first deps: [docs/guides/expo-first-dependencies.md](docs/guides/expo-first-dependencies.md) · [`.cursor/rules/expo-first-dependencies.mdc`](.cursor/rules/expo-first-dependencies.mdc)
- CI command order: [`.cursor/rules/commands.mdc`](.cursor/rules/commands.mdc)
- CI inventory: [docs/ci.md](docs/ci.md)
- PR body template: [`.cursor/templates/pr-template.md`](.cursor/templates/pr-template.md)
