# Agent delivery guardrails — Fluent Mobile

Cross-tool source of truth for **delivery judgment** (any coding agent, IDE assistant, or human contributor). Architecture, commands, and CI gates live elsewhere; this file is the contract for *when work is done* and *how large a change should be*.

**Precedence:** fluent-mobile repo rules and docs win over org-wide umbrella playbooks. See [`.cursor/rules/rule-precedence.mdc`](.cursor/rules/rule-precedence.mdc).

## For agents / tools

| Start here | Purpose |
|------------|---------|
| [docs/AGENT_ONBOARDING.md](docs/AGENT_ONBOARDING.md) | Setup, architecture map, common tasks |
| [`.cursor/rules/`](.cursor/rules/) | Cursor-injected rules (architecture, delivery, Android-only, etc.) |
| This file (`AGENTS.md`) | AC, scope, abstraction, and human QA gates |

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

If a change adds **native modules** or **mic / camera / filesystem / permissions** behavior:

- **Android device QA is required** (unit tests and CI are not enough).
- Keep the PR **draft** or **changes-requested** until a human records device results on the PR.
- Agents must **flag** this requirement; do not check the device-QA box unless a human verified it.

### 5. Agent-authorship is a review heuristic

On feature PRs with heavy agent co-authorship, reviewers should prioritize **scope**, **abstraction**, and **AC vs CI** first — the usual failure modes for agent-assisted work — not only style or local correctness.

## Related

- Delivery / branch / PR process: [`.cursor/rules/delivery.mdc`](.cursor/rules/delivery.mdc) — **PR bodies must use** [`.cursor/templates/pr-template.md`](.cursor/templates/pr-template.md)
- Issue tracking (GitHub Issues): [docs/issue-tracking.md](docs/issue-tracking.md)
- CI command order: [`.cursor/rules/commands.mdc`](.cursor/rules/commands.mdc)
- CI inventory: [docs/ci.md](docs/ci.md)
- PR body template: [`.cursor/templates/pr-template.md`](.cursor/templates/pr-template.md)
