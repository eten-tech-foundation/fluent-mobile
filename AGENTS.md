# Agent delivery guardrails — Fluent Mobile

Shared contract for **Claude Code**, **Cursor**, **Codex**, **GitHub Copilot**, and human contributors. This file is the authority for *when work is done* and *how large a change should be*. Tool-specific adapters import or point here; they must not fork these gates.

## Precedence

This repo is **eten-tech-foundation/fluent-mobile**. Prefer **this repository’s** `AGENTS.md`, `docs/`, `.claude/` commands/skills/agents, and `.cursor/rules/` over org-wide / umbrella playbooks (TangoGroup, Team Gloo, or other shared Cursor packs), including workflow spines that assume a different default branch, merge policy, or ticket system.

When an umbrella instruction and a fluent-mobile rule disagree, **fluent-mobile wins**. If this repo is silent on an org-wide process, ask the user — do not invent policy from umbrella rules alone.

## Policy ownership (one home each)

| Policy | Authoritative home | Adapters / pointers |
| ------ | ------------------ | ------------------- |
| Delivery judgment (AC, scope, abstraction, Needs QA) | This file | `CLAUDE.md` (`@AGENTS.md`), Copilot instructions, Cursor rules |
| Local CI gate order | [`.cursor/rules/commands.mdc`](.cursor/rules/commands.mdc) + short list below | Commands, onboarding, PR template |
| Branch / PR / `Refs` / never push `main` | [`.cursor/rules/delivery.mdc`](.cursor/rules/delivery.mdc) | `/create-pr`, `/start-issue` |
| PR open → review → CI watch | [`.claude/commands/create-pr.md`](.claude/commands/create-pr.md) | `/open-pr` alias; Cursor/Codex shims read this file |
| Architecture / layer boundaries | [`.cursor/rules/architecture.mdc`](.cursor/rules/architecture.mdc) | `src/services/AGENTS.md`, `src/db/AGENTS.md` |
| Android-only / CNG | [`.cursor/rules/android-only.mdc`](.cursor/rules/android-only.mdc) | Expo MCP rule when doing SDK/EAS work |
| Foreign tickets | [`.cursor/rules/foreign-tickets.mdc`](.cursor/rules/foreign-tickets.mdc) | Board guide |
| Project 4 board mutations | [docs/guides/project-board.md](docs/guides/project-board.md) | [`.cursor/rules/project-board.mdc`](.cursor/rules/project-board.mdc) |
| Expo-first dependencies | [docs/guides/expo-first-dependencies.md](docs/guides/expo-first-dependencies.md) | Cursor / Claude path-scoped rules |
| Dependabot queue | [docs/guides/dependabot-process.md](docs/guides/dependabot-process.md) | Thin Cursor adapter + `/handle-dependabot` |
| QA handoff | [docs/guides/qa-process.md](docs/guides/qa-process.md) | Delivery + PR template |
| CI inventory / required checks | [docs/ci.md](docs/ci.md) | `commands.mdc` |

## Discovery (verified)

| Primitive | Claude Code | Cursor | Codex | Copilot |
| --------- | ----------- | ------ | ----- | ------- |
| Shared entry | With both files present, loads **`CLAUDE.md`** by default — this repo uses `@AGENTS.md` inside `CLAUDE.md` so Claude gets these gates | Root `AGENTS.md` + Cursor rules | Root `AGENTS.md` | [`.github/copilot-instructions.md`](.github/copilot-instructions.md) → this file |
| Topic rules | `.claude/rules/*.md` (optional); does **not** auto-load `.cursor/rules` | `.cursor/rules/*.mdc` | Via this file + docs | Via Copilot → this file + docs |
| Commands | `.claude/commands/*.md` (native) | `.cursor/commands/` are slash-palette shims only — **read** `.claude/commands/` | Local `.agents/skills/source-command-*` wrappers point at `.claude/commands/` | Follow docs / ask |
| Skills / agents | `.claude/skills/`, `.claude/agents/` | Documented discovery of `.claude/` (+ `.agents/skills`) | Prefer shared content under `.claude/`; invoke reviewer **by path** | N/A |
| Hooks | `.claude/settings.json` | `.cursor/hooks.json` | `.codex/` (machine-local, gitignored) | N/A |

Do not claim a rule, hook, skill, or command loads automatically unless verified for that tool.

**Shared (committed):** `AGENTS.md`, `CLAUDE.md`, `.claude/**`, `.cursor/rules|commands|hooks|templates`, Copilot instructions, docs.  
**Local (ignored):** `.codex/`, generated `/.agents/skills/source-command-*/`, `/worktrees/`.

## For agents / tools

| Start here | Purpose |
| ---------- | ------- |
| This file (`AGENTS.md`) | AC, scope, abstraction, human QA, precedence, ownership |
| [CLAUDE.md](CLAUDE.md) | Claude Code adapter (`@AGENTS.md` + Claude-only paths) |
| [docs/AGENT_ONBOARDING.md](docs/AGENT_ONBOARDING.md) | Setup, architecture map, common tasks |
| [docs/guides/project-board.md](docs/guides/project-board.md) | Project 4 board mutation hard rules |
| [docs/guides/expo-first-dependencies.md](docs/guides/expo-first-dependencies.md) | Prefer Expo SDK packages when available |
| [`.claude/commands/`](.claude/commands/) | Canonical workflows (`/start-issue`, `/create-pr`, …) |
| [docs/README.md](docs/README.md) | Docs directory convention — features/, runbooks/, guides/, tasks/ |

`.cursor/rules/*.mdc` are readable Markdown. Cursor may auto-inject a subset; Claude Code / Codex do **not** auto-load them — rely on this file, `CLAUDE.md` imports, docs, and commands. When doing architecture, Android/CNG, foreign-ticket, or delivery work, **open the authoritative files in the ownership table** (do not assume Cursor injection).

## Local CI gates (before claiming PR-ready)

Authoritative Cursor injection: [`.cursor/rules/commands.mdc`](.cursor/rules/commands.mdc). Same order for every tool:

1. `npm run format:check`
2. `npm run lint`
3. `npm run architecture-guard`
4. `npm run typecheck`
5. `npm test -- --ci`

Green CI is **not** fulfilled acceptance criteria and **not** successful device QA.

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

## Review (proportional)

Before handoff, run **one** independent review of the final intended diff via [`.claude/agents/code-reviewer.md`](.claude/agents/code-reviewer.md) (invoke **by path**). Fix every finding or record a per-item human waiver; re-run local gates. A **second** full review is required only when fixes introduce material behavior, contract, scope, or risk changes; when new hunks go beyond applying listed findings; or when correctness remains uncertain. Do not loop full reviews for mechanical format/lint/type fixes. Never silently waive unresolved blockers. Procedure: [`.claude/commands/create-pr.md`](.claude/commands/create-pr.md).

## Related

- Delivery / branch / PR: [`.cursor/rules/delivery.mdc`](.cursor/rules/delivery.mdc) — PR bodies from [`.cursor/templates/pr-template.md`](.cursor/templates/pr-template.md). Full loop: `/start-issue`; delivery-only: `/create-pr` (`.claude/commands/`).
- Issue tracking: [docs/issue-tracking.md](docs/issue-tracking.md)
- QA / nightly: [docs/guides/qa-process.md](docs/guides/qa-process.md) · [docs/guides/qa-preview-testing.md](docs/guides/qa-preview-testing.md)
- Board: [docs/guides/project-board.md](docs/guides/project-board.md)
- Foreign tickets: [`.cursor/rules/foreign-tickets.mdc`](.cursor/rules/foreign-tickets.mdc)
- Expo-first: [docs/guides/expo-first-dependencies.md](docs/guides/expo-first-dependencies.md)
- CI inventory: [docs/ci.md](docs/ci.md)
