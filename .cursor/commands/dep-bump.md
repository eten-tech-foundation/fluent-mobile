# /dep-bump — change a dependency the Expo way

You are adding, upgrading, aligning, or removing a dependency in **fluent-mobile**.
Naive `npm install <pkg>@latest` is often **wrong** here: this is an Expo SDK **56**
CNG app (Android-only, custom dev client — not Expo Go). Two health checks must stay
green after dependency work:

- `npx expo install --check` — Expo-managed packages at SDK-compatible versions
- `npm run doctor` (`expo-doctor`) — config / native compatibility

Proceed autonomously and report what you did; only stop at hard gates below.

`$ARGUMENTS` = package(s) to add/bump. If empty, **align + validate** the current tree.

## Critical facts

- **Use `npx expo install <pkg>`** for anything Expo knows about (resolves SDK 56–compatible versions). Use plain `npm install` only for pure-JS packages Expo has no opinion on — then still re-run the checks.
- **`npm run prebuild` is destructive** (`expo prebuild --clean --platform android`). Run it only when the change adds/removes a **native** module or config plugin. Pure-JS deps do not need it. **Never** pass `--platform ios` or omit the platform.
- Package manager is **npm** only (`package-lock.json`). Do not use yarn/pnpm.
- Agent-authored lockfile / doctor fixes still need a **ticketed PR** — never push to `main` ([delivery.mdc](../rules/delivery.mdc)).

## Flow

### 1. Inspect working tree

```bash
git status --porcelain
git branch --show-current
```

Warn if on `main` or if unrelated dirty files exist. Do not commit unless the user asks.

### 2. Apply the change

- **Add/bump Expo-aware package(s):** `npx expo install <pkg>…`
- **Align tree only:** `npx expo install --fix` when doctor / install-check reports drift
- **Pure-JS:** `npm install <pkg>` then re-check

### 3. Validate (blocking for this command)

```bash
npx expo install --check
npm run doctor
```

If doctor reports SDK patch drift, `npx expo install --fix` and re-run doctor.

### 4. Native regen (only if needed)

If a native module or `app.config.ts` / plugin changed:

```bash
npm run prebuild
```

Do not commit generated `android/`.

### 5. App gates

```bash
npm run format:check
npm run lint
npm run typecheck
npm test -- --ci
```

Report pass/fail. If gates fail, fix or surface clearly — do not claim success.

### 6. Report

Summarize: packages touched, whether prebuild ran, doctor/install-check outcome, what to re-test on Android (especially if native).

## Related

- [docs/ci.md](../../docs/ci.md)
- [docs/guides/dependabot-process.md](../../docs/guides/dependabot-process.md)
- [`.cursor/rules/dependabot-workflow.mdc`](../rules/dependabot-workflow.mdc)
- `/handle-dependabot` for Dependabot PR processing
