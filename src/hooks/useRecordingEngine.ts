import { useMemo, useState } from 'react';
import {
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { createRecordingEngine } from '../audio/createRecordingEngine';
import { requestMicPermission } from '../audio/micPermission';
import type { RecorderApi, RecorderStatus } from '../audio/types';

export type UseRecordingEngineApi = RecorderApi & {
  requestMicPermission: typeof requestMicPermission;
};

/**
 * React wrapper around the #95 recording engine.
 * Mic denial is returned from `requestMicPermission` — screens own UX.
 */
export function useRecordingEngine(): UseRecordingEngineApi {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [status, setStatus] = useState<RecorderStatus>('idle');

  const engine = useMemo(
    () =>
      createRecordingEngine({
        recorder,
        prepareAudioMode: () =>
          setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: true,
          }),
        onStatusChange: setStatus,
      }),
    [recorder],
  );

  return {
    status,
    start: () => engine.start(),
    pause: () => engine.pause(),
    resume: () => engine.resume(),
    stop: () => engine.stop(),
    requestMicPermission,
  };
}
