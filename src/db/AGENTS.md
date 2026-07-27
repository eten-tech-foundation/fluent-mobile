# src/db — local SQLite

Agents: UI reads here after sync; writes happen only in the repository. See [`.cursor/rules/architecture.mdc`](../../.cursor/rules/architecture.mdc).

| File | Role |
| ---- | ---- |
| `schema.ts` | `CREATE TABLE` statements (baseline for migration v1) |
| `migrations.ts` | Versioned `PRAGMA user_version` runner + table-rebuild helper |
| `index.ts` | Open DB, pragmas, `runMigrations` |
| `db.ts` | `getDatabase()` / `setDatabase()` singleton |
| `repository.ts` | Inserts/upserts in transactions |
| `queries.ts` | SELECTs for UI |

## Rules

- Call `getDatabase()` only **after** `initializeDatabase()` (throws otherwise).
- Schema changes go through **versioned migrations** in `migrations.ts` — do not reintroduce ignore-errors `ALTER` arrays.
- Foreign keys are enabled in init; use transactions in `repository.ts`.
- Screens must not write SQL — use `queries.ts` / `repository.ts`.

## Adding a synced entity

1. Table in `schema.ts` **and** a new migration version that applies it for existing installs
2. Types in `src/types/db/types.ts`
3. API + sync step (`services/`)
4. Inserts in `repository.ts`
5. Reads in `queries.ts` if UI needs them

## Migrations

- `runMigrations(db)` applies steps with `version > PRAGMA user_version`, once each, in a transaction.
- Use `rebuildTable()` for SQLite FK/default/type changes (#99 / #103).
- Current schema version: see `CURRENT_SCHEMA_VERSION` in `migrations.ts` (v3 = `chapter_assignments` assigned-user FK + `idx_ca_assigned_user`).

## Recordings linkage

- Canonical link is `recordings.bible_text_id → bible_texts.id` (not `chapter_assignment_id`).
- Chapter aggregates join assignments → chapter `bible_texts` → latest recordings (`RECORDINGS_JOIN_CA` in `queries.ts`).
- Per-user attribution on recordings is #105 — do not add it here.
