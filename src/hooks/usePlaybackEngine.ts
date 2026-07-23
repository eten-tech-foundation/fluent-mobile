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
 * Position/duration refresh from expo-audio status polling.
 */
export function usePlaybackEngine(): UsePlaybackEngineApi {
  const player = useMemo(() => createAudioPlayer(null), []);
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
    setDurationMs(Math.max(0, Math.round(nativeStatus.duration * 1000)));
    if (nativeStatus.playing) {
      setStatus('playing');
    } else if (status === 'playing' && nativeStatus.isLoaded) {
      setStatus('paused');
    }
  }, [
    nativeStatus.currentTime,
    nativeStatus.duration,
    nativeStatus.playing,
    nativeStatus.isLoaded,
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
