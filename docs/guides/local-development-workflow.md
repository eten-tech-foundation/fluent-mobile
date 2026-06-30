# Local development workflow

How to run **fluent-mobile** against a real Fluent API. The app syncs server data into on-device SQLite via `syncAllData()` — there is no mobile mock seed.

Pick **one** API path by setting `EXPO_PUBLIC_API_BASE_URL` in `.env`. No code changes required to switch.

| Path | When to use |
|------|-------------|
| **Hosted dev** | See shared remote data; no Docker |
| **Local Docker** | Seed your own Postgres; iterate on API locally; work offline from the API |

Web app (login / project UI in browser): https://dev.app.fluent.bible

---

## Prerequisites

- Node **≥ 24.14.0**, **npm**
- Android Studio + emulator (API 33+), or a physical Android device with USB debugging
- **Custom dev client** — this app does not run in Expo Go (see [README](../../README.md))
- For **Path B** only: Docker Desktop or Podman, plus a clone of [fluent-api](https://github.com/eten-tech-foundation/fluent-api)

---

## Shared mobile setup (both paths)

From the `fluent-mobile` repo root:

```bash
npm install
cp .env.example .env
npm run prebuild    # expo prebuild --clean --platform android
```

Set `EXPO_PUBLIC_API_BASE_URL` in `.env` per path below, then run (two terminals):

```bash
npm start
npm run android
```

Sign in with email/password (Better Auth). After login, sync populates local SQLite; screens read from the DB.

### What works after sync vs what needs a server

| Feature | After sync (offline OK) | Needs server |
|---------|-------------------------|--------------|
| Browse Projects / My Work / chapters | Yes | Initial sync |
| View synced verses | Yes | Initial sync |
| Recording UI (local) | Yes | — |
| Upload recordings | No | Yes |
| Re-sync / pull updates | No | Yes |
| Login / password reset | No | Yes |

---

## Path A — Hosted dev (no Docker)

Use when you want to exercise the app against **shared dev data** deployed from `main`.

### 1. Configure API URL

In `.env`:

```env
EXPO_PUBLIC_API_BASE_URL=https://dev.api.fluent.bible
```

This is the same backend as the Azure host `scribe-server-dev-*.azurewebsites.net`; the custom domain is preferred.

### 2. Log in

You need a **team dev account** that exists on hosted dev. The local Docker-only user `t@fluent.local` does **not** exist there.

Ask your team for credentials (e.g. a translator test account). You can verify login first at https://dev.app.fluent.bible.

### 3. Important: shared database

Hosted dev uses a **shared Postgres**. Do **not** seed or bulk-modify data there — you would affect other developers.

Read-only Postgres access may be provided for inspection/debugging only; the mobile app never connects to Postgres directly.

---

## Path B — Local Docker API

Use when you want your **own** seeded Postgres, local API changes, or no dependency on hosted dev.

### 1. Start fluent-api

In a separate clone of [fluent-api](https://github.com/eten-tech-foundation/fluent-api):

```bash
cp .env.example .env
# Set BETTER_AUTH_SECRET (see fluent-api README: openssl rand -hex 32)

./fapi.sh up
./fapi.sh db:init    # migrations + all seeds (interactive confirm)
```

This runs Postgres + API + worker on **port 9999** (Podman or Docker Compose, auto-detected).

### 2. Configure mobile API URL

In fluent-mobile `.env`:

```env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:9999
```

`10.0.2.2` is the Android emulator alias for the host machine's `localhost`. Use your machine's LAN IP if testing on a physical device.

### 3. Log in

Default seeded translator (after `db:init`):

| Field | Value |
|-------|-------|
| Email | `t@fluent.local` |
| Password | `t@123456` |

Project manager: `pm@fluent.local` / `pm@123456`

**My Work:** After [fluent-api#207](https://github.com/eten-tech-foundation/fluent-api/issues/207) (local dev project seeder) lands, sync will populate My Work. Until then, master data and dev users exist but project/chapter assignments may be empty.

---

## Verification (CI commands)

From `fluent-mobile` repo root:

```bash
npm run format:check && npm run lint && npm run typecheck && npm test -- --ci
```

Tests default `EXPO_PUBLIC_API_BASE_URL=http://localhost:9999` via `jest.env.cjs` — no live API required for CI.

Do **not** use `FLUENT_USER_EMAIL` or legacy `@env` imports.

---

## Related docs

- [Agent onboarding](../AGENT_ONBOARDING.md) — architecture, layer rules, EAS preview
- [QA preview testing](./qa-preview-testing.md) — install preview APKs from PRs
- [README — full machine setup](../../README.md) — JDK, Android Studio, emulator
