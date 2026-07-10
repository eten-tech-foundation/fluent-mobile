# Create Pull Request

## Overview

Automated PR creation for **fluent-mobile** when you run `/create-pr`. Creates a GitHub PR with title, description from the repo template, and draft settings. Integrates **GitHub Issues** and branch analysis.

Complements team PR conventions (title `[#NNN]: Description`, verification gates). Does not merge PRs.

**Tracker:** GitHub Issues — [docs/issue-tracking.md](../../docs/issue-tracking.md).

## What happens

1. **Validate prerequisites** — branch pushed (or push with user approval), quality gates, clean intent for draft PR
2. **Fetch GitHub issue** — from branch name via `gh issue view` when possible
3. **Analyze branch** — commits, files changed, change type
4. **Generate title** — `[#NNN]: Title` from issue + branch
5. **Fill template** — [`.cursor/templates/pr-template.md`](../templates/pr-template.md)
6. **Reviewers / labels** — use team defaults if configured below; otherwise omit or ask user
7. **Create draft PR** — via `gh pr create`

## Pre-flight (fluent-mobile)

Run and report results:

```bash
npm run format:check
npm run lint
npx tsc --noEmit
npm test -- --ci
```

Also check:

```bash
git status --porcelain
git branch --show-current
git log origin/main..HEAD --oneline
```

- Warn on uncommitted changes unless user wants them included
- Ensure branch is pushed: `git push -u origin HEAD` (feature branch only — **never** `git push origin main`; see [delivery.mdc](../rules/delivery.mdc))

See [docs/AGENT_ONBOARDING.md](../../docs/AGENT_ONBOARDING.md) for full command reference.

## Title format

**Always:** `[#NNN]: Title text` (or `#NNN: Title text`)

**With GitHub issue:**

- Branch `mrace/chore/173-phase1-agent-process-docs` + issue → `[#173]: Adopt Phase 1 agent/process docs`

**Without issue (fallback):**

- `fix/sync-retry-logic` → `Fix: Sync retry logic`
- Strip `[Mobile App]` or similar prefixes from issue titles

## Template

Load [`.cursor/templates/pr-template.md`](../templates/pr-template.md) and pre-fill:

**From GitHub issue:**

- TLDR, Details, `Closes #NNN` when the PR completes the issue

**From branch analysis:**

- Technical changes (files, line counts)
- Type of change checkboxes
- How to verify (npm setup, Metro + `npm run android` when relevant)

**Delivery guardrails** (root [`AGENTS.md`](../../AGENTS.md)):

- Leave **Acceptance criteria**, **Scope**, and **Android device tested** checkboxes **unchecked** unless verified.
- Do **not** auto-check device QA for native / mic / camera / filesystem / permissions changes.
- Do **not** mark such PRs ready for review until a human records device results.
- Deferred AC requires an issue-level waiver and linked follow-up issues — not only a PR “known limitations” note.

Keep output under ~400 lines; no nested fenced code blocks inside the PR body.

## GitHub issue integration

- Detect issue number from branch: `…/173-…` or leading `173-…`
- Fetch with `gh issue view NNN --repo eten-tech-foundation/fluent-mobile`
- Body must include `Closes #NNN` on its own line under Details when the PR completes the issue

## GitHub (`gh`)

```bash
gh pr create --draft --title "[#NNN]: Title" --body-file /tmp/pr-body.md
```

**Reviewers / labels:** omit if unknown; tell the user to add them in GitHub.

## Package manager

Use **npm** only in PR text and test steps. Do not reference pnpm or yarn.

## Framework notes

- **Expo SDK 56** + **CNG** (RN **0.85**, React **19.2.3**), **Android-only**
- PR CI: lint, test, typecheck, `expo-doctor`, `expo install --check` (see [docs/ci.md](../../docs/ci.md)); native compile via EAS preview label
- EAS project ID: `b0919574-f268-4768-b3bd-7cfa5172bbab`

## Branch analysis

- Count files/lines; classify feature / fix / chore / docs
- Flag `package.json`, `package-lock.json`, `app.config.ts`, `plugins/`, `eas.json`, `src/db/schema.ts` as high-impact (`android/` is gitignored CNG output)
- Flag new env vars needing `.env.example` update

## Usage

Type `/create-pr` in Cursor chat.

**After creation:**

1. Review auto-filled body (confirm AC / Scope / device-QA checkboxes match reality per [`AGENTS.md`](../../AGENTS.md))
2. Add screenshots if UI changed
3. Confirm reviewers/labels
4. Mark ready for review only when CI gates **and** delivery guardrails pass. Do not merge unless user explicitly asks.

## Related commands

- `/create-pr-branch` — create branch before work
- `/generate-pr-description` — body only, manual GitHub PR creation
- `/onboard`, `/dep-bump` — setup and dependency changes
