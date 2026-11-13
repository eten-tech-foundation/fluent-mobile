# Official take replacement

Status: contract for #895. Not implemented. Part of #894.

This is the agreement for one official winner, the coverage it supersedes, and
what happens when the request is pending, rejected, or lost. It does not change
the recorder, the database, or the API. #897 (local write), the API
replacement (a fluent-api issue, not filed yet), and #898 (client
reconciliation) consume it. The user workflow stays incomplete until those
land and pass their own acceptance criteria.

Sources checked for this text, not deployment proof:

- fluent-mobile `main` `c1b3ac51` (line numbers below are from this commit)
- fluent-api `main` `2db5db7` (9 Nov 2026)

No deployed API SHA was recorded. Repository `main` is not a deployment.

## What is wrong today

`choose` in `useRecorder.ts` (lines 696–733) selects the take, then marks it
canonical. Those writes do not cover the same rows.

- `selectRecordingTake` (`recordingsRepository.ts` lines 622–719) clears
  `is_selected` on overlapping takes in the same project unit, same bible,
  and same book, for that owner (`clearOverlappingSelectedTakes`, lines
  258–324, using `shouldClearSelectionForIncomingTake` in
  `src/utils/recordingRange.ts`).
- `setCanonicalTake` (lines 532–610) clears `is_canonical` only on the same
  `bible_text_id` and project unit. A passage can stay canonical after a
  verse inside it is chosen.

The screen treats a take as official only when it is selected and canonical
and not `failed` (`inUse`, `useRecorder.ts` lines 674–680). Upload activates
when the take is selected or canonical (`shouldActivateTake`,
`recordingSync.ts` lines 296–301). Both rows can go up as active.

Changing those SQLite flags cannot turn off an anchor that is already on the
server. The API marks intersecting active coverage as `conflict` and does not
clear it (`markIntersectingCoverageConflicts` in
`verse-audio.coverage-writes.ts`, fluent-api `2db5db7` lines 66–153).
`POST /verse-audio/{projectUnitId}/{bibleTextId}/resolve` designates one
take inside that one anchor. It is manager conflict resolution, not
cross-anchor replacement.

## The operation

One replacement has:

- a stable winner take id (local `recordings.id`, and `server_take_id` once
  the take exists on the server)
- every superseded anchor: project unit, book, and inclusive start/end
  chapter and verse
- the winner's own anchor and inclusive range

An anchor is the recording row's `bible_text_id` plus its stored range. A
passage file is one anchor even when the range covers many verses or crosses
a chapter. A verse file is one anchor for that verse.

Overlap uses inclusive chapter-then-verse order, the same comparison as
`rangesOverlap` (`recordingRange.ts` lines 64–73). Equal, contained, and
partial overlaps all count. A missing or zero range does not overlap a
different anchor (same rule as `hasUsableRecordingRange`). The same
`bible_text_id` always overlaps itself.

### Resulting coverage

The winner becomes the only active coverage for its range. Each superseded
take becomes inactive as a whole. The file is not split. Verses that the
winner does not cover become uncovered. They do not stay active "from the
rest of the old file."

| Transition | Active after | Uncovered |
| --- | --- | --- |
| Same anchor, new take, same range | Winner only | None inside that range |
| Verse inside a passage replaces the passage | That verse's take | Every other verse in the passage |
| Passage replaces a verse inside it | The passage take | None inside the passage; the verse take is inactive |
| Partial overlap (1–5 replaced by 4–8) | The 4–8 take | Verses only in the old range (1–3) |
| Cross-chapter passage replaced by one verse inside it | That verse's take | Every other verse in the passage, including the other chapter |

Alternate takes stay. Replacement does not delete rows or bytes and does not
shorten retention. On a settled clean server unit, non-active takes already
fall out of `takes[]` after `AUDIO_TAKE_RETENTION_MS` (7 days by default;
fluent-api route text at `2db5db7`). Conflicted units keep every take until
resolved. This contract does not change that window. A longer guarantee would
be a separate retention change.

### Confirmation

Before a cross-anchor replacement, the confirmation names the winner and the
verses that will have no official recording. For a passage of verses 1–5
replaced by verse 3:

> Verse 3 becomes the official recording. The passage take for verses 1–5
> stops being official, including verses 1, 2, 4, and 5, which will have no
> official recording.

The inverse names the verse take that becomes inactive and the passage that
covers the whole range. Cancelling the confirmation changes nothing.

### Boundaries that do not mutate

The operation refuses, writes nothing, and explains why:

| Boundary | Explanation |
| --- | --- |
| Another account (any selected or canonical overlap in the unit whose `recorded_by_user_id` is set and is not the active user) | This official recording belongs to another account. |
| Another project unit, including `NULL` versus a real unit | These recordings are not in the same unit. |
| Another bible or book | These recordings do not cover the same book. |
| Another organization or project (server project of the unit) | You can't replace a recording in this project. |
| Chapter stage the caller cannot edit (API chapter-assignment edit gate), including `complete` | You can't change official recordings in this chapter. |
| Any affected anchor `conflictStatus` is `resolved` | A manager already settled this recording. |
| Any affected anchor `conflictStatus` is `conflict` | This overlap is waiting on manager resolution. Choosing a take here does not replace it. |
| Overlap set or version changed under the request | Someone else changed these recordings. Refresh and try again. |
| Any affected take is uploaded, uploading, or outcome-unknown, and the coverage-replacement API is not adopted | This recording is on the server, or its upload result is unknown. Replacing it here isn't available yet. |

Ordinary selection of a non-overlapping take is not this operation.
`POST .../resolve` stays the manager action for one conflicted anchor. A
holder of `content:assign` does not gain cross-anchor replacement through
resolve.

## Local eligibility for #897

The overlap set is every selected or canonical take in the same project
unit, bible, and book whose range overlaps the winner, any owner, using
the overlap rule above. A selected verse elsewhere in the book is not in
the set. Another account's overlapping row is in the set, and the
operation then refuses. Canonical is already per unit across accounts
(`setCanonicalTake`, lines 559–570). The upload query does not filter by
owner, so leaving the other account's take out of the set would let both
upload as active.

#897 may mutate SQLite only when the winner and every take in that set
are still only on this device. The winner is included even when it is an
alternate that is not selected or canonical yet:

- `server_take_id` is null
- `blob_key` is null
- `sync_status` is `pending`
- `readUploadOperationOrUnreadable(id)` with no intent version
  (`src/services/uploadOperationState.ts`) returns null. Any other value
  is not eligible, including `dispatched` and unreadable storage.
  `readUploadOperation(id, currentIntent)` is not this check: it returns
  null for an older operation left behind after a conflict.
  `pending` with a null blob is what a paused or cancelled upload returns
  to (`recordingSync.ts` around lines 959–966), so those columns alone do
  not prove the take was never sent.
- A read of both raw keys, `upload_receipt:{id}` and
  `upload_receipt_unbound:{id}` (`UNBOUND_UPLOAD_RECEIPT_KEY_PREFIX` in
  `src/services/uploadReceipts.ts`), succeeds and both are absent. A throw
  makes the take ineligible. `readUploadReceipt` returns null on a throw
  and when moving an inapplicable receipt fails, so it is not this check.
  `retainUploadReceiptUnbound` moves a receipt onto the unbound key when
  `markRecordingUploaded` does not apply (`recordingSync.ts` around lines
  736–751). A conflicted receipt may have no `serverTakeId`, so
  `readUploadReceiptServerTakeId` is not enough.

`recording_deletions` is not an eligibility column. Its key is
`server_take_id`, which is already required to be null, so no deletion row
can point at these takes.

`pending` plus `blob_key` null is not enough. The operation records live in
key-value storage, not in new `recordings` columns. #897 is not blocked on
a schema change.

It is blocked on a missing read. The chapter list is membership by anchor
chapter: a cross-chapter passage appears on its start chapter, not on later
chapters it covers (fluent-api `verse-audio.route.ts` summary at
`2db5db7`). A GET of the winner's chapters misses an active passage
anchored earlier. A local row on an overlapping verse does not prove the
server's active take is that row. Another device can hold verse 3 active
while this device has its own never-sent verse 3; a passage upload would
then mark both anchors `conflict`. There is no route on `2db5db7` that
returns every active recording in the unit whose coverage intersects a
range.

Named prerequisite, before any #897 write: that intersecting-coverage read,
including anchors that start in an earlier chapter. It belongs on the
unfiled fluent-api issue with the coverage-replacement route. Until a
successful read shows no overlapping active anchor except the winner's own
(same-anchor upload already handles that one), #897 writes nothing,
online or off, and says it can't confirm the server. The column and
key-value checks above are necessary once the read exists. They are not
sufficient while it does not.

When the set qualifies, one transaction:

- winner: `is_selected = 1` and `is_canonical = 1`
- each superseded take: `is_selected = 0` and `is_canonical = 0`
- no row or file delete
- the winner's `sync_status` stays `pending` when it was already `pending`

Clearing both flags is what keeps the loser out of today's
selected-or-canonical upload rule (`recordingSync.ts` lines 300–301). #897
does not change that predicate. A new recording is inserted selected and
not canonical, and that first upload stays active. Changing the predicate
would stop those first uploads and is not part of this contract.

Any other set is non-mutating, with the matching explanation above. #897
does not call the coverage-replacement route and does not clear flags on an
uploaded anchor. The chapter GET is a read for eligibility, not the
replacement.

## Server mutation

There is no production endpoint that deactivates a different anchor. Uploading
with `activate=true` replaces the active take on that anchor when
`baseVersionToken` matches. Omitting the token is the deprecated legacy
hatch on that same PUT: it also replaces the active take. A present stale
token does not. `POST /verse-audio/{projectUnitId}/{bibleTextId}/resolve`
requires `conflictStatus = 'conflict'` and stays inside one `bibleTextId`.

Cross-anchor replacement is a new route, named here so #898 does not invent
one:

`POST /verse-audio/{projectUnitId}/coverage-replacement`

JSON body:

- `requestId` — client UUID, stable across retries of this attempt
- `winner` — `{ bibleTextId, takeId, versionToken }`
- `superseded` — every other affected anchor `{ bibleTextId, versionToken }`

The caller must pass the same chapter-assignment edit gate as verse-audio
upload, on every affected anchor. A manager the gate already allows is not
denied by an extra `content:update` requirement. Missing permission on one
anchor rejects the whole request. `content:assign` does not turn
`POST .../resolve` into this route.

In one database transaction the server:

1. Locks the unit's recording rows `FOR UPDATE`, ordered by id.
2. Recomputes the same-book overlap set. If it is not exactly `superseded`,
   the transaction rolls back with `409` and the current set. A row that
   appeared after the client looked is a mismatch, not a partial write.
3. Compare-and-swaps every listed `versionToken`, winner included. Any miss
   rolls back with `409` and `currentVersionToken` per anchor. No anchor is
   deactivated alone.
4. Sets the winner's `activeTakeId` to `takeId` and advances that anchor's
   token. Clears `activeTakeId` on every superseded anchor and advances each
   of those tokens. Does not split ranges. Does not delete takes. Does not
   mark `resolved` and does not open `conflict` when the set matched.
5. Stores `requestId` with that result.

Replay of the same `requestId` and the same body returns the stored result
and does not advance tokens again. The same `requestId` with a different
body is `409`. A newer overlapping upload that commits first makes this
request `409`; the upload's own stale token follows the existing upload
conflict rules. Neither path leaves one anchor deactivated and the other
unchanged.

`200` returns each affected anchor: `bibleTextId`, `versionToken`,
`activeTakeId`, coverage, and the uncovered verses. The client adopts that
body only. HTTP success without that body is not success.

Timeout, lost response, or cancellation is outcome-unknown. The client does
not flip local flags from the silence. Readback is a replay of this `POST`
with the same `requestId`. The existing per-anchor `GET` does not return
`requestId`, so it is not the proof. A replay that returns the stored
result is adopt. A replay that reports the set unchanged is safe to retry.
Anything else stops and tells the user the result is unknown. `GET` is only
for showing the anchors after that stop.

## Work split

| Ticket | Owns | Does not own |
| --- | --- | --- |
| #895 (this document) | The rules above | SQL, routes, recorder |
| #896 | Interim guard: the official control must not confirm a cross-anchor replacement the client cannot finish | The replacement itself |
| #897 | The local transaction once the intersecting-coverage read exists and the key-value checks pass | Any write before that read exists; the coverage-replacement route; the activation predicate |
| API replacement (fluent-api issue, not filed) | `POST .../coverage-replacement`, and the intersecting-coverage read #897 waits on | Mobile SQL |
| #898 | Call the route, read back, adopt tokens, and surface rejection and outcome-unknown | Inventing a path or payload |

#896 stays until #898 is in the client and the route is deployed on that
environment (deployed SHA recorded, not inferred from `main`). It can come
off only for a caller who passes the matrix above and whose affected rows
are not outcome-unknown. #897 also waits on the intersecting-coverage
read, so it does not run on today's chapter list. Until both exist, #896
keeps blocking the official control, because the current
select-then-canonical pair is the bug.

## Examples

The local after-states below are what the #897 transaction writes once the
intersecting-coverage read exists and returns no other active anchor. They
do not run against today's chapter list.

Passage verses 1–5, anchor on verse 1, replaced by verse 3. Same unit, same
owner, never sent, read empty.

- Before: passage `is_selected` and `is_canonical`. Verses 1–5 covered by
  that file.
- Request: winner verse 3; superseded anchor is the passage.
- After: verse 3 selected and canonical. Passage neither. Verses 1, 2, 4,
  and 5 uncovered. Both files remain. Next upload activates only verse 3.

Inverse, never sent: verse 3 official, user confirms the passage. Verse 3
loses both flags. Passage gains both. Verses 1–5 are covered. The verse file
remains and is not active.

Same pair already uploaded: no local write. Explanation: the recording is on
the server and replacement is not available until the coverage-replacement
route and #898 are in use. `resolve` is not a fallback.

Two owners, same unit: no write. Explanation names the other account.

Cross-chapter passage 1:30–2:3 replaced by verse 2:1, never sent: the whole
passage loses both flags. Verse 2:1 is official. 1:30 through the end of
chapter 1, and verses 2:2–2:3, are uncovered.

Concurrent replacement and upload: one lock order, one transaction. The
loser gets `409` and retries or stops. Neither response deactivates only
one side.
