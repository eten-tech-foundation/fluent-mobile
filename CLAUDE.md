@AGENTS.md

# Claude Code — Fluent Mobile

Claude Code loads this file when it is present. The `@AGENTS.md` import above is required so Claude receives the shared delivery gates (with both files present, Claude does **not** read `AGENTS.md` by default unless imported or configured otherwise).

## Claude-only paths

- **Commands:** [`.claude/commands/`](.claude/commands/) — `/start-issue`, `/create-pr` (`/open-pr` alias), `/create-pr-branch`, `/generate-pr-description`, `/onboard`, `/dep-bump`, `/handle-dependabot`. Read these files directly; do not rely on Cursor slash-palette shims.
- **Skills:** [`.claude/skills/*/SKILL.md`](.claude/skills/)
- **Review / subagents:** [`.claude/agents/`](.claude/agents/) — invoke `code-reviewer` by path (`.claude/agents/code-reviewer.md`)
- **Hooks:** [`.claude/settings.json`](.claude/settings.json) (architecture-guard warn-only on Edit/Write)
- **Optional topic rules:** [`.claude/rules/`](.claude/rules/) when present (Claude-native; optional `paths` frontmatter)
- **Nested hot-path notes:** [`src/services/AGENTS.md`](src/services/AGENTS.md), [`src/db/AGENTS.md`](src/db/AGENTS.md)

Claude Code does **not** auto-load [`.cursor/rules/`](.cursor/rules/). Prefer `AGENTS.md`, this file, docs, and `.claude/commands` over assuming Cursor injection.

**Must-read when relevant** (shared substance; open these even though Cursor injects them):

- Architecture / layers: [`.cursor/rules/architecture.mdc`](.cursor/rules/architecture.mdc)
- Android-only / CNG: [`.cursor/rules/android-only.mdc`](.cursor/rules/android-only.mdc)
- Foreign tickets: [`.cursor/rules/foreign-tickets.mdc`](.cursor/rules/foreign-tickets.mdc)
- Delivery / `Refs`: [`.cursor/rules/delivery.mdc`](.cursor/rules/delivery.mdc)
- Board hard rules: [`docs/guides/project-board.md`](docs/guides/project-board.md)

## Read next (when relevant)

1. [`docs/AGENT_ONBOARDING.md`](docs/AGENT_ONBOARDING.md) — setup and architecture map
2. [`docs/issue-tracking.md`](docs/issue-tracking.md) — Project 4, branches, `Refs`
3. [`docs/guides/project-board.md`](docs/guides/project-board.md) — board mutation hard rules
4. [`docs/guides/qa-process.md`](docs/guides/qa-process.md) — Needs QA? / post-merge nightly
5. [`docs/guides/expo-first-dependencies.md`](docs/guides/expo-first-dependencies.md)
6. [`docs/ci.md`](docs/ci.md) — local vs CI vs required checks vs device QA

## Non-negotiables (short)

Covered in full by `@AGENTS.md`. Reminders: Android-only permanently; never push/merge to `main`; ticketed branch + PR (or in-session `Refs: none` chore); PR body from [`.cursor/templates/pr-template.md`](.cursor/templates/pr-template.md); no foreign-ticket mutations without per-ID confirmation; Needs QA → post-merge nightly (merge not blocked on QA).

## Package manager / Node

- **npm** only (`package-lock.json`)
- Node `>= 24.14.0` (CI: `.nvmrc` `24.14.0`)
