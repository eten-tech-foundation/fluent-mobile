# Hydrate unbundled pericope sets from GET /pericope-sets/{id}

> Confirmed from code — API ready, mobile not wired (#534 audit; I.29b
> skipped).

## Summary

`syncPericopes` (`src/services/sync.ts`) seeds only the APK-bundled FCBH
(id 1) and FIA (id 2) sets. For any other `pericope_set_id` it logs "blocked
on network path (fluent-api#309)" and stores nothing. fluent-api `main` now
serves `GET /pericope-sets/{id}` with `?bookCode=`, ETag and 304 (fluent-api
PR #345). Mobile has no client for it, and the doc comment on
`syncPericopes` still describes the step as a no-op with a "#TBD" follow-up.

## Expected

Per #438: for a set that is not bundled, or whose server version is newer,
one set-level request (per set or book) hydrates SQLite, and unchanged sets
revalidate with `If-None-Match` → 304.

## Actual

Projects on an unbundled set have no pericope data; pericope mode silently
shows verses.

## Steps to reproduce

1. Use a project whose `pericope_set_id` is neither 1 nor 2.
2. Sync, then switch Settings → Drafting unit → Pericope.
3. The Bible tab shows verse rows; logs show the "blocked on network path"
   message.

## Acceptance criteria

- [ ] `FluentAPI.getPericopeSet(id, { bookCode, etag })` handles 200 and 304.
- [ ] `syncPericopes` falls back to the API when a set/book is not bundled,
      stores the ETag, and sends `If-None-Match` on the next sync.
- [ ] No per-chapter pericope requests (the #438 bandwidth contract).
- [ ] The stale doc comment on `syncPericopes` is updated.
- [ ] Unit tests cover bundled, API 200, API 304 and offline paths.
- [ ] Android device QA with an unbundled set once one exists in dev.

## Related

- Parent audit: #534 (epic #526)
- Feature: #438 (PR #445), #447 (PR #450), fluent-api#309 (fluent-api PR #345)
- Assessment: `docs/assessments/pericope-view/`
