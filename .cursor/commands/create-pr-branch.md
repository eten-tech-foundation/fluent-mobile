# Create PR Branch

## Overview

Creates a new git branch using the team naming convention:

```text
{author}/{type}/{ticket-id}-{slug-from-title}
```

**Example:** `mrace/chore/fluent-123-add-cursorai-rules`

Run with `/create-pr-branch` in Cursor chat.

## Branch name format

| Segment | Source | Example |
| ------- | ------ | ------- |
| `author` | Local part of `git config user.email` | `mrace` |
| `type` | `feature`, `fix`, or `chore` only | `chore` |
| `ticket-id` | Linear identifier, lowercase | `fluent-123` |
| `slug` | Meaningful words from ticket title | `add-cursorai-rules` |

**Full pattern:** `{author}/{type}/{ticket-id}-{slug}`

## When you run this command

Execute these steps in order. Do not skip validation or user confirmation before creating the branch.

### 1. Resolve ticket ID

- If the user message or recent conversation already includes a Linear ticket (e.g. `FLUENT-123`), use it.
- Otherwise, **ask once**: "What's the Linear ticket ID? (e.g. FLUENT-123)"
- Normalize to uppercase team prefix + number (e.g. `FLUENT-123`).

### 2. Fetch Linear ticket

- Use the Linear MCP `get_issue` tool with the ticket ID.
- If the ticket is not found, report the error and stop.

### 3. Resolve branch author prefix

Use the **local part** of `git config user.email` (everything before `@`):

```bash
git config user.email
# mrace@gloo.us → mrace
```

Rules: lowercase only; strip `+tag` suffixes if present (e.g. `mrace+wip` → `mrace`); allow `a-z0-9-` only in the final prefix.

If `user.email` is unset, ask the user to configure git (`git config user.email you@gloo.us`) or provide their email prefix once, then stop.

### 4. Determine branch type (`feature` | `fix` | `chore`)

Use **only** these three types.

**Infer from Linear (in order):**

| Signal | Type |
| ------ | ---- |
| Labels contain `bug`, `bugfix`, `hotfix`, `defect` | `fix` |
| Labels contain `chore`, `maintenance`, `tech-debt`, `dependencies` | `chore` |
| Labels contain `feature`, `story`, `enhancement` | `feature` |
| Title starts with or contains strong fix signals: `fix`, `fixes`, `fixed`, `bug`, `hotfix`, `resolve` | `fix` |
| Title signals: `add`, `implement`, `introduce`, `support`, `enable` | `feature` |
| Title signals: `replace`, `migrate`, `upgrade`, `bump`, `refactor`, `remove`, `cleanup`, `chore`, `update` (non-user-facing) | `chore` |

If still ambiguous, use **AskQuestion** with: feature / fix / chore (default from best guess).

### 5. Build title slug

From the Linear **title** (not description):

1. Remove prefixes like `[Mobile App]`, `(Mobile)`, etc.
2. Lowercase the title.
3. Split into words (alphanumeric tokens); split camelCase into words when obvious.
4. **Drop filler words:** `a`, `an`, `the`, `and`, `or`, `but`, `for`, `with`, `from`, `into`, `to`, `of`, `in`, `on`, `at`, `by`, `as`, `is`, `are`, `was`, `were`, `be`, `been`, `being`, `this`, `that`, `these`, `those`, `it`, `its`, `via`, `using`, `use`, `please`
5. Keep **3–6 meaningful words**; cap slug length (~45 chars after ticket id).
6. Join with single hyphens; lowercase `a-z0-9-` only.

**Ticket segment:** lowercase identifier, e.g. `fluent-123`.

**Final branch name:**

```text
{author}/{type}/{ticket-id}-{slug}
```

### 6. Pre-flight checks

```bash
git status --porcelain
git branch --show-current
git branch --list '{proposed-branch-name}'
```

- If the proposed branch **already exists**, stop and tell the user.
- If there are **uncommitted changes**, warn and ask whether to continue (do not stash unless the user asks).
- If not on `main`, note the current branch and confirm they want to branch from here.

### 7. Confirm with user

Show a short summary before creating:

```text
Branch: mrace/chore/fluent-123-add-cursorai-rules
Ticket: FLUENT-123 — Add Cursor AI rules
Base:   main @ abc1234
```

Ask: **"Create this branch?"** (or create immediately if the user was explicit).

### 8. Create branch

```bash
git checkout -b "{author}/{type}/{ticket-id}-{slug}"
```

If branching from `main` explicitly and behind:

```bash
git fetch origin main && git checkout main && git pull --ff-only origin main
git checkout -b "..."
```

Report success and remind them to use `/create-pr` when ready.

## Integration

- Pairs with `/create-pr` and `/generate-pr-description`.
- Linear ticket in branch name enables automatic ticket detection in `/create-pr`.
- PR title format: `[TICKET-ID]: Description` (team PR conventions).

## Author setup (one-time per machine)

```bash
git config --global user.email "you@gloo.us"
# → branch prefix: you
```

## Usage

| User says | Action |
| --------- | ------ |
| `/create-pr-branch` | Ask for ticket ID, then run workflow |
| `/create-pr-branch FLUENT-123` | Fetch ticket, propose branch, create after confirm |

## Rules

- **Never** use `feature/` as the first path segment without an author prefix.
- **Never** use branch types outside `feature`, `fix`, `chore`.
- **Never** force-push or delete branches unless the user explicitly asks.
- **Always** show the final branch name before `git checkout -b`.
- Prefer Linear MCP for ticket title; do not guess the slug from memory if the ticket can be fetched.
