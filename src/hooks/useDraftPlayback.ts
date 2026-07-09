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
  /** Current playback position in ms (0 until a source is loaded). */
  positionMs: number;
  /** Total length of the loaded take in ms (0 until known). */
  durationMs: number;
  toggle: () => Promise<void>;
  /** Seek to an absolute position (ms), clamped to the start of the take. */
  seek: (ms: number) => Promise<void>;
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
  // expo-audio reports position/duration in seconds; expose ms to match the
  // rest of the recorder surface.
  const positionMs = Math.max(0, (playerStatus?.currentTime ?? 0) * 1000);
  const durationMs = Math.max(0, (playerStatus?.duration ?? 0) * 1000);

  const stop = useCallback(() => {
    if (playerStatus?.playing) player.pause();
  }, [player, playerStatus]);

  const seek = useCallback(
    async (ms: number) => {
      if (!source) return;
      await player.seekTo(Math.max(0, ms / 1000));
    },
    [player, source],
  );

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

  return { isPlaying, positionMs, durationMs, toggle, seek, stop };
}
