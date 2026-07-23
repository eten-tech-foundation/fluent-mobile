import { useEffect, useMemo, useState } from 'react';
import {
  createAudioPlayer,
  setAudioModeAsync,
  useAudioPlayerStatus,
} from 'expo-audio';
import { createPlaybackEngine } from '../audio/createPlaybackEngine';
import type { PlayerApi, PlayerStatus } from '../audio/playbackTypes';

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

  useEffect(() => {
    setPositionMs(Math.max(0, Math.round(nativeStatus.currentTime * 1000)));
    const nextDuration = Math.max(0, Math.round(nativeStatus.duration * 1000));
    if (nextDuration > 0) {
      setDurationMs(nextDuration);
    }

    if (nativeStatus.didJustFinish) {
      setStatus('idle');
      return;
    }
    // Don't let a late status tick override an explicit engine pause.
    if (nativeStatus.playing && status !== 'paused') {
      setStatus('playing');
    }
    // Do not map !playing → paused here. After `replace`, the player is briefly
    // unloaded/not playing; flipping to paused races PLAYBACK_END and freezes
    // the take UI at 0:00. Explicit pause/stop go through the engine.
  }, [
    nativeStatus.currentTime,
    nativeStatus.duration,
    nativeStatus.playing,
    nativeStatus.didJustFinish,
    status,
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
    play: uri => engine.play(uri),
    pause: () => engine.pause(),
    seek: ms => engine.seek(ms),
    stop: () => engine.stop(),
  };
}
