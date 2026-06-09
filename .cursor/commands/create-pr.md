# Create Pull Request

## Overview

Automated PR creation for **fluent-mobile** when you run `/create-pr`. Creates a GitHub PR with title, description from the repo template, and draft settings. Integrates Linear tickets and branch analysis when available.

Complements team PR conventions (title `[TICKET-ID]: Description`, verification gates). Does not merge PRs.

## What happens

1. **Validate prerequisites** — branch pushed (or push with user approval), quality gates, clean intent for draft PR
2. **Fetch Linear ticket** — from branch name via Linear MCP when possible
3. **Analyze branch** — commits, files changed, change type
4. **Generate title** — `[TICKET-ID]: Title` from Linear + branch
5. **Fill template** — [`.cursor/templates/pr-template.md`](../templates/pr-template.md)
6. **Reviewers / labels** — use team defaults if configured below; otherwise omit or ask user
7. **Create draft PR** — via `gh pr create`

## Pre-flight (fluent-mobile)

Run and report results:

```bash
npm run format:check
npm run lint
npx tsc --noEmit
FLUENT_USER_EMAIL=test@example.com npm test -- --ci
```

Also check:

```bash
git status --porcelain
git branch --show-current
git log origin/main..HEAD --oneline
```

- Warn on uncommitted changes unless user wants them included
- Ensure branch is pushed: `git push -u origin HEAD` (only with user approval per session rules)

See [docs/AGENT_ONBOARDING.md](../../docs/AGENT_ONBOARDING.md) for full command reference.

## Title format

**Always:** `TICKET-ID: Title text`

**With Linear:**

- Branch `mrace/chore/fluent-123-add-cursor-rules` + Linear → `FLUENT-123: Add Cursor AI rules`

**Without Linear (fallback):**

- `fix/sync-retry-logic` → `Fix: Sync retry logic`
- Strip `[Mobile App]` or similar prefixes from Linear titles

## Template

Load [`.cursor/templates/pr-template.md`](../templates/pr-template.md) and pre-fill:

**From Linear:**

- TLDR, Summary (issue / root cause / solution), Related Issue URL, business impact when present

**From branch analysis:**

- Technical Changes (files, line counts, key diffs)
- Type of Change checkboxes
- How to Test (npm setup, Metro + `npm run android`)

**Manual (reviewer adds):**

- Screenshots for UI changes
- Why This Solution (technical reasoning)

Keep output under ~400 lines; no nested fenced code blocks inside the PR body code block when pasting via `/generate-pr-description` rules.

## Linear integration

- Detect ticket patterns from branch: `TEAM-123`, lowercase in branch segment `team-123`
- Use Linear MCP `get_issue`; graceful fallback to git-only context
- Link PR to Linear in **Related Issue**

## GitHub (`gh`)

```bash
gh pr create --draft --title "TICKET-ID: Title" --body-file /tmp/pr-body.md
```

**Reviewers / labels (confirm for this repo):**

- Reviewers: `<!-- e.g. @org/team-name -->` — replace with fluent-mobile defaults when known
- Labels: `<!-- e.g. mobile, react-native -->` — replace when known

If unknown, create PR without reviewers/labels and tell the user to add them in GitHub.

## Package manager

Use **npm** only in PR text and test steps (`npm install`, `npm run lint`, etc.). Do not reference pnpm or yarn.

## Framework notes

- Bare **React Native 0.84** (not Expo), **Android-only** for now
- Android CI: `assembleDebug` in `.github/workflows/build.yml`

## Branch analysis

- Count files/lines; classify feature / fix / chore / docs
- Flag `package.json`, `package-lock.json`, `android/`, `src/db/schema.ts` as high-impact
- Flag new env vars needing `.env.example` update

## Usage

Type `/create-pr` in Cursor chat.

**Good for:**

- Branches with Linear ticket IDs in the name
- Branches without tickets (git-only analysis)
- Doc-only changes (chore/docs type)

**After creation:**

1. Review auto-filled body
2. Add screenshots if UI changed
3. Confirm reviewers/labels
4. Mark ready for review when gates pass (do not merge unless user explicitly asks)

## Related commands

- `/create-pr-branch` — create branch before work
- `/generate-pr-description` — body only, manual GitHub PR creation
