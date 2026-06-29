# Generate PR Description

## Overview

Generates a formatted PR description using [`.cursor/templates/pr-template.md`](../templates/pr-template.md) for copy-paste into GitHub. Run `/generate-pr-description` in Cursor chat.

**No GitHub CLI required** for this command — text output only.

**Always wrap the filled template in a single outer code block** for one-click copy.

**Always include a suggested PR title** — the user should never need a separate follow-up for title wording.

## How it works

1. Type `/generate-pr-description`
2. Receive **suggested PR title** (prominent, copy-ready) + full description in one code block
3. Paste title into GitHub PR title field; paste body into description
4. Fill remaining placeholders (screenshots, reviewer notes)

## PR title (mandatory output)

Every run **must** output a suggested title before the description block. Do not ask the user to request a title separately.

### Format

`TICKET-ID: Title text` — present tense, sentence case for title text after the colon.

| Source | Title ID | Example |
|--------|----------|---------|
| GitHub issue branch (`38-cloud-sync-status-icon`) | `#38` | `#38: Build cloud sync status icon` |
| Linear branch segment (`fluent-123-…`) | `FLUENT-123` | `FLUENT-123: Sync retry handling` |
| No ticket | descriptive prefix | `Chore: Add Cursor AI rules` |

### Title synthesis (apply in order)

1. **Detect ticket ID** from branch name:
   - Leading digits + hyphen: `38-cloud-sync-status-icon` → `#38`
   - Linear slug: `…/fluent-123-…` or `fluent-123-…` → `FLUENT-123` (uppercase team prefix)
2. **Fetch issue title** when ID found:
   - GitHub: `gh issue view N --repo eten-tech-foundation/fluent-mobile --json title`
   - Linear: MCP when `LINEAR`/`FLUENT`/`CORE` pattern
3. **Normalize issue title** for PR title text:
   - Strip prefixes like `[Mobile App]`
   - Sentence case (first word capitalized; proper nouns unchanged)
   - Keep concise (~60 chars after colon); trim filler ("Implement", "Add support for") only if redundant with ticket scope
4. **Fallback** when no issue: derive from branch slug after ticket segment (`cloud-sync-status-icon` → `Cloud sync status icon`) or top commit subject (strip `#38:` prefix)
5. **Never** output a generic title like "Update files" or only the ticket ID with no description

### Title examples (this repo)

| Branch | Issue title | Suggested PR title |
|--------|-------------|-------------------|
| `38-cloud-sync-status-icon` | Build Cloud Sync Status Icon | `#38: Build cloud sync status icon` |
| `45-my-work-tab` | Build My Work tab | `#45: Build My Work tab` |
| `mrace/fix/fluent-456-sync-retry` | — | `FLUENT-456: Sync retry handling` |

## Generation steps

```bash
# Context helpers (read-only)
git branch --show-current
git log origin/main..HEAD --oneline
git diff origin/main...HEAD --stat
gh issue view <N> --repo eten-tech-foundation/fluent-mobile --json title,body   # when branch has numeric ID
```

1. Load template from `.cursor/templates/pr-template.md`
2. **Synthesize PR title** (mandatory — see above)
3. Detect branch type: `feature/`, `fix/`, `chore/` → suggest change type checkbox
4. Fetch GitHub/Linear issue when ticket ID present
5. Pre-fill Technical Changes and Testing from diff + [docs/AGENT_ONBOARDING.md](../../docs/AGENT_ONBOARDING.md) gates

## Output format

```
📋 **PR Title (copy this)**

#38: Build cloud sync status icon

**Branch:** 38-cloud-sync-status-icon · **Suggested type:** ✨ New feature

---

📋 **PR Description — Ready to Copy**

[Entire filled template in ONE ``` code block — no nested ``` inside]
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
| Numeric issue slug (`38-…`, `45-…`) | Usually New feature or Bug fix from issue body |

## Ticket patterns

- GitHub issues: `#123` in PR title and **Related Issue** link
- Linear: `FLUENT-123`, `CORE-123`, etc. (uppercase in title; lowercase in branch segment)

## Quality checklist (pre-fill reminders)

Tell reviewer these were run or should be run:

- `npm run format:check`
- `npm run lint`
- `npx tsc --noEmit`
- `npm test -- --ci`

Use **npm** in all instructions (not pnpm/yarn).

## Testing section defaults

Fluent Mobile is **Android-only** for now. Generated PR descriptions must not include iOS testing steps, `npm run ios`, or iOS simulator/device checkboxes.

**Prerequisites:** Node 24+, `npm install`, `.env` from `.env.example`, `npm start` + `npm run android`

## Template source

Always read the current [`.cursor/templates/pr-template.md`](../templates/pr-template.md) — do not duplicate template content in this command file.

## Usage

`/generate-pr-description` — optional ticket ID in the same message.

Pairs with `/create-pr-branch` and `/create-pr`.
