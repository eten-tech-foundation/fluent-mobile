# Fluent Mobile — agent instructions

Offline-first **React Native 0.84** Android companion for Bible translation recording. On launch: initialize SQLite → sync Fluent API → browse **projects → chapters → verses**. Human setup: [README.md](README.md). Deeper map: [docs/AGENT_ONBOARDING.md](docs/AGENT_ONBOARDING.md).

## Dev environment

- **Node** `>= 24.14.0` (use `nvm use` with `.nvmrc` if present).
- **Package manager:** npm only (`package-lock.json`) — not yarn or pnpm.
- **Platform:** Android-only for now. Emulator API host: `10.0.2.2` maps to host `localhost`.
- Copy env before running: `cp .env.example .env` — set `API_BASE_URL`, `FLUENT_USER_EMAIL`. Never commit `.env`.
- Install: `npm install`
- Run (two terminals from repo root):
  - `npm start` — Metro bundler
  - `npm run android` — install and launch on emulator/device

## Verification (run before claiming done)

Run from repo root in this order (matches CI):

1. `npm run format:check` — or `npm run format` then re-check
2. `npm run lint`
3. `npm run typecheck`
4. `FLUENT_USER_EMAIL=test@example.com npm test -- --ci`

Report what ran and the outcome. If a step was skipped, say why.

CI workflows: `.github/workflows/lint.yml`, `test.yml`, `build.yml`.

## Architecture

**Data flow:** `App.tsx` → `initializeDatabase()` → `syncAllData(email)` → UI reads SQLite.

| Layer | Path | Responsibility |
|-------|------|----------------|
| HTTP | `src/services/api.ts` | `FluentAPI`, `fetch`, `x-user-email` header |
| Sync | `src/services/sync.ts` | Orchestration, retries, sync steps |
| KV | `src/services/storage.ts` | Sync timestamps, counts, errors |
| Schema | `src/db/schema.ts` | `CREATE TABLE` statements |
| Writes | `src/db/repository.ts` | Inserts/upserts in transactions |
| Reads | `src/db/queries.ts` | SELECTs for UI |
| UI | `src/app/tabs/`, `src/components/` | Screens and shared components |

**Do not bypass layers:**

- No `fetch` from screens — use `FluentAPI` + sync or new service methods
- No SQL in screens — use `repository.ts` / `queries.ts`
- No direct API reads in UI — read SQLite after sync

**Adding a synced entity:** table in `schema.ts` → types in `src/types/db/` → API in `api.ts` → insert in `repository.ts` → sync step in `sync.ts` → query in `queries.ts` if UI needs it.

**Adding a screen:** component in `src/app/tabs/` → route in `AppNavigator.tsx` → params in `src/types/navigation/types.ts`.

**Database cautions:** `getDatabase()` throws before `initializeDatabase()`. No migration framework yet — schema changes affect existing installs. Use transactions in repository.

## Code style

- **Logging:** `const log = logger.create('ComponentName')` — no raw `console` (exception: `src/utils/logger.ts`, tests).
- **Env:** `import { API_BASE_URL, FLUENT_USER_EMAIL } from '@env'`.
- **Types:** API in `src/types/api/`, DB in `src/types/db/`, navigation in `src/types/navigation/`.
- **Prettier:** single quotes, trailing commas, `arrowParens: 'avoid'`.
- **Scope:** small, focused diffs — no drive-by refactors. Do not edit `android/` or lockfiles unless the task requires it.

Cursor-specific rules live in `.cursor/rules/` (architecture, commands, code-style, testing).

## Testing

- Jest 29 + `@testing-library/react-native`.
- Colocated tests: `src/utils/logger.test.ts`, `src/services/fluent-api.test.ts`.
- App smoke test: `__tests__/App.test.tsx` (mocks native modules).
- `fluent-api.test.ts` hits `https://dev.api.fluent.bible` — can fail offline.
- When adding features: mock `op-sqlite`, navigation, and sync following existing patterns.

## PR instructions

- **Branch:** `[TICKET-ID]-[slug]` (Linear “Copy git branch name”).
- **Title:** `[TICKET-ID]: Description`
- **Body:** include `Refs [TICKET-ID]` on its own line under Details (see `.cursor/templates/pr-template.md`).
- Open PRs and push; do not merge on GitHub.
- Do not force push, hard reset, commit, or push unless explicitly asked.
- Do not modify `.env` or secrets.

## Security

- Auth today: `x-user-email` header from `FLUENT_USER_EMAIL` / stored KV email — no OAuth in app yet.
- Never log secrets or commit `.env`.

## Risk areas

| Area | Note |
|------|------|
| `src/db/schema.ts` | Schema changes affect existing device DBs |
| `sync.ts` | Avoid calling `getDatabase()` before init |
| `format` vs `format:check` | Different glob scopes — CI checks `src/**/*.{ts,tsx}` only |
| `recordings` table | Exists in schema; audio capture/upload not wired yet |
