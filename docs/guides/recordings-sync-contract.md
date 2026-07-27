# Verse audio upload contract (mobile ↔ Fluent API)

Frozen client contract for uploading translator verse audio. Refs GitHub [#102](https://github.com/eten-tech-foundation/fluent-mobile/issues/102), epic [#117](https://github.com/eten-tech-foundation/fluent-mobile/issues/117), upload worker [#100](https://github.com/eten-tech-foundation/fluent-mobile/issues/100).

## fluent-api truth (consulted)

| Source | SHA / ref | Audio upload? |
| --- | --- | --- |
| Local clone `/Users/matt/Documents/Development/gloo/fluent-api` **`main`** | `3fd1027313c40c5e7a9fb3abe97c2b72d313e226` | **None** — no `recordings`, `verse-audio`, or R2 modules under `src/domains` |
| Open [fluent-api PR #224](https://github.com/eten-tech-foundation/fluent-api/pull/224) `feat/verse-audio` | tip of that branch | **Yes** — Azure Blob `PUT/GET/DELETE /verse-audio/...` (built for mobile) |
| Draft [fluent-api PR #188](https://github.com/eten-tech-foundation/fluent-api/pull/188) `ft/audio-record-sync` | draft, dirty vs main | Competing — `POST /recordings/sync` + Cloudflare R2; conflicts with #224 |

**Frozen for #100:** match **#224** (non-draft, OpenAPI, auth gates, tests). Original #102 text assumed R2 + `/recordings/sync` (#188); that is **not** on `main`. Ticket-level waiver on #102 links API follow-up to merge (or reject) #224 vs #188.

**Server owns storage secrets.** Mobile never ships `AZURE_STORAGE_CONNECTION_STRING`, `AUDIO_CONTAINER`, or any `R2_*` keys. Do not add them to this app’s `.env` / `EXPO_PUBLIC_*`.

## Upload endpoint (#224)

| | |
| --- | --- |
| Method / path | `PUT /verse-audio/{projectUnitId}/{bibleTextId}` |
| Content-Type | `multipart/form-data` (omit manual `Content-Type`; runtime sets boundary) |
| Auth | Bearer session + server `CONTENT_UPDATE` / chapter-assignment edit gate |
| Body | `file` (required), `durationSeconds` (optional positive number as text) |
| IDs | Path only — no user id in the body |
| Client | `FluentAPI.uploadVerseAudio()` → `src/services/api.ts` |
| Types | `src/types/api/verseAudio.ts` |
| Outcome helpers | `src/services/verseAudioContract.ts` |

### Success (`200`)

JSON matching `verseAudioResponseSchema`: `id`, `projectUnitId`, `bibleTextId`, `uploadedBy`, `contentType`, `sizeBytes`, `durationSeconds`, `verseNumber`, `downloadUrl`, `createdAt`, `updatedAt`.

**Local persistence (#100):** `sync_status = 'uploaded'`; store blob key `unit-{projectUnitId}/text-{bibleTextId}` via `blobKeyFromVerseAudioResponse()` (same as server `audioBlobName`).

### Errors → client (#100)

| Status | Body shape | Client |
| --- | --- | --- |
| `400` / `413` / other `4xx` (except below) | `{ message }` | `failed` + `upload_error`; **no retry** |
| `401` | `{ message }` | `AuthError` — clear session |
| `403` / `404` | `{ message }` (forbidden often masked as 404) | terminal `failed` |
| `503` | `{ error, details }` storage unconfigured | terminal `failed` (do not backoff-loop) |
| `5xx` (other) | `{ message }` | retry with backoff |
| Network / timeout | `ApiError` status `0` | retry with backoff |

### Also on #224 (not required for upload worker)

- `GET /verse-audio/{projectUnitId}/{bibleTextId}` — metadata + 15-min SAS `downloadUrl`
- `GET /verse-audio?projectUnitId=&bookId=&chapterNumber=` — chapter list
- `DELETE /verse-audio/{projectUnitId}/{bibleTextId}`

## Deviations from the original #102 proposal

| Proposed in #102 | Frozen to fluent-api #224 |
| --- | --- |
| `POST /recordings/sync` + Cloudflare R2 | `PUT /verse-audio/{projectUnitId}/{bibleTextId}` + Azure Blob |
| Form fields `bible_text_id`, `take_number`, `relative_path`, … | Path IDs + multipart `file` / optional `durationSeconds` |
| Response `{ blob_key }` | Full metadata + `downloadUrl`; local `blob_key` = deterministic `unit-…/text-…` |
| R2 env vars server-side | Azure `AZURE_STORAGE_CONNECTION_STRING` / `AUDIO_CONTAINER` server-side |

## Out of scope here

- Upload worker / retries / single-flight — #100 (`src/services/recordingSync.ts`)
- Upload orchestrator — #150 (`setChapterUploadWorker`)
- Live DevQA until #224 (or chosen API) is merged and deployed — waived on #102 with follow-up

## Local attribution (#105)

| | |
| --- | --- |
| Column | `recordings.recorded_by_user_id` (nullable FK → `users(id)`, migration v5) |
| Capture | `addRecordingTake` sets the column from `getActiveUserId()` |
| Latest / takes | Scoped per `(bible_text_id, recorded_by_user_id)` so shared devices keep separate take stacks |
| Aggregates | Project / My Work joins filter `r.recorded_by_user_id = ?` for the active user |
| Upload | `recordingSync` prefers `getCredentials(recordedByUserId)` for each pending row; falls back to the pass token when owner credentials are missing or the row is unattributed (pre-v5) |

Server identity still comes from the Bearer token on `PUT /verse-audio/...`. Local attribution ensures the **correct** token is selected when multiple accounts share a device.

## Verification

```bash
npm run format:check && npm run lint && npm run typecheck && npm test -- --ci
```

Unit tests mock `fetch` (`api.verseAudio.test.ts`, `verseAudioContract.test.ts`). No live API in CI.
