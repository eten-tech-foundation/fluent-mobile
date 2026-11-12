# GitHub Copilot / IDE agents — Fluent Mobile

Use the **same** contracts as other tools. Do not invent a Copilot-only workflow.

1. [`AGENTS.md`](../AGENTS.md) — shared delivery gates, precedence, ownership, discovery
2. [`CLAUDE.md`](../CLAUDE.md) — Claude adapter (`@AGENTS.md`); useful reading list for any agent
3. [`docs/AGENT_ONBOARDING.md`](../docs/AGENT_ONBOARDING.md)
4. [`docs/guides/project-board.md`](../docs/guides/project-board.md) — plus foreign-ticket stop rules in [`AGENTS.md`](../AGENTS.md) / [`.cursor/rules/foreign-tickets.mdc`](../.cursor/rules/foreign-tickets.mdc)
5. [`docs/guides/expo-first-dependencies.md`](../docs/guides/expo-first-dependencies.md)
6. Canonical commands: [`.claude/commands/`](../.claude/commands/) (read the file; do not assume IDE slash commands exist)

Prefer Expo SDK modules; Android-only permanently; `Refs #NNN` (never closing keywords) or in-session `Refs: none` for approved no-ticket chores.
