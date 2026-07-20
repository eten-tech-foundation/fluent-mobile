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

`[#NNN]: Title text` — present tense, sentence case for title text after the colon.

| Source | Title ID | Example |
|--------|----------|---------|
| GitHub issue in branch (`…/173-…` or `38-…`) | `#173` | `[#173]: Adopt Phase 1 agent/process docs` |
| No ticket | descriptive prefix | `Chore: Add Cursor AI rules` |

**Tracker:** Project 4 Fluent Mobile Board ([docs/issue-tracking.md](../../docs/issue-tracking.md)).

### Title synthesis (apply in order)

1. **Detect issue number** from branch name:
   - Author/type path: `mrace/chore/173-phase1-…` → `#173`
   - Leading digits + hyphen: `38-cloud-sync-status-icon` → `#38`
2. **Fetch issue title** when ID found:
   - `gh issue view N --repo eten-tech-foundation/fluent-mobile --json title`
3. **Normalize issue title** for PR title text:
   - Strip prefixes like `[Mobile App]`
   - Sentence case (first word capitalized; proper nouns unchanged)
   - Keep concise (~60 chars after colon); trim filler ("Implement", "Add support for") only if redundant with issue scope
4. **Fallback** when no issue: derive from branch slug after issue segment (`cloud-sync-status-icon` → `Cloud sync status icon`) or top commit subject (strip `#38:` prefix)
5. **Never** output a generic title like "Update files" or only the issue number with no description

### Title examples (this repo)

| Branch | Issue title | Suggested PR title |
|--------|-------------|-------------------|
| `mrace/chore/173-phase1-agent-process-docs` | Adopt Phase 1… | `[#173]: Adopt Phase 1 agent/process docs` |
| `38-cloud-sync-status-icon` | Build Cloud Sync Status Icon | `[#38]: Build cloud sync status icon` |
| `45-my-work-tab` | Build My Work tab | `[#45]: Build My Work tab` |

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
4. Fetch GitHub issue when issue number present (`Closes #NNN` in Details)
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

- GitHub issues: `[#123]` / `#123` in PR title; `Closes #123` under Details when the PR completes the issue

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
