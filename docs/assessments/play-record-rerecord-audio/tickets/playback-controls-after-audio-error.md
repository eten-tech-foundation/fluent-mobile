# Take playback controls stuck after an audio error

> Draft — pending device confirmation (#528 audit).

## Summary

`verseAudioReducer` (`src/hooks/verseAudioReducer.ts`) only transitions
`PLAY` from `recorded` (and `PLAYBACK_END` from `playing`). After any failure
dispatches `ERROR` (missing take file, seek failure, resume failure, and so
on), the machine stays in `error`. From there:

- `playTake` starts audio, but `PLAY` is ignored, so `state !== 'playing'`
  and the card keeps showing **Play** instead of **Pause**.
- `shouldEndPlaybackOnIdle` requires `playing`, so the natural end is not
  handled and `playingTakeId` stays set.
- The state recovers only after `REHYDRATE` (verse change, or deleting a
  take while others remain), `DELETE` (deleting the last take), or `START`.

## Expected

After dismissing an audio error, playing any take behaves normally: Pause
shows while playing, and the card resets at the end.

## Actual

To confirm on device.

## Steps to reproduce

1. Record two takes on a verse.
2. Force an error on Take 1. On a debuggable `development` profile build,
   remove its file with
   `adb shell run-as com.eten.fluent rm files/recordings/<id>.m4a`
   (`run-as` fails on the release nightly APK), then tap Play on Take 1 and
   dismiss "Take file is missing on disk". On nightly, use any other audio
   error instead, such as a resume failure after a screen lock.
3. Tap Play on Take 2.
4. Observe: audio plays, the icon stays Play, and tapping it again restarts
   the audio.

## Acceptance criteria

- [ ] `PLAY` is accepted from `error` when takes exist, or the error state is
      cleared back to `recorded` once the alert is dismissed.
- [ ] Reducer unit test: `error` + `PLAY` → `playing`, then `PLAYBACK_END` →
      `recorded`.
- [ ] `useVerseAudio` test: a failed play followed by a successful play
      shows the playing state.
- [ ] Android device QA using the steps above.

## Related

- Parent audit: #528 (epic #526)
- Related: #96, #97, #298
- Assessment: `docs/assessments/play-record-rerecord-audio/`
