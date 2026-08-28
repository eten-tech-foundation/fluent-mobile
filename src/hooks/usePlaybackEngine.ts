import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createAudioPlayer,
  setAudioModeAsync,
  useAudioPlayerStatus,
} from 'expo-audio';
import { createPlaybackEngine } from '../audio/createPlaybackEngine';
import type { PlayerApi, PlayerStatus } from '../audio/playbackTypes';
import { didJustFinishEdge } from './playbackStatusGuards';

export type UsePlaybackEngineApi = PlayerApi;

/**
 * React wrapper around the #96 playback engine.
 * Position/duration refresh from expo-audio status updates (updateInterval).
 */
export function usePlaybackEngine(): UsePlaybackEngineApi {
  // 100ms keeps take-row progress / time labels moving during review play.
  const player = useMemo(
    () => createAudioPlayer(null, { updateInterval: 100 }),
    [],
  );
  const nativeStatus = useAudioPlayerStatus(player);
  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  /**
   * Android may leave `didJustFinish: true` in the last `useEvent` payload
   * until the next status emit (periodic updates stop when not playing). Treat
   * finish as an edge so a sticky flag cannot keep forcing `idle` across a
   * take `replace` / play (#298).
   */
  const prevDidJustFinishRef = useRef(false);

  const engine = useMemo(
    () =>
      createPlaybackEngine({
        player,
        prepareAudioMode: () =>
          setAudioModeAsync({
            playsInSilentMode: true,
          }),
        onStatusChange: setStatus,
        onPositionChange: (pos, dur) => {
          setPositionMs(pos);
          setDurationMs(dur);
        },
      }),
    [player],
  );

  // The pause guard reads `status` through the updater instead of the dependency
  // list: an effect that both writes and depends on its own state re-runs on
  // every update it makes.
  useEffect(() => {
    setPositionMs(Math.max(0, Math.round(nativeStatus.currentTime * 1000)));
    const nextDuration = Math.max(0, Math.round(nativeStatus.duration * 1000));
    if (nextDuration > 0) {
      setDurationMs(nextDuration);
    }

    const didJustFinish = Boolean(nativeStatus.didJustFinish);
    const finishEdge = didJustFinishEdge(
      prevDidJustFinishRef.current,
      didJustFinish,
    );
    prevDidJustFinishRef.current = didJustFinish;

    if (finishEdge) {
      setStatus('idle');
      return;
    }
    // Don't let a late status tick override an explicit engine pause.
    if (nativeStatus.playing) {
      setStatus(prev => (prev === 'paused' ? prev : 'playing'));
    }
    // Do not map !playing → paused here. After `replace`, the player is briefly
    // unloaded/not playing; flipping to paused races PLAYBACK_END and freezes
    // the take UI at 0:00. Explicit pause/stop go through the engine.
  }, [
    nativeStatus.currentTime,
    nativeStatus.duration,
    nativeStatus.playing,
    nativeStatus.didJustFinish,
  ]);

  useEffect(() => {
    return () => {
      player.remove?.();
    };
  }, [player]);

  return {
    status,
    positionMs,
    durationMs,
    load: uri => {
      // Consume a sticky Android didJustFinish across replace so it cannot
      // re-edge to idle mid-load; the next false→true finish still fires (#298).
      prevDidJustFinishRef.current = true;
      return engine.load(uri);
    },
    play: uri => {
      prevDidJustFinishRef.current = true;
      return engine.play(uri);
    },
    pause: () => engine.pause(),
    seek: ms => engine.seek(ms),
    stop: () => engine.stop(),
  };
}
