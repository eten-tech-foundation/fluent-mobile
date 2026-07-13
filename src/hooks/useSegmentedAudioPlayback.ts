import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import type { AudioSource } from 'expo-audio';
import { logger } from '../utils/logger';
import type { UseAudioPlaybackApi } from './useAudioPlayback';

const log = logger.create('useSegmentedAudioPlayback');

/**
 * One entry of an ordered playback manifest: a segment file plus its exact
 * duration (ms). Durations are provided by the caller (probe raw ADTS with
 * `aacDurationMs`, or read a committed take's stored `durationMs`) so this hook
 * stays pure and deterministic — it does no file IO of its own.
 */
export interface PlaybackSegment {
  uri: string;
  durationMs: number;
}

/**
 * SPIKE (#176). Plays an ordered list of audio segments as a single logical
 * stream, exposing the same {@link UseAudioPlaybackApi} as `useAudioPlayback`
 * so it is a drop-in for the Review scrub UI. It exists to evaluate whether a
 * JS-only segment manifest with global seek can replace the native ADTS→M4A
 * remux (`AacRemux`): if intra-segment ADTS seek is accurate and crossing a
 * boundary has no audible gap, we can drop the native module.
 *
 * Mechanics:
 * - `durationMs` is the sum of segment durations.
 * - `positionMs` is the cumulative offset of the active segment plus the
 *   player's position within it.
 * - `seek(globalMs)` finds the segment that contains `globalMs`, switches the
 *   active source to it, and seeks within it to `globalMs − offset`.
 * - Playback advances to the next segment when the current one finishes, and
 *   rewinds to global 0 after the last segment ends.
 *
 * A single-segment manifest degenerates to plain single-file playback.
 * `segments === null` (or empty) keeps the player idle.
 */
export function useSegmentedAudioPlayback(
  segments: PlaybackSegment[] | null,
): UseAudioPlaybackApi {
  const list = useMemo(() => segments ?? [], [segments]);

  // Prefix sums: `offsets[i]` is the global start (ms) of segment i.
  const offsets = useMemo(() => {
    const acc: number[] = [];
    let running = 0;
    for (const segment of list) {
      acc.push(running);
      running += Math.max(0, segment.durationMs);
    }
    return acc;
  }, [list]);

  const totalMs = useMemo(
    () =>
      list.reduce((sum, segment) => sum + Math.max(0, segment.durationMs), 0),
    [list],
  );

  const [activeIndex, setActiveIndex] = useState(0);

  // A seek target (seconds, local to the pending segment) to apply once the
  // player for a newly-activated segment is ready, plus whether to resume
  // playing after it lands. Both are consumed by the source-change effect.
  const pendingLocalSeekSecRef = useRef<number | null>(null);
  const autoplayAfterSwitchRef = useRef(false);

  // Clamp the active index if the manifest shrinks between renders.
  const safeIndex = activeIndex < list.length ? activeIndex : 0;
  const activeUri = list[safeIndex]?.uri ?? null;

  const playbackSource = useMemo<AudioSource>(
    () => (activeUri ? { uri: activeUri } : null),
    [activeUri],
  );
  // Match `useAudioPlayback`'s 30ms poll so the readout/fill advance smoothly.
  const player = useAudioPlayer(playbackSource, { updateInterval: 30 });
  const status = useAudioPlayerStatus(player);

  const isPlaying = status?.playing ?? false;
  const localMs = Math.max(0, (status?.currentTime ?? 0) * 1000);
  const positionMs = (offsets[safeIndex] ?? 0) + localMs;
  const durationMs = totalMs;

  // When the active segment changes, `useAudioPlayer` builds a fresh player.
  // Apply any pending local seek and resume playback if we were mid-stream.
  useEffect(() => {
    if (!activeUri) return;
    const localSec = pendingLocalSeekSecRef.current;
    const shouldPlay = autoplayAfterSwitchRef.current;
    pendingLocalSeekSecRef.current = null;
    autoplayAfterSwitchRef.current = false;

    async function applyPending() {
      try {
        if (localSec !== null) {
          await player.seekTo(localSec);
        }
        if (shouldPlay) player.play();
      } catch (error) {
        log.warn('Failed to apply pending seek after segment switch', {
          activeUri,
          error,
        });
      }
    }

    applyPending();
    // Re-run only when the player instance (i.e. the active source) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // Advance across segment boundaries: when a non-final segment finishes,
  // roll to the next one and keep playing; when the final one finishes, pause
  // and rewind to global 0 so the next tap replays the whole take.
  useEffect(() => {
    if (!status?.didJustFinish) return;
    if (safeIndex < list.length - 1) {
      pendingLocalSeekSecRef.current = 0;
      autoplayAfterSwitchRef.current = true;
      setActiveIndex(safeIndex + 1);
      return;
    }
    player.pause();
    if (safeIndex === 0) {
      player.seekTo(0).catch(error => {
        log.warn('Failed to rewind finished take', { error });
      });
    } else {
      pendingLocalSeekSecRef.current = 0;
      autoplayAfterSwitchRef.current = false;
      setActiveIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.didJustFinish]);

  const stop = useCallback(() => {
    if (status?.playing) player.pause();
  }, [player, status]);

  const seek = useCallback(
    async (ms: number) => {
      if (list.length === 0) return;
      const target = Math.min(Math.max(0, ms), Math.max(0, totalMs - 1));

      // Locate the segment containing the target global position.
      let index = 0;
      for (let i = 0; i < list.length; i += 1) {
        const start = offsets[i] ?? 0;
        const end = start + Math.max(0, list[i]!.durationMs);
        if (target >= start && target < end) {
          index = i;
          break;
        }
        index = i;
      }

      const localSec = Math.max(0, (target - (offsets[index] ?? 0)) / 1000);
      if (index === safeIndex) {
        await player.seekTo(localSec);
        return;
      }
      // Different segment: switch source, then apply the seek (and resume if we
      // were already playing) once the new player is ready.
      pendingLocalSeekSecRef.current = localSec;
      autoplayAfterSwitchRef.current = status?.playing ?? false;
      setActiveIndex(index);
    },
    [list, offsets, player, safeIndex, status, totalMs],
  );

  const toggle = useCallback(async () => {
    if (list.length === 0) return;
    if (status?.playing) {
      player.pause();
      return;
    }
    // Route playback out of the recording session (speaker, not earpiece).
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });
    player.play();
  }, [list, player, status]);

  return { isPlaying, positionMs, durationMs, toggle, seek, stop };
}
