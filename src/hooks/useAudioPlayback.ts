import { useCallback, useEffect, useMemo } from 'react';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import type { AudioSource } from 'expo-audio';
import { logger } from '../utils/logger';

const log = logger.create('useAudioPlayback');

export interface UseAudioPlaybackApi {
  isPlaying: boolean;
  /** Current playback position in ms (0 until a source is loaded). */
  positionMs: number;
  /** Total length of the loaded audio in ms (0 until known). */
  durationMs: number;
  toggle: () => Promise<void>;
  /** Seek to an absolute position (ms), clamped to the start of the audio. */
  seek: (ms: number) => Promise<void>;
  stop: () => void;
}

/**
 * Generic single-source audio playback: given a file/remote URI it exposes
 * play/pause, seek, and position/duration state. It knows nothing about what it
 * is playing, so it can back draft-take review today and source-audio (e.g.
 * original verse recordings) or any other single-clip playback later.
 *
 * Audio-session ownership is split by concern — this hook owns the *playback*
 * side (`allowsRecording: false`, routing through the speaker rather than the
 * earpiece used while capturing); any recorder owns the recording side. Callers
 * that transition back into recording must re-assert the recording audio mode.
 *
 * `source === null` keeps the player idle when there is nothing to play.
 */
export function useAudioPlayback(source: string | null): UseAudioPlaybackApi {
  // Recreate the player whenever the source changes; `useAudioPlayer`
  // releases the previous instance for us.
  const playbackSource = useMemo<AudioSource>(
    () => (source ? { uri: source } : null),
    [source],
  );
  // Poll status every 30ms so the review position readout and waveform fill
  // update smoothly; the default (~500ms) makes the label visibly step.
  const player = useAudioPlayer(playbackSource, { updateInterval: 30 });
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

  // Pause and rewind to the start once playback finishes so the next tap
  // replays it whole. Pausing first matters on Android: ExoPlayer leaves
  // `playWhenReady` true when a track ends naturally, so seeking back to 0
  // without pausing resumes playback immediately instead of stopping.
  useEffect(() => {
    if (playerStatus?.didJustFinish) {
      player.pause();
      player.seekTo(0).catch(error => {
        log.warn('Failed to rewind finished playback', { error });
      });
    }
  }, [player, playerStatus?.didJustFinish]);

  return { isPlaying, positionMs, durationMs, toggle, seek, stop };
}
