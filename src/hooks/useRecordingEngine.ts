import { useEffect, useMemo, useState } from 'react';
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

async function prepareRecordingAudioMode(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
  });
}

async function releaseRecordingAudioMode(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: false,
  });
}

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
        prepareAudioMode: prepareRecordingAudioMode,
        releaseAudioMode: releaseRecordingAudioMode,
        onStatusChange: setStatus,
      }),
    [recorder],
  );

  // Dual-mount Record tab keeps this hook alive across Bible/Resources. On
  // true unmount (leave drafting), force-stop so the SharedObject release
  // isn't the only path that drops the mic.
  useEffect(() => {
    return () => {
      const current = engine.getStatus();
      if (current === 'recording' || current === 'paused') {
        void engine.stop().catch(() => {
          void releaseRecordingAudioMode();
        });
      } else {
        void releaseRecordingAudioMode();
      }
    };
  }, [engine]);

  return {
    status,
    start: () => engine.start(),
    pause: () => engine.pause(),
    resume: () => engine.resume(),
    stop: () => engine.stop(),
    requestMicPermission,
  };
}
