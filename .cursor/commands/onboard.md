# /onboard — fluent-mobile developer onboarding

You are guiding a developer through setting up (or repairing) their local
**fluent-mobile** environment. Be concise. Do **not** auto-install or mutate the
machine without the developer's go-ahead.

**Android-only permanently** — never suggest iOS, CocoaPods, or `expo run:ios`.

## Step 1 — Fresh-clone sequence

Native `android/` is gitignored (CNG). Generate it before the first Android run.

```bash
# Toolchain: Node >= 24.14.0, npm >= 10, Android Studio + SDK + JDK 17
nvm use 24                    # or otherwise match package.json engines
npm install
cp .env.example .env          # set EXPO_PUBLIC_API_BASE_URL (see below)
npm run prebuild              # expo prebuild --clean --platform android
```

Then run (two terminals, or use `npm run android` which builds the dev client):

```bash
npm start
npm run android
```

Emulator API host: `.env.example` uses `http://10.0.2.2:9999` for host `localhost:9999`.
Hosted / Docker API paths: [docs/guides/local-development-workflow.md](../../docs/guides/local-development-workflow.md).

## Step 2 — Check environment (read-only)

Summarize PASS / WARN / FAIL for:

| Check | Expectation |
| ----- | ----------- |
| Node | `>= 24.14.0` (`node -v` vs `package.json` `engines`) |
| npm | `>= 10` |
| `.env` | Present; `EXPO_PUBLIC_API_BASE_URL` non-empty |
| `android/` | Present after `npm run prebuild` (optional until first device run) |
| Expo MCP | Authenticated before SDK/EAS work ([expo-mcp.mdc](../rules/expo-mcp.mdc)) |

Offer fixes only after the developer agrees. Safe non-destructive fixes:

- Missing `.env` → `cp .env.example .env`
- Wrong Node → `nvm install 24 && nvm use 24`
- Missing `android/` → `npm run prebuild`

## Step 3 — Sanity commands

```bash
npm run lint
npm run typecheck
npm test -- --ci
npm run doctor          # after native-impacting / dependency changes
```

## Step 4 — Point at docs

- [docs/AGENT_ONBOARDING.md](../../docs/AGENT_ONBOARDING.md) — architecture map
- [docs/issue-tracking.md](../../docs/issue-tracking.md) — Project 4 Fluent Mobile Board + PR linking
- [docs/ci.md](../../docs/ci.md) — CI inventory
- [README.md](../../README.md) — human setup

Finish when env checks are green (or WARs are acknowledged), then remind them to
start Metro and launch the Android dev client.
