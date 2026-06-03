# Generate PR Description

## Overview

Generates a formatted PR description using [`.cursor/templates/pr-template.md`](../templates/pr-template.md) for copy-paste into GitHub. Run `/generate-pr-description` in Cursor chat.

**No GitHub CLI required** for this command — text output only.

**Always wrap the filled template in a single outer code block** for one-click copy.

## How it works

1. Type `/generate-pr-description`
2. Receive PR title suggestion + full description in one code block
3. Copy into GitHub PR description field
4. Fill remaining placeholders (screenshots, reviewer notes)

## PR title format

**Format:** `TICKET-ID: Title text`

### Rules

1. Extract ticket ID from branch (e.g. `fluent-123` from `mrace/chore/fluent-123-add-cursor-rules` → `FLUENT-123`)
2. Remove prefixes like `[Mobile App]` from Linear titles
3. Sentence case for title text
4. Keep concise

### Examples

- Branch: `mrace/fix/fluent-456-sync-retry` → `FLUENT-456: Sync retry handling`
- Branch: `mrace/chore/add-cursorai-rules` (no ticket) → ask for ticket or use descriptive title: `Chore: Add Cursor AI rules`

## Generation steps

```bash
# Context helpers (read-only)
git branch --show-current
git log origin/main..HEAD --oneline
git diff origin/main...HEAD --stat
```

1. Load template from `.cursor/templates/pr-template.md`
2. Detect branch type: `feature/`, `fix/`, `chore/` → suggest change type checkbox
3. Fetch Linear issue via MCP when ticket ID present
4. Pre-fill Technical Changes and Testing from diff + [docs/AGENT_ONBOARDING.md](../../docs/AGENT_ONBOARDING.md) gates

## Output format

```
📋 **PR Description — Ready to Copy**

[Entire filled template in ONE ``` code block — no nested ``` inside]

Suggested title: FLUENT-123: ...
Branch: mrace/chore/fluent-123-...
Suggested type: 🔧 Maintenance/refactor
```

### Critical — no nested code blocks

- **Never** put triple-backtick fences **inside** the PR description code block
- Use 4-space indentation for code samples inside the block
- Use inline backticks for paths: `src/services/sync.ts`

**Length:** If filled template exceeds ~400 lines, condense to TLDR, Summary, Technical Changes, Testing, How to Test; tell user to expand on GitHub.

## Smart suggestions by branch prefix

| Prefix | Suggested type |
|--------|----------------|
| `feature/` | New feature |
| `fix/`, `bugfix/` | Bug fix |
| `hotfix/` | Bug fix + check Breaking Changes |
| `chore/`, `refactor/` | Maintenance/refactor |
| `docs/` | Documentation update |

## Ticket patterns

- Linear: `FLUENT-123`, `CORE-123`, etc. (uppercase in title; lowercase in branch segment)
- GitHub issues: `#123` in Related Issue when no Linear

## Quality checklist (pre-fill reminders)

Tell reviewer these were run or should be run:

- `npm run format:check`
- `npm run lint`
- `npx tsc --noEmit`
- `FLUENT_USER_EMAIL=test@example.com npm test -- --ci`

Use **npm** in all instructions (not pnpm/yarn).

## Testing section defaults

**Prerequisites:** Node 24+, `npm install`, `.env` from `.env.example`, `npm start` + `npm run android` (or `npm run ios` on macOS)

## Template source

Always read the current [`.cursor/templates/pr-template.md`](../templates/pr-template.md) — do not duplicate template content in this command file.

## Usage

`/generate-pr-description` — optional ticket ID in the same message.

Pairs with `/create-pr-branch` and `/create-pr`.
