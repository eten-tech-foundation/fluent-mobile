# SPIKE #176 — Current state snapshot (forced flags)

> Reference snapshot of how the recording/playback pipeline behaves **as the
> branch currently stands**. This documents the temporary hard-forced spike
> override, not the intended production path. Companion to
> [`176-m4a-vs-segment-manifest.md`](./176-m4a-vs-segment-manifest.md).

## TL;DR

Right now the app **records every segment as `.m4a`**, **commits a JSON segment
manifest** (instead of merging + remuxing to a single seekable file), and
**plays the committed take back through the JS-only segmented playback hook** so
the ordered segments behave as one logical audio source.

This is on because `HARD_FORCED_FLAGS` in `src/spike/m4aSpike.ts` pins the three
final-test flags **permanently ON**, ignoring both persisted values and the
on-screen switcher. When those flags are `false` (the documented production
default) the pipeline instead captures ADTS, merges + native-remuxes into a
single seekable `.m4a`, and plays it as a single file.

## What is forced on

`src/spike/m4aSpike.ts`:

```ts
const HARD_FORCED_FLAGS: Partial<SpikeFlags> = {
  recordM4a: true,
  keepSegmentManifest: true,
  segmentPlayback: true,
};
```

- Merged into the initial snapshot: `{ ...loadPersistedFlags(), ...HARD_FORCED_FLAGS }`.
- Pinned in `setSpikeFlag` so `toggleSpikeFlag` / the on-screen `SpikeFlagSwitcher` cannot turn them off.
- `skipRemux` is left runtime-toggleable (no effect while `keepSegmentManifest` is on).

## Pipeline behavior with the forced flags

### 1. Capture — `.m4a` segments (`recordM4a: true`)

`src/hooks/useRecorder.ts` selects the recorder preset by flag:

- **Forced (m4a):** `{ ...RecordingPresets.HIGH_QUALITY, directory: 'document' }` → HIGH_QUALITY `.m4a` (mpeg4).
- Production (off): ADTS `.aac` (`outputFormat: 'aac_adts'`, `audioEncoder: 'aac'`).

Each app-lifetime recording session is one segment; resuming after a process
kill appends a new segment to the ordered list.

> Caveat: a classic MP4/`.m4a` is only valid once its `moov` atom is written on
> a clean `stop()`. A segment truncated by a mid-record process kill has no
> `moov` and is unplayable — this is exactly the failure mode the kill test
> targets. See the manifest drop behavior below.

### 2. Commit — JSON manifest (`keepSegmentManifest: true`)

`src/app/tabs/drafting/record/hooks/useVerseRecorder.ts` (`onCommit`) takes the
manifest branch instead of the production merge + remux:

- `writeSpikeManifest(manifestKey, fileUris)` probes each segment for its exact
  duration and writes a sidecar `{ version: 1, segments: [{ uri, durationMs }] }`
  JSON (extension `.json`, `SPIKE_MANIFEST_EXTENSION`).
- The recording row's `localFilePath` points at the manifest; `durationMs` is
  the summed segment duration (falling back to the wall-clock value if 0).
- Segments that probe to `0 ms` are **dropped** — for `.m4a` that means a
  `moov`-less file from a mid-record kill, so a killed segment does not survive
  in the manifest.

Production path (flag off): `concatenateAacSegments` → probe → `remuxTakeToSeekableContainer`
(native `AacRemux`, with ADTS fallback) → single seekable `.m4a` moved into the store.

### 3. Playback — segmented, single logical stream (`segmentPlayback: true`)

`src/app/tabs/drafting/record/RecordTab.tsx` routes Review playback:

```ts
const { segmentPlayback } = useSpikeFlags();
const spikeManifest = useSpikeManifest(recorder.currentRecording);
const segmentedPlayback = useSegmentedAudioPlayback(
  segmentPlayback ? spikeManifest : null,
);
const reviewPlayback =
  segmentPlayback && spikeManifest ? segmentedPlayback : recorder.playback;
```

- `useSpikeManifest` resolves the committed take's manifest to `PlaybackSegment[]`
  (only when `segmentPlayback` is on; otherwise it does no file IO).
- `useSegmentedAudioPlayback` (`src/hooks/useSegmentedAudioPlayback.ts`) presents
  the ordered segments as one stream: summed `durationMs`, cumulative
  `positionMs`, global `seek` that locates + switches the containing segment,
  and auto-advance across segment boundaries. It matches `UseAudioPlaybackApi`,
  so it is a drop-in for the Review scrub UI.

Production path (flag off): `reviewPlayback` is exactly `recorder.playback`
(built-in single-file playback).

## Involved files

| Concern | File |
|---|---|
| Spike flags + hard override + manifest read/write | `src/spike/m4aSpike.ts` |
| Recorder preset (m4a vs ADTS) + segment/state machine | `src/hooks/useRecorder.ts` |
| Commit: manifest branch vs merge + remux | `src/app/tabs/drafting/record/hooks/useVerseRecorder.ts` |
| Review playback routing + on-screen segment list | `src/app/tabs/drafting/record/RecordTab.tsx` |
| Segmented playback hook (logical single stream) | `src/hooks/useSegmentedAudioPlayback.ts` |
| Storage: concat, probe, native remux | `src/services/recordingStorage.ts` |
| Native ADTS→M4A remux module | `modules/aac-remux/android/.../AacRemuxModule.kt` |

## Reverting to the production path

Set `HARD_FORCED_FLAGS` back to `{}` (or delete it, and ultimately the whole
`src/spike/` module) once the spike decision lands. With no forced flags and the
defaults `false`, the pipeline returns to ADTS capture → merge + native remux →
single-file playback.
