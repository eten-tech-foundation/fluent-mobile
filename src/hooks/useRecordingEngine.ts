import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { createRecordingEngine } from '../audio/createRecordingEngine';
import { requestMicPermission } from '../audio/micPermission';
import { handleRecordingAppStateChange } from '../audio/recordingAppState';
import type { RecorderApi, RecorderStatus } from '../audio/types';

export type UseRecordingEngineApi = RecorderApi & {
  requestMicPermission: typeof requestMicPermission;
};

export type UseRecordingEngineOptions = {
  /**
   * Auto-pause on background (#567). When supplied, the host runs its own pause
   * path instead of the engine pausing itself, so the paused-take marker and
   * the reducer state are updated together. Omit to pause the engine directly.
   */
  onAutoPause?: () => void;
};

const KILL_SAFE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  directory: 'document',
  extension: '.aac',
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    extension: '.aac',
    outputFormat: 'aac_adts',
    audioEncoder: 'aac',
  },
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
export function useRecordingEngine({
  onAutoPause,
}: UseRecordingEngineOptions = {}): UseRecordingEngineApi {
  const recorder = useAudioRecorder(KILL_SAFE_RECORDING_OPTIONS);
  const [status, setStatus] = useState<RecorderStatus>('idle');
  /**
   * Latest-value ref so the AppState subscription below never re-subscribes
   * when the host's callback identity changes each render.
   */
  const onAutoPauseRef = useRef(onAutoPause);
  onAutoPauseRef.current = onAutoPause;
  const hostOwnsAutoPause = onAutoPause !== undefined;

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

  // Background while recording auto-pauses (#567, #49). With `onAutoPause` the
  // host's pause path runs (marker write + reducer), so background and the
  // Pause button cannot diverge. Returning to active re-syncs the native paused
  // state: expo-audio's Android module can resume paused recorders when the
  // activity returns to foreground (#486). Policy lives in recordingAppState so
  // it can be unit-tested without rendering the hook.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      handleRecordingAppStateChange(
        engine,
        nextState,
        hostOwnsAutoPause ? () => onAutoPauseRef.current?.() : undefined,
      );
    });
    return () => subscription.remove();
  }, [engine, hostOwnsAutoPause]);

  return {
    status,
    start: () => engine.start(),
    pause: () => engine.pause(),
    resume: () => engine.resume(),
    stop: () => engine.stop(),
    requestMicPermission,
  };
}
