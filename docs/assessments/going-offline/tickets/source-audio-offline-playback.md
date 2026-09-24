# Play downloaded source audio offline

> Confirmed on device (#529 audit, G.25).

**GitHub issue:** #579

## Summary

#51 puts source audio in Tier 1: it is always part of the Prepare for Offline
download. On `main`, the source audio player never reads a local file.
`useSourceAudio` fetches the chapter's audio from fluent-api on every cache
miss (`src/hooks/useSourceAudio.ts:172`) and streams the returned URL. The
response cache is in memory only (`:153-158`). In airplane mode the fetch
fails and the player moves to `error`, even for a chapter prepared for
offline.

The Prepare for Offline catalog is still a mock today (#504 / PR #562, open).
fluent-api `main` already serves
`GET /projects/{id}/source-audio/manifest` for Tier 1 source audio.

## Expected

- After Prepare for Offline completes for a chapter, its source audio plays
  in airplane mode from the downloaded file, including verse seek.
- A chapter without downloaded audio shows the existing "no audio" or
  unavailable state offline.

## Actual

- G.25: on a chapter prepared for offline, in airplane mode, the Bible tab
  shows the source text, but the source audio player shows only a Retry
  button.
- G.27: on a chapter that was not prepared, offline, the player also shows
  Retry instead of an unavailable state.

## Steps to reproduce

1. On Wi-Fi, prepare one chapter for offline in a project that has source
   audio.
2. Turn on airplane mode, then kill and reopen the app.
3. Open the chapter → Bible tab, and play the source audio.

## Acceptance criteria

- [ ] Prepare for Offline enqueues Tier 1 source audio from the fluent-api
      source-audio manifest (coordinate with #504).
- [ ] The source audio player resolves a downloaded local file before calling
      the API, and plays offline with verse timestamps.
- [ ] Offline without a download shows the unavailable state, not a spinner.
- [ ] Unit tests cover local-first resolution and the offline fallback.
- [ ] Android device QA: prepare → airplane mode → cold start → play + seek.

## Related

- Parent audit: #529 (epic #526)
- Spec: #51 (Tier 1), #412 (Bible tab source audio player)
- Related: #504, PR #562; fluent-api source-audio manifest; sibling audit #531
- Assessment: `docs/assessments/going-offline/`
