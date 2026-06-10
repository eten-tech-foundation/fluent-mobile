# Dependabot PR handling process

Repeatable process for safely managing Dependabot PRs in **Fluent Mobile**. Priority: keep the app stable on **React Native 0.84.1** (bare RN, Android-only today).

## Core principles

1. **Stability first**: Never merge updates that break RN 0.84 compatibility or native module ABI.
2. **Automated validation**: Always run the CI gate locally before merge (see [`.cursor/rules/commands.mdc`](../../.cursor/rules/commands.mdc)).
3. **Verified authors**: Only process PRs from `app/dependabot` or `dependabot[bot]`.
4. **Targeted merges**: Prefer squash merges into `main`.
5. **Version lock-stepping**: `react`, `react-test-renderer`, and `react-native` are pinned — validate the **final merged state** on `main`.
6. **Runtime testing**: Static checks miss renderer mismatches — smoke test on Android for risky bumps.
7. **One lockfile merge at a time**: Merge **one** Dependabot PR that changes `package-lock.json`, let **`main` CI go green**, then **`@dependabot rebase`** other open Dependabot PRs before the next merge. Stacked squash merges can leave **`package-lock.json` invalid** and break `npm ci`.

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
npm run format:check
npm run lint
npx tsc --noEmit
FLUENT_USER_EMAIL=test@example.com npm test -- --ci
```

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

```bash
gh pr merge <PR_NUMBER> --squash
```

Wait for **Lint Check**, **Test Check**, and **Build Check** on `main`. Then:

```bash
gh pr comment <NEXT_PR_NUMBER> --body "@dependabot rebase"
```

Re-triage and re-validate the next PR after Dependabot pushes.

## Final validation on main

After merging multiple PRs:

```bash
git checkout main
git pull origin main
npm ci
npm run format:check
npm run lint
npx tsc --noEmit
FLUENT_USER_EMAIL=test@example.com npm test -- --ci
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

### Pinned versions (RN 0.84.1)

These are exact pins in `package.json` — Dependabot is configured to avoid most drift, but verify after any manual conflict resolution:

| Package | Pin |
|---------|-----|
| `react` | `19.2.3` |
| `react-native` | `0.84.1` |
| `react-test-renderer` | `19.2.3` |
| `@react-native/babel-preset` | `0.84.1` |
| `@react-native/metro-config` | `0.84.1` |
| `@react-native/typescript-config` | `0.84.1` |

Use the [RN upgrade helper](https://react-native-community.github.io/upgrade-helper/?from=0.84.1&to=0.84.1) when aligning versions during an RN upgrade ticket.

## Automating with Cursor

Load `.cursor/rules/dependabot-workflow.mdc` — ask: "Help me handle dependabot PRs".

## Related

- Config: [`.github/dependabot.yml`](../../.github/dependabot.yml)
- Resolution log: [dependabot-resolution-log.md](./dependabot-resolution-log.md)
- Agent commands: [`.cursor/rules/commands.mdc`](../../.cursor/rules/commands.mdc)
