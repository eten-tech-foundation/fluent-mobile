# Verse audio upload contract (mobile ↔ Fluent API)

Frozen client contract for uploading translator verse audio. Refs GitHub [#102](https://github.com/eten-tech-foundation/fluent-mobile/issues/102), epic [#117](https://github.com/eten-tech-foundation/fluent-mobile/issues/117), upload worker [#100](https://github.com/eten-tech-foundation/fluent-mobile/issues/100). Doc refresh: [#547](https://github.com/eten-tech-foundation/fluent-mobile/issues/547).

## fluent-api truth (consulted)

| Source | SHA / ref | Audio upload? |
| --- | --- | --- |
| Local clone `/Users/matt/Documents/Development/gloo/fluent-api` **`origin/main`** | `34375d76794b4565e1acf95c3f2c168762b6b293` | **Yes** — `src/domains/verse-audio/` registered; storage is **Cloudflare R2** via `src/lib/audio-storage.ts` (S3-compatible). Azure Blob is gone from this path. |
| Historical [fluent-api PR #224](https://github.com/eten-tech-foundation/fluent-api/pull/224) `feat/verse-audio` | **Merged / obsolete as an “open” gate** | Introduced the `PUT/GET/DELETE /verse-audio/...` surface mobile still uses; later work swapped storage to R2. Do not treat #224 as unmerged. |
| Historical draft [fluent-api PR #188](https://github.com/eten-tech-foundation/fluent-api/pull/188) `ft/audio-record-sync` | Superseded | Competing `POST /recordings/sync` design — **not** what mobile implements. |

**Mobile matches shipped `main` verse-audio routes** (multipart `PUT`, Bearer session, chapter-assignment edit gate). Original #102 text assumed `POST /recordings/sync`; that path was never the frozen client contract.

**Server owns storage secrets.** Mobile never ships `R2_*`, `AZURE_STORAGE_CONNECTION_STRING`, `AUDIO_CONTAINER`, or any other storage keys. Do not add them to this app’s `.env` / `EXPO_PUBLIC_*`.

### 503 when R2 is unavailable

If R2 credentials are unset or the audio bucket probe failed at API boot, verse-audio handlers return **`503`** with body `{ message: "Audio storage is unavailable" }` (`STORAGE_UNAVAILABLE_BODY` in `verse-audio.route.ts`). That is intentional — one clean 503 instead of scattered 500s from R2 calls.

**Mobile:** `outcomeFromVerseAudioFailure` in `src/services/verseAudioContract.ts` treats **`status === 503` as terminal `failed`** (`retryable: false`) — do not backoff-loop; fixing storage is an ops/config change on the API host.

## Upload endpoints (verse + pericope range)

| | Verse | Pericope / range |
| --- | --- | --- |
| Method / path | `PUT /verse-audio/{projectUnitId}/{bibleTextId}` | `PUT /verse-audio/{projectUnitId}/range` ([fluent-api#377](https://github.com/eten-tech-foundation/fluent-api/issues/377) / mobile [#584](https://github.com/eten-tech-foundation/fluent-mobile/issues/584)) |
| Content-Type | `multipart/form-data` (omit manual `Content-Type`; runtime sets boundary) | same |
| Auth | Bearer session + server `CONTENT_UPDATE` / chapter-assignment edit gate | same |
| Body | `file` (required), `durationSeconds` / `baseVersionToken` (optional) | same + `granularity=pericope`, `bibleTextId`, `startChapter`, `startVerse`, `endChapter`, `endVerse` |
| IDs | Path carries `projectUnitId` + `bibleTextId`. **`bibleTextId` must be the Fluent API `bible_texts.id`** (same as bulk-texts `verses[].id`). Local SQLite `bible_texts.id` is that server id (#469), not an autoincrement surrogate. | Path carries `projectUnitId` only; `bibleTextId` + range in multipart |
| Client | `FluentAPI.uploadVerseAudio()` → `src/services/api.ts` (`verseAudioUploadPath` / `verseAudioRangeUploadPath`) | same |
| Types | `src/types/api/verseAudio.ts` | same |
| Outcome helpers | `src/services/verseAudioContract.ts` | same |

**Dependency:** pericope range `PUT` requires fluent-api#377 deployed on the target environment. Until then, Sync Now still runs metadata sync; range PUTs fail terminal until that API lands. Verse `PUT` paths above are on fluent-api `main`.

### Success (`200`)

JSON matching `verseAudioResponseSchema`: `id`, `projectUnitId`, `bibleTextId`, `uploadedBy`, `contentType`, `sizeBytes`, `durationSeconds`, `verseNumber`, `downloadUrl`, `createdAt`, `updatedAt` (plus version/conflict fields when the API returns them).

**Local persistence (#100):** `sync_status = 'uploaded'`; store blob key `unit-{projectUnitId}/text-{bibleTextId}` via `blobKeyFromVerseAudioResponse()` (same as server `audioBlobName`).

### Errors → client (#100)

| Status | Body shape | Client |
| --- | --- | --- |
| `400` / `413` / other `4xx` (except below) | `{ message }` | `failed` + `upload_error`; **no retry** |
| `401` | `{ message }` | `AuthError` — clear session |
| `403` / `404` | `{ message }` (forbidden often masked as 404) | terminal `failed` |
| `409` | CAS / version conflict (may include `currentVersionToken`) | retryable — see `verseAudioContract.ts` |
| `503` | `{ message: "Audio storage is unavailable" }` (R2 unset or bucket unreachable at boot) | **terminal `failed`** — `verseAudioContract.ts` (`retryable: false`; do not backoff-loop) |
| `5xx` (other) | `{ message }` | retry with backoff |
| Network / timeout | `ApiError` status `0` | retry with backoff |

### Also on fluent-api `main` (related, not required for the upload worker)

- `GET /verse-audio/{projectUnitId}/{bibleTextId}` — metadata + signed `downloadUrl`
- `GET /verse-audio?projectUnitId=&bookId=&chapterNumber=` — chapter list
- `POST /verse-audio/{projectUnitId}/{bibleTextId}/resolve` — conflict resolve
- `DELETE /verse-audio/{projectUnitId}/{bibleTextId}`

## Deviations from the original #102 proposal

| Proposed in #102 | What shipped (fluent-api `main` + mobile) |
| --- | --- |
| `POST /recordings/sync` | `PUT /verse-audio/{projectUnitId}/{bibleTextId}` (+ range path for pericopes) |
| Form fields `bible_text_id`, `take_number`, `relative_path`, … | Path IDs + multipart `file` / optional `durationSeconds` / `baseVersionToken` |
| Response `{ blob_key }` | Full metadata + `downloadUrl`; local `blob_key` = deterministic `unit-…/text-…` |
| R2 env vars **server-side only** (never in mobile / `EXPO_PUBLIC_*`) | Same on shipped `main` (`R2_*` in fluent-api). Historical Azure keys obsolete for this path. |

## Out of scope here

- Upload worker / retries / single-flight — #100 (`src/services/recordingSync.ts`)
- Upload orchestrator — #150 (`setChapterUploadWorker`)
- Provisioning R2 in any deployed environment — API / ops, not this app

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
