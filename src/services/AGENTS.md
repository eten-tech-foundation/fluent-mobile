# src/services — HTTP, auth, sync orchestration

Agents: keep this layer thin. Full contract: [docs/guides/api-client-standard.md](../../docs/guides/api-client-standard.md). Architecture: [`.cursor/rules/architecture.mdc`](../../.cursor/rules/architecture.mdc).

## Rules

- **Screens never call `fetch`.** Add endpoints on `FluentAPI` in `api.ts` (via `httpClient`).
- **SQLite-first reads** — UI loads from `src/db/queries.ts` after sync; do not add react-query list hooks for projects/chapters/verses.
- **Auth** — bearer via `authToken` / `authedRequest`; `publicRequest` has no bearer. Mobile headers on auth calls only (`signIn`, `forgotPassword`, `signOut`).
- **Sync** — orchestration + retries live in `sync.ts`; persist through `src/db/repository.ts`; KV timestamps/counts in `storage.ts`.
- **Verse audio upload** — `FluentAPI.uploadVerseAudio` + [recordings-sync-contract.md](../../docs/guides/recordings-sync-contract.md) (#102). Worker (#100) must not call `fetch` directly.
- **Errors** — `ApiError` / `AuthError`; no raw response bodies in logs.

## Adding an endpoint

1. Types in `src/types/api/`
2. Method on `FluentAPI`
3. Sync step + repository write if data is cached locally
4. Unit-test with mocked `fetch` (see `*.test.ts` siblings)

## Do not

- Put business SQL in this folder (use `repository` / `queries`)
- Commit secrets or edit `.env` in PRs
