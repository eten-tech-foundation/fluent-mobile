# Waveform decision

How the record/review waveform is rendered in Fluent Mobile, and why. Refs GitHub [#96](https://github.com/eten-tech-foundation/fluent-mobile/issues/96).

## Decision

Render the waveform in React from `expo-audio` data. **Do not** add a third-party waveform native module.

- **Rejected:** [`@simform_solutions/react-native-audio-waveform`](https://github.com/SimformSolutionsPvtLtd/react-native-audio-waveform) (see [PR #82](https://github.com/eten-tech-foundation/fluent-mobile/pull/82)) — a bare-RN native module that complicates CNG prebuild / EAS builds and couples playback to a widget via imperative refs. Disproportionate for a level/progress visualization.
- Any future third-party waveform must be Expo config-plugin compatible.

## Approach

| State | Source | Component |
| ----- | ------ | --------- |
| Live recording | `expo-audio` recorder **metering** (`isMeteringEnabled`), sampled on the recorder tick and normalized to `0..1` | `RecordingWaveform` (recording/paused) |
| Review playback | position-driven progress fill from `positionMs` / `durationMs` | `RecordingWaveform` (review) — delivered in [#176](https://github.com/eten-tech-foundation/fluent-mobile/issues/176) |

This is a **component + hook** change, not a native module — unlike the seekable-remux work in #176, waveform rendering needs no platform APIs.

## Where it lives

- `src/hooks/useRecorder.ts` — `dbfsToLevel()` (dBFS -> `0..1`, floor `-60 dB`); enables `isMeteringEnabled` and samples `recorder.getStatus().metering` on the tick into a bounded `meteringLevels` buffer (newest last, reset on new take, frozen on pause).
- `src/app/tabs/drafting/record/components/RecordingWaveform.tsx` — renders live bars from the `levels` prop.

## Notes

- The live buffer length matches the bar count (`METERING_SAMPLE_CAP` = `LIVE_WAVEFORM_BARS`), so one sample maps to one bar and the row scrolls right as audio comes in.
- Metering is a single level per poll (not a full amplitude array); bars visualize input loudness over time, not an offline sample-accurate waveform.
