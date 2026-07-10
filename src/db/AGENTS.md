# src/db — local SQLite

Agents: UI reads here after sync; writes happen only in the repository. See [`.cursor/rules/architecture.mdc`](../../.cursor/rules/architecture.mdc).

| File | Role |
| ---- | ---- |
| `schema.ts` | `CREATE TABLE` statements |
| `index.ts` | Open DB, pragmas, create tables |
| `db.ts` | `getDatabase()` / `setDatabase()` singleton |
| `repository.ts` | Inserts/upserts in transactions |
| `queries.ts` | SELECTs for UI |

## Rules

- Call `getDatabase()` only **after** `initializeDatabase()` (throws otherwise).
- **No migration framework yet** — schema edits affect existing device DB files; change carefully.
- Foreign keys are enabled in init; use transactions in `repository.ts`.
- Screens must not write SQL — use `queries.ts` / `repository.ts`.

## Adding a synced entity

1. Table in `schema.ts`
2. Types in `src/types/db/types.ts`
3. API + sync step (`services/`)
4. Inserts in `repository.ts`
5. Reads in `queries.ts` if UI needs them
