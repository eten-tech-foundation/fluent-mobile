import { useCallback, useEffect, useMemo } from 'react';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import type { AudioSource } from 'expo-audio';
import { logger } from '../utils/logger';

const log = logger.create('useDraftPlayback');

export interface UseDraftPlaybackApi {
  isPlaying: boolean;
  toggle: () => Promise<void>;
  stop: () => void;
}

/**
 * Owns playback of a recorded draft take. This hook is intentionally decoupled
 * from the recorder state machine: it only needs the take's file URI, so it can
 * be tested and reused independently of recording.
 *
 * Audio-session ownership is split by concern — this hook owns the *playback*
 * side (`allowsRecording: false`, routing through the speaker rather than the
 * earpiece used while capturing); the recorder owns the recording side. Callers
 * that transition back into recording must re-assert the recording audio mode.
 *
 * `source === null` keeps the player idle when there is no draft to review.
 */
export function useDraftPlayback(source: string | null): UseDraftPlaybackApi {
  // Recreate the player whenever the reviewed take changes; `useAudioPlayer`
  // releases the previous instance for us.
  const playbackSource = useMemo<AudioSource>(
    () => (source ? { uri: source } : null),
    [source],
  );
  const player = useAudioPlayer(playbackSource);
  const playerStatus = useAudioPlayerStatus(player);
  const isPlaying = playerStatus?.playing ?? false;

  const stop = useCallback(() => {
    if (playerStatus?.playing) player.pause();
  }, [player, playerStatus]);

  const toggle = useCallback(async () => {
    if (!source) return;
    if (playerStatus?.playing) {
      player.pause();
      return;
    }
    // Route playback out of the recording session so it plays through the
    // speaker rather than the earpiece used while capturing.
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });
    player.play();
  }, [player, playerStatus, source]);

  // Rewind to the start once a take finishes so the next tap replays it whole.
  useEffect(() => {
    if (playerStatus?.didJustFinish) {
      player.seekTo(0).catch(error => {
        log.warn('Failed to rewind finished playback', { error });
      });
    }
  }, [player, playerStatus?.didJustFinish]);

  return { isPlaying, toggle, stop };
}
