import { useCallback, useState } from 'react';
import type { MicPermissionResult } from '../audio/types';
import type { CommentRecordingState } from '../components/comments/types';
import { logger } from '../utils/logger';
import { useRecordingEngine } from './useRecordingEngine';

const log = logger.create('CommentRecordingAdapter');

export type UseCommentRecordingAdapterApi = CommentRecordingState & {
  onRecordStart: () => void;
  onRecordStop: () => void;
  /** Clears the provisional clip after a successful send (parent-owned). */
  clearRecordedAudio: () => void;
  /**
   * Latest mic permission result from `onRecordStart`. Parents own denial UX
   * (`useRecordingEngine` contract); adapter does not toast/alert.
   */
  micPermission: MicPermissionResult | null;
};

/**
 * Thin #451 adapter over the shared recording engine.
 * Surfaces only the CommentComposer-controlled fields — no verse-take markers,
 * no upload, no comment-audio endpoint invent (await API owner).
 */
export function useCommentRecordingAdapter(): UseCommentRecordingAdapterApi {
  const recording = useRecordingEngine();
  const [recordedAudioUri, setRecordedAudioUri] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<MicPermissionResult | null>(
    null,
  );

  const isRecording =
    recording.status === 'recording' || recording.status === 'paused';

  const onRecordStart = useCallback(() => {
    void (async () => {
      try {
        const permission = await recording.requestMicPermission();
        setMicPermission(permission);
        if (permission !== 'granted') {
          log.warn('Comment mic permission not granted', { permission });
          return;
        }
        setRecordedAudioUri(null);
        await recording.start();
      } catch (error) {
        log.error('Comment record start failed', { error });
      }
    })();
  }, [recording]);

  const onRecordStop = useCallback(() => {
    void (async () => {
      try {
        const result = await recording.stop();
        setRecordedAudioUri(result.uri);
      } catch (error) {
        log.error('Comment record stop failed', { error });
        setRecordedAudioUri(null);
      }
    })();
  }, [recording]);

  const clearRecordedAudio = useCallback(() => {
    setRecordedAudioUri(null);
  }, []);

  return {
    isRecording,
    recordedAudioUri,
    onRecordStart,
    onRecordStop,
    clearRecordedAudio,
    micPermission,
  };
}
