# Dependabot PR handling process

Repeatable process for safely managing Dependabot PRs in **Fluent Mobile**. Priority: keep the app stable on **Expo SDK 57 (RN 0.86) with Expo CNG**.

## One-at-a-time checklist

Use this for **every** Dependabot merge (copy into PR comment or issue when triaging):

- [ ] Author is `dependabot[bot]` / `app/dependabot`
- [ ] Required GitHub checks green: Lint & Format, Unit Tests, Quality Gates (TypeScript, expo-doctor, expo install --check)
- [ ] **Safe** (lockfile-only / non-native patch, or Actions SHA bump with Action pins green): CI-first is enough — local checkout optional
- [ ] **Risky** / native / Expo ecosystem: checkout → `npm ci` → **`npm run doctor`** → `format:check` → `lint` → `typecheck` → `npm test -- --ci` (+ Android smoke)
- [ ] If `--check` is red **with no package change on this PR**: wait for the Expo compatibility sync ([#422](https://github.com/eten-tech-foundation/fluent-mobile/issues/422)), rebase — do not `--fix` on an unrelated feature ticket. If this **is** a deps PR and drift is SDK 57 patch-only: `npx expo install --fix` on that branch
- [ ] Approve + **squash merge exactly one** lockfile PR (Actions PRs: merge when pins + required checks green — do **not** skip by default)
- [ ] Wait for **`main` CI green** before the next merge
- [ ] Comment **`@dependabot rebase`** on **all other open** Dependabot PRs (parallel prep)
- [ ] Re-triage next PR when its checks are green; repeat
- [ ] Batch notes in a PR/issue comment; land resolution-log catch-up via a **ticketed chore PR** (never commit on `main`)

Risky bumps (`react`, `react-native`, navigation, native modules): add Android smoke test before merge (see below).

## Core principles

1. **Stability first**: Never merge updates that break Expo SDK 57 / RN 0.86 compatibility or native module ABI.
2. **CI-first for safe PRs**: Required GitHub checks green is enough for lockfile-only / non-native patch bumps (and Actions SHA bumps with Action pins green). Local `npm ci` + doctor remains mandatory for risky / native / Expo ecosystem bumps.
3. **Verified authors**: Only process PRs from `app/dependabot` or `dependabot[bot]`.
4. **Targeted merges**: Prefer squash merges into `main` via **Dependabot PRs only** — agent-authored fixes and resolution-log catch-up use a separate ticketed PR ([delivery.mdc](../../.cursor/rules/delivery.mdc)). Never commit on `main`.
5. **Version lock-stepping**: `react`, `react-dom`, `react-test-renderer`, and `react-native` are pinned — `dependabot.yml` ignores all React updates; validate the **final merged state** on `main` after any related work.
6. **Runtime testing**: Static checks miss renderer mismatches — smoke test on Android for risky bumps.
7. **One lockfile merge at a time**: Merge **one** lockfile PR, let **`main` CI go green**, then **`@dependabot rebase` all other open bots in parallel** before the next merge.
8. **Expo health after rebases**: Every `@dependabot rebase` triggers Quality Gates (`npm run doctor` + `expo install --check`). `--check` can go red overnight when Expo publishes new SDK 57 patches ([two-clock model](../ci.md#two-clocks--pr-ci-vs-scheduled-expo-health)). Recover via the weekday sync PR ([#422](https://github.com/eten-tech-foundation/fluent-mobile/issues/422)), not a drive-by `--fix` on every open bot. Until #422 lands, `--fix` only on a dedicated deps ticket.
9. **Automate the queue**: Cursor agents should run the full safe queue without per-PR confirmation (see `.cursor/rules/dependabot-workflow.mdc` → Autonomous mode).
10. **Deferred upgrades**: When closing a bot as “needs dedicated ticket”, open/link that ticket **or** rely on ignore rules in `.github/dependabot.yml` — no orphan “needs ticket” comments.

## Expo + Dependabot (best practices)

Expo documents dependency hygiene in [resolving-dependency-issues](https://github.com/expo/fyi/blob/main/resolving-dependency-issues.md) and [troubleshooting-sdk-upgrades](https://github.com/expo/fyi/blob/main/troubleshooting-sdk-upgrades.md):

| Practice | Why |
|----------|-----|
| Run **`npm run doctor`** (lockfile `expo-doctor`, never `@latest` on feature PRs) | Catches SDK version drift, duplicate native modules, misaligned `react`/`react-native`. Latest doctor / RN Directory: scheduled job [#422](https://github.com/eten-tech-foundation/fluent-mobile/issues/422) |
| Use **`npx expo install --check`** / **`--fix`** instead of raw `npm update` for Expo ecosystem packages | Aligns versions to the installed SDK — Dependabot/npm alone can leave patch drift |
| Prefer **`npx expo install <pkg>`** when adding native modules | Version ranges are validated against the SDK matrix |
| Treat **expo / react / react-native / navigation / native modules** as **risky** | Dependabot groups help, but lockfile-only bumps can still break autolinking |
| **GitHub Actions** SHA bumps (`github_actions` label) | Grouped weekly PRs from Dependabot; pin comments stay on the SHA (`# v7.0.1`). App Expo alignment is still `npm run doctor` |

Renovate/Dependabot do not understand Expo’s SDK pin matrix — this repo uses Dependabot for breadth but **enforces Expo alignment via CI + doctor**, not blind semver.

**When doctor / `--check` fails on a Dependabot PR:**

1. `npx expo install --check` — list mismatches
2. If the failure is **only** Expo’s published matrix moving (no change in this bot’s packages): wait for [#422](https://github.com/eten-tech-foundation/fluent-mobile/issues/422) (or a dedicated `--fix` ticket until that job exists), rebase
3. If this bot caused SDK 57 patch drift: `npx expo install --fix` on the PR branch, push, re-run doctor
4. If duplicate native modules: `npm why <pkg>`, `npm dedupe`, or targeted `overrides` (see Expo FYI)
5. If the bump is incompatible with SDK 57: close the PR or defer to an SDK upgrade ticket

Dependabot still owns Expo/RN groups until [#424](https://github.com/eten-tech-foundation/fluent-mobile/issues/424).

## Categorization

| Category | Action | Example |
|----------|--------|---------|
| **RN line upgrade / ignored majors** | Close; open/link dedicated ticket **or** rely on `dependabot.yml` ignores | `react-native` `>=0.87`, React pin drift, Jest 30, Babel 8, ESLint 10, lucide v1 |
| **Safe updates** | CI-first merge when required checks green | Lockfile-only / non-native patch bumps; GitHub Actions SHA bumps (Action pins green) |
| **Risky updates** | Local doctor + full gate + Android smoke | `react`, navigation libs, `@op-engineering/op-sqlite`, Expo ecosystem, UI/native modules |

## Workflow

### 1. Triage

```bash
gh pr view <PR_NUMBER> --json author,title,body
```

- If author is NOT Dependabot → **stop**.
- If it is an RN line upgrade (`>=0.87`) or an ignored major/pin-drift bump → close with a comment; open/link a dedicated ticket **or** confirm the ignore rule will hold.

### 2. Validation (tiered)

**Safe (CI-first):** required checks green is enough — skip local checkout.

**Risky / native / Expo:** local checkout and install:

```bash
git fetch origin pull/<PR_NUMBER>/head:dependabot-pr-<PR_NUMBER>
git checkout dependabot-pr-<PR_NUMBER>
npm ci
```

Then the validation suite (CI order):

```bash
npm run doctor
npm run format:check
npm run lint
npm run typecheck
npm test -- --ci
```

**Quality Gates** on every PR: lockfile `npm run doctor` and required **`expo install --check`**. Local `npm run doctor` matches the CI CLI version. If `--check` is red with no code change, see [two clocks](../ci.md#two-clocks--pr-ci-vs-scheduled-expo-health).

If doctor fails, see [Expo + Dependabot (best practices)](#expo--dependabot-best-practices) above.

Optional local native build for risky PRs (CI no longer runs Gradle on every PR; use EAS preview for native validation):

```bash
npm run prebuild
cd android && ./gradlew assembleDebug --no-daemon && cd ..
```

### 3. Smoke test (runtime-affecting changes)

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

### 4. Merge (one at a time)

Branch protection requires approval first:

    gh pr review <PR_NUMBER> --approve --body "CI green. Safe bump per dependabot process."
    gh pr merge <PR_NUMBER> --squash --delete-branch

Wait for **Lint Check**, **Test Check**, and **Quality Gates** on `main`.

### 5. Parallel rebase prep (do not skip)

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

### Pinned versions (Expo SDK 57 / RN 0.86.3)

These are exact pins in `package.json` — Dependabot is configured to avoid most drift, but verify after any manual conflict resolution:

| Package | Pin |
|---------|-----|
| `react` | `19.2.3` |
| `react-native` | `0.86.3` |
| `react-test-renderer` | `19.2.3` |
| `@react-native/jest-preset` | `0.86.3` |
| `@react-native/typescript-config` | `0.86.3` |

`@react-native/jest-preset` and `@react-native/typescript-config` must move with `react-native` — RN peers the jest preset at the exact patch, so a lone `react-native` bump fails `npm install` with `ERESOLVE`.

Use the [RN upgrade helper](https://react-native-community.github.io/upgrade-helper/?from=0.86.3&to=0.86.3) when aligning versions during an RN upgrade ticket.

## Automating with Cursor

Ask: **"Handle dependabot PRs"** or **"Process the dependabot queue"**.

The agent runs in **autonomous mode** by default:

- Triages all open bots
- Rebases stale/conflicting PRs in parallel
- Merges safe PRs when GitHub CI is fully green (CI-first; no hand-holding per PR)
- Merges GitHub Actions SHA bumps when Action pins + required checks are green (do not skip by default)
- Skips risky/failed PRs and reports blockers; deferred closes need a ticket or an ignore rule
- Does not merge non-Dependabot workflow/config PRs unless explicitly requested

Rule: [`.cursor/rules/dependabot-workflow.mdc`](../../.cursor/rules/dependabot-workflow.mdc)

## SHA pinning for GitHub Actions

Workflow `uses:` refs are pinned to 40-character commit SHAs with a version comment (`# v7.0.1`). Dependabot's `github-actions` ecosystem is grouped (`patterns: ['*']` plus a matching security-updates group) with a 7-day cooldown so SHA bumps land in one PR labeled `github_actions`.

**Do not skip Actions PRs by default** when Action pins + required checks are green — merge them like other safe bots (historical practice for Actions SHA bumps).

Local check (must exit 0):

```bash
ruby .github/scripts/check-action-pins.rb
```

The CI job is `action-pins.yml` (`pull_request_target`). Do not switch it to `pull_request` — that would let a PR replace its own checker.

## Related

- Config: [`.github/dependabot.yml`](../../.github/dependabot.yml)
- Resolution log: [dependabot-resolution-log.md](./dependabot-resolution-log.md) — write batch notes in PR/issue comments first; land the markdown file via a ticketed chore PR (never commit on `main`)
- Agent commands: [`.cursor/rules/commands.mdc`](../../.cursor/rules/commands.mdc)
