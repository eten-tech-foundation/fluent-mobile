# Create PR Branch

## Overview

Creates a new git branch using the team naming convention:

```text
{author}/{type}/{issue-number}-{slug-from-title}
```

**Example:** `mrace/chore/173-phase1-agent-process-docs`

Run with `/create-pr-branch` in Cursor chat.

**Tracker:** GitHub Issues for this repo right now — see [docs/issue-tracking.md](../../docs/issue-tracking.md).

## Branch name format

| Segment | Source | Example |
| ------- | ------ | ------- |
| `author` | Local part of `git config user.email` | `mrace` |
| `type` | `feature`, `fix`, or `chore` only | `chore` |
| `issue-number` | GitHub issue number | `173` |
| `slug` | Meaningful words from issue title | `phase1-agent-process-docs` |

**Full pattern:** `{author}/{type}/{issue-number}-{slug}`

## When you run this command

Execute these steps in order. Do not skip validation or user confirmation before creating the branch.

### 1. Resolve issue number

- If the user message or recent conversation already includes a GitHub issue (e.g. `#173` or `173`), use it.
- Otherwise, **ask once**: "What's the GitHub issue number? (e.g. 173)"
- Normalize to digits only for the branch segment.

### 2. Fetch GitHub issue

```bash
gh issue view NNN --repo eten-tech-foundation/fluent-mobile --json number,title,labels,body
```

If the issue is not found, report the error and stop.

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

**Infer from the GitHub issue (in order):**

| Signal | Type |
| ------ | ---- |
| Labels contain `bug`, `bugfix`, `hotfix`, `defect` | `fix` |
| Labels contain `chore`, `maintenance`, `tech-debt`, `dependencies`, `documentation` | `chore` |
| Labels contain `feature`, `story`, `enhancement` | `feature` |
| Title starts with or contains strong fix signals: `fix`, `fixes`, `fixed`, `bug`, `hotfix`, `resolve` | `fix` |
| Title signals: `add`, `implement`, `introduce`, `support`, `enable` | `feature` |
| Title signals: `replace`, `migrate`, `upgrade`, `bump`, `refactor`, `remove`, `cleanup`, `chore`, `update`, `adopt`, `docs` (non-user-facing) | `chore` |

If still ambiguous, use **AskQuestion** with: feature / fix / chore (default from best guess).

### 5. Build title slug

From the GitHub issue **title** (not description):

1. Remove prefixes like `[Mobile App]`, `(Mobile)`, etc.
2. Lowercase the title.
3. Split into words (alphanumeric tokens); split camelCase into words when obvious.
4. **Drop filler words:** `a`, `an`, `the`, `and`, `or`, `but`, `for`, `with`, `from`, `into`, `to`, `of`, `in`, `on`, `at`, `by`, `as`, `is`, `are`, `was`, `were`, `be`, `been`, `being`, `this`, `that`, `these`, `those`, `it`, `its`, `via`, `using`, `use`, `please`
5. Keep **3–6 meaningful words**; cap slug length (~45 chars after issue number).
6. Join with single hyphens; lowercase `a-z0-9-` only.

**Final branch name:**

```text
{author}/{type}/{issue-number}-{slug}
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
Branch: mrace/chore/173-phase1-agent-process-docs
Issue:  #173 — Adopt Phase 1 agent/process docs
Base:   main @ abc1234
```

Ask: **"Create this branch?"** (or create immediately if the user was explicit).

### 8. Create branch

```bash
git checkout -b "{author}/{type}/{issue-number}-{slug}"
```

If branching from `main` explicitly and behind:

```bash
git fetch origin main && git checkout main && git pull --ff-only origin main
git checkout -b "..."
```

Report success and remind them to use `/create-pr` when ready.

## Integration

- Pairs with `/create-pr` and `/generate-pr-description`.
- Issue number in the branch name enables automatic detection in `/create-pr`.
- PR title format: `[#NNN]: Description` (see [docs/issue-tracking.md](../../docs/issue-tracking.md)).

## Author setup (one-time per machine)

```bash
git config --global user.email "you@gloo.us"
# → branch prefix: you
```

## Usage

| User says | Action |
| --------- | ------ |
| `/create-pr-branch` | Ask for issue number, then run workflow |
| `/create-pr-branch 173` | Fetch issue, propose branch, create after confirm |

## Rules

- **Never** use `feature/` as the first path segment without an author prefix.
- **Never** use branch types outside `feature`, `fix`, `chore`.
- **Never** force-push or delete branches unless the user explicitly asks.
- **Always** show the final branch name before `git checkout -b`.
- Prefer `gh issue view` for the title; do not guess the slug from memory if the issue can be fetched.
