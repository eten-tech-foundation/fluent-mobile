# API client standard

Short contract for HTTP/network code in Fluent Mobile. Refs GitHub [#113](https://github.com/eten-tech-foundation/fluent-mobile/issues/113).

## Principles

1. **SQLite-first reads** — screens and tabs load data from `src/db/queries.ts` after sync. Do not add react-query `useQuery` hooks for project/chapter/verse lists.
2. **FluentAPI for network I/O** — screens never call `fetch` directly. Add endpoints to `src/services/api.ts` (built on `httpClient`).
3. **Typed responses** — declare shapes in `src/types/api/` and return them from `FluentAPI` methods (no `any`).
4. **Typed errors** — helpers throw `ApiError` or `AuthError`; UI reads `error.message` for display.

## Layers

| Layer | File | Role |
| ----- | ---- | ---- |
| Types | `src/types/api/` | Response interfaces, `ApiError` |
| HTTP helpers | `src/services/httpClient.ts` | `publicRequest`, `authedRequest`, header builder |
| Endpoints | `src/services/api.ts` | `FluentAPI` object |
| Token | `src/services/authToken.ts` | In-memory bearer via explicit accessor (#88) |
| Base URL | `src/config/apiBaseUrl.ts` | `getApiBaseUrl()` / `EXPO_PUBLIC_API_BASE_URL` |
| react-query | `src/services/queryClient.ts`, `queryKeys.ts` | Shared client, retry policy, stable keys |

## Error model

- **`ApiError`** — `{ status, code?, message }` from `createApiError()`.
  - `isRetryable`: status `0` (network) or `5xx`.
  - `isTerminal`: `4xx` (validation, not found, etc.).
- **`AuthError`** — extends `ApiError` with `status === 401` on authenticated requests. Sync listens via `isAuthError()` and clears the session.

Both `publicRequest` and `authedRequest` log sanitized metadata via `summarizeApiErrorResponse()` (no raw response bodies in logs).

## react-query usage

- **Provider:** `QueryClientProvider` in `App.tsx` using the shared `queryClient`.
- **Mutations:** auth flows (`useLogin`, `useForgotPassword`) and future upload actions.
- **Query keys:** `src/services/queryKeys.ts` — add keys here; do not inline string arrays in hooks.
- **Retry:** `shouldRetryApiRequest()` in `queryClient.ts` aligns with `ApiError.isRetryable`. Auth errors never retry.

## Adding an endpoint

1. Add request/response types under `src/types/api/`.
2. Add a method on `FluentAPI` using `authedRequest<T>` or `publicRequest<T>`.
3. If the UI needs a one-off network action, wrap in `useMutation` with a key from `queryKeys`.
4. If sync needs the data, call the new method from `src/services/sync.ts` and persist via `repository.ts`.
5. Unit-test with mocked `fetch` (see `src/services/api.auth.test.ts`).

## Testing

- Default `EXPO_PUBLIC_API_BASE_URL=http://localhost:9999` from `jest.env.cjs`.
- Mock `globalThis.fetch`; do not depend on a live API in unit tests.
- Wrap hook/screen tests that use react-query with `QueryClientTestWrapper` from `src/test/queryClientWrapper.tsx`.

## Verification

```bash
npm run format:check && npm run lint && npm run typecheck && npm test -- --ci
```
