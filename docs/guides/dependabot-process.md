# Dependabot PR handling process

Repeatable process for safely managing Dependabot PRs in **Fluent Mobile**. Priority: keep the app stable on **Expo SDK 56 (RN 0.85) with Expo CNG**.

## Core principles

1. **Stability first**: Never merge updates that break Expo SDK 56 / RN 0.85 compatibility or native module ABI.
2. **Automated validation**: Always run the CI gate locally before merge (see [`.cursor/rules/commands.mdc`](../../.cursor/rules/commands.mdc)).
3. **Verified authors**: Only process PRs from `app/dependabot` or `dependabot[bot]`.
4. **Targeted merges**: Prefer squash merges into `main` via **Dependabot PRs only** — agent-authored fixes use a separate ticketed PR ([delivery.mdc](../../.cursor/rules/delivery.mdc)).
5. **Version lock-stepping**: `react`, `react-test-renderer`, and `react-native` are pinned — validate the **final merged state** on `main`.
6. **Runtime testing**: Static checks miss renderer mismatches — smoke test on Android for risky bumps.
7. **One lockfile merge at a time**: Merge **one** lockfile PR, let **`main` CI go green**, then **`@dependabot rebase` all other open bots in parallel** before the next merge.
8. **Expo Doctor after rebases**: Every `@dependabot rebase` triggers fresh CI — **Test Check** runs `npm run doctor` (`expo-doctor`). Do not merge if it fails; fix with `npx expo install --fix` when appropriate.
9. **Automate the queue**: Cursor agents should run the full safe queue without per-PR confirmation (see `.cursor/rules/dependabot-workflow.mdc` → Autonomous mode).

## Expo + Dependabot (best practices)

Expo documents dependency hygiene in [resolving-dependency-issues](https://github.com/expo/fyi/blob/main/resolving-dependency-issues.md) and [troubleshooting-sdk-upgrades](https://github.com/expo/fyi/blob/main/troubleshooting-sdk-upgrades.md):

| Practice | Why |
|----------|-----|
| Run **`npx expo-doctor@latest`** after any dependency change | Catches SDK version drift, duplicate native modules (SDK 54+), misaligned `react`/`react-native` |
| Use **`npx expo install --check`** / **`--fix`** instead of raw `npm update` for Expo ecosystem packages | Aligns versions to the installed SDK — Dependabot/npm alone can leave patch drift |
| Prefer **`npx expo install <pkg>`** when adding native modules | Version ranges are validated against the SDK matrix |
| Treat **expo / react / react-native / navigation / native modules** as **risky** | Dependabot groups help, but lockfile-only bumps can still break autolinking |
| **GitHub Actions** `expo/expo-github-action` bumps are separate from app deps | Validate workflows; app Expo alignment is still `npm run doctor` |

Renovate/Dependabot do not understand Expo’s SDK pin matrix — this repo uses Dependabot for breadth but **enforces Expo alignment via CI + doctor**, not blind semver.

**When doctor fails on a Dependabot PR:**

1. `npx expo install --check` — list mismatches
2. If SDK patch drift only: `npx expo install --fix` on the PR branch, push, re-run doctor
3. If duplicate native modules: `npm why <pkg>`, `npm dedupe`, or targeted `overrides` (see Expo FYI)
4. If the bump is incompatible with SDK 56: close the PR or defer to an SDK upgrade ticket

## Categorization

| Category | Action | Example |
|----------|--------|---------|
| **RN line upgrade** | Close and plan separately | `react-native` `>=0.85`, coordinated `@react-native/*` |
| **Safe updates** | Validate and merge | Patch/minor dev tools, ESLint, Prettier, Jest plugins |
| **Risky updates** | Full validation + Android smoke test | `react`, navigation libs, `@op-engineering/op-sqlite`, UI/native modules |

## Workflow

### 1. Triage

```bash
gh pr view <PR_NUMBER> --json author,title,body
```

- If author is NOT Dependabot → **stop**.
- If it is an RN line upgrade (`>=0.85`) → close with a comment; track in a dedicated ticket.

### 2. Local checkout and install

```bash
git fetch origin pull/<PR_NUMBER>/head:dependabot-pr-<PR_NUMBER>
git checkout dependabot-pr-<PR_NUMBER>
npm ci
```

### 3. Validation suite (CI order)

```bash
npm run doctor
npm run format:check
npm run lint
npm run typecheck
npm test -- --ci
```

**Expo Doctor** runs in GitHub **Test Check** on every PR push (including post-rebase). Local `npm run doctor` mirrors CI — run it after `npm ci` when triaging locally.

If doctor fails, see [Expo + Dependabot (best practices)](#expo--dependabot-best-practices) above.

Android build (mirrors `.github/workflows/build.yml`):

```bash
cd android && ./gradlew assembleDebug --no-daemon && cd ..
```

### 4. Smoke test (runtime-affecting changes)

Mandatory for `react`, `react-native`, `@react-native/*`, `@react-navigation/*`, and native modules.

```bash
npm start          # terminal 1
npm run android    # terminal 2
```

Verify:

- App launches
- Projects → Chapters → Verse detail navigation
- Sync runs without crash
- No "Incompatible React versions" in Metro/logcat

### 5. Merge (one at a time)

Branch protection requires approval first:

    gh pr review <PR_NUMBER> --approve --body "CI green. Safe bump per dependabot process."
    gh pr merge <PR_NUMBER> --squash --delete-branch

Wait for **Lint Check**, **Test Check**, and **Build Check** on `main`.

### 6. Parallel rebase prep (do not skip)

Immediately after each merge, rebase **all** remaining open Dependabot PRs — not just the next merge candidate:

    gh pr comment <PR_NUMBER> --body "@dependabot rebase"

Skip PRs that already have fresh `IN_PROGRESS` CI from Dependabot (auto-refreshed after `main` changed). This runs CI in parallel while you wait for `main`, saving time on the next merge.

Re-triage the next PR when its checks are all green.

## Final validation on main

After merging multiple PRs:

```bash
git checkout main
git pull origin main
npm ci
npm run doctor
npm run format:check
npm run lint
npm run typecheck
npm test -- --ci
cd android && ./gradlew assembleDebug --no-daemon && cd ..
```

Add `npm run android` smoke test after any risky merge batch.

## Troubleshooting

### Conflicts

Prefer `@dependabot rebase`:

```bash
gh pr comment <PR_NUMBER> --body "@dependabot rebase"
```

Manual resolution:

1. Do not blindly take "newer" for pinned React/RN packages
2. Run full validation + Android smoke test
3. Extra scrutiny before merge

### Broken `package-lock.json`

If CI fails on `npm ci` with lockfile errors after several Dependabot merges:

1. Branch from `main`
2. Run `npm install` to regenerate `package-lock.json`
3. Open a small fix PR; merge after CI passes
4. Enforce **one merge + rebase** going forward

### Pinned versions (Expo SDK 56 / RN 0.85.3)

These are exact pins in `package.json` — Dependabot is configured to avoid most drift, but verify after any manual conflict resolution:

| Package | Pin |
|---------|-----|
| `react` | `19.2.3` |
| `react-native` | `0.85.3` |
| `react-test-renderer` | `19.2.3` |
| `@react-native/jest-preset` | `^0.85.3` |
| `@react-native/typescript-config` | `0.85.3` |

Use the [RN upgrade helper](https://react-native-community.github.io/upgrade-helper/?from=0.85.3&to=0.85.3) when aligning versions during an RN upgrade ticket.

## Automating with Cursor

Ask: **"Handle dependabot PRs"** or **"Process the dependabot queue"**.

The agent runs in **autonomous mode** by default:

- Triages all open bots
- Rebases stale/conflicting PRs in parallel
- Merges safe PRs when GitHub CI is fully green (no hand-holding per PR)
- Skips risky/failed PRs and reports blockers
- Does not merge workflow/config PRs unless explicitly requested

Rule: [`.cursor/rules/dependabot-workflow.mdc`](../../.cursor/rules/dependabot-workflow.mdc)

## Related

- Config: [`.github/dependabot.yml`](../../.github/dependabot.yml)
- Resolution log: [dependabot-resolution-log.md](./dependabot-resolution-log.md)
- Agent commands: [`.cursor/rules/commands.mdc`](../../.cursor/rules/commands.mdc)
