# Handle Dependabot PRs

## Overview

Process the open Dependabot queue for **fluent-mobile** end-to-end: triage, rebase, validate (including **Expo Doctor**), merge safe PRs one at a time, rebase the rest.

Rule: [`.cursor/rules/dependabot-workflow.mdc`](../../.cursor/rules/dependabot-workflow.mdc)
Guide: [`docs/guides/dependabot-process.md`](../../docs/guides/dependabot-process.md)

## Autonomous mode (default)

Run the full queue without per-PR confirmation. Stop only on blockers (failed CI, conflicts after rebase, risky RN/react/navigation/native bumps).

**Do not merge** GitHub Actions / workflow-only PRs unless the user explicitly includes them.

**Never push agent work to `main`** — infra fixes (expo doctor CI, etc.) need a ticketed feature branch + PR ([delivery.mdc](../../.cursor/rules/delivery.mdc)). This command only squash-merges **existing Dependabot PRs**.

## Queue loop

Approved Dependabot authors only: `app/dependabot` and `dependabot[bot]`. Target
branch must be `main` (`baseRefName` == `"main"`). Drop any other author or base.

1. List open bots targeting `main`: `gh pr list --search "author:app/dependabot state:open base:main" --json number,title,author,baseRefName,mergeable,mergeStateStatus,statusCheckRollup,files`
   Then keep only PRs whose author is `app/dependabot` or `dependabot[bot]` **and**
   whose `baseRefName` is `main`.
2. Triage: safe / risky / skip / RN upgrade / workflow-only
3. `@dependabot rebase` on conflicting, stale, or post-merge bots (skip bots with fresh `IN_PROGRESS` CI)
4. Pick **oldest safe PR** only when **Lint & Format**, **Unit Tests**, and
   **Quality Gates** (TypeScript, lockfile Expo Doctor, `expo install --check`) are all
   `SUCCESS`.
5. Before approve: `format:check`, `lint`, `typecheck`, `npm test -- --ci`, Expo
   Doctor when applicable, and those required build checks must be green. Then
   squash-merge **one** PR.
6. Wait for `main` CI green; rebase all remaining bots in parallel
7. Log batch in `docs/guides/dependabot-resolution-log.md`

## Validation (after each rebase / before merge)

```bash
npm ci
npm run doctor          # lockfile expo-doctor — Quality Gates, never @latest
npm run format:check
npm run lint
npm run typecheck
npm test -- --ci
```

If `npm run doctor` fails: `npx expo install --check`. If red overnight with no change on this bot, wait for #422 then rebase. SDK 57 patch drift caused by this PR: `npx expo install --fix` on the PR branch; do not merge until clean.

Risky PRs (`react`, `react-native`, `@react-navigation/*`, native modules): add Android smoke test (`npm run android`).

## Skip without merge

- Expo Doctor / any required check failed
- `react` / `react-native` / navigation / `@op-engineering/op-sqlite` major groups (unless user approves)
- Workflow-only PRs (unless user includes them)
- `mergeable: CONFLICTING` after one rebase retry

## Useful commands

```bash
gh pr comment <N> --body "@dependabot rebase"
gh pr review <N> --approve --body "CI green. Safe bump per dependabot process."
gh pr merge <N> --squash --delete-branch
gh run list --branch main --limit 3 --json workflowName,conclusion,status
```
