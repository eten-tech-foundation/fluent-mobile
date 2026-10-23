import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEventListener } from 'expo';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { createPlaybackEngine } from '../audio/createPlaybackEngine';
import type { PlayerApi, PlayerStatus } from '../audio/playbackTypes';
import {
  applyNativePlaybackStatus,
  type PlaybackMirror,
} from './playbackStatusGuards';

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
  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  /**
   * Latest mirror, including the sticky `didJustFinish` bit. `load` / `play`
   * set that bit so a leftover Android finish cannot idle the next take (#298).
   * Status samples update the ref synchronously so a burst of emits in one turn
   * does not re-apply from a stale render (#569).
   */
  const mirrorRef = useRef<PlaybackMirror>({
    positionMs: 0,
    durationMs: 0,
    status: 'idle',
    didJustFinish: false,
  });

  const publishMirror = useCallback((next: PlaybackMirror) => {
    mirrorRef.current = next;
    setPositionMs(current =>
      current === next.positionMs ? current : next.positionMs,
    );
    setDurationMs(current =>
      current === next.durationMs ? current : next.durationMs,
    );
    setStatus(current => (current === next.status ? current : next.status));
  }, []);

  // Not useAudioPlayerStatus: that hook setStates on every event object, and a
  // follow-up effect setStates again. React counts those nested passive updates
  // until "Maximum update depth exceeded" (#569).
  useEventListener(player, 'playbackStatusUpdate', sample => {
    const next = applyNativePlaybackStatus(mirrorRef.current, sample);
    publishMirror(next);
    if (next.pausePlayer) {
      // After a natural finish the native player can keep its play intent, so a
      // later seekTo (waveform scrub) restarts audio while the row still shows
      // Play. Pause off this turn so the emit cannot re-enter the listener (#176).
      void Promise.resolve().then(() => {
        player.pause();
      });
    }
  });

  const onStatusChange = useCallback((next: PlayerStatus) => {
    mirrorRef.current = { ...mirrorRef.current, status: next };
    setStatus(next);
  }, []);
  const onPositionChange = useCallback((pos: number, dur: number) => {
    const durationMs = dur > 0 ? dur : mirrorRef.current.durationMs;
    mirrorRef.current = { ...mirrorRef.current, positionMs: pos, durationMs };
    setPositionMs(pos);
    if (dur > 0) {
      setDurationMs(dur);
    }
  }, []);

  const engine = useMemo(
    () =>
      createPlaybackEngine({
        player,
        prepareAudioMode: () =>
          setAudioModeAsync({
            playsInSilentMode: true,
          }),
        onStatusChange,
        onPositionChange,
      }),
    [onPositionChange, onStatusChange, player],
  );

  useEffect(() => {
    return () => {
      player.remove?.();
    };
  }, [player]);

  // Stable method identities so deps on `playback.pause` / `.play` / etc. do
  // not rebind every positionMs tick (#298 / #596). The returned object still
  // changes when status/position/duration change — callers that put the whole
  // `playback` bag in a dep list will still re-run.
  const load = useCallback(
    (uri: string) => {
      // Consume a sticky Android didJustFinish across replace so it cannot
      // re-edge to idle mid-load; the next false→true finish still fires (#298).
      mirrorRef.current = { ...mirrorRef.current, didJustFinish: true };
      return engine.load(uri);
    },
    [engine],
  );
  const play = useCallback(
    (uri: string) => {
      mirrorRef.current = { ...mirrorRef.current, didJustFinish: true };
      return engine.play(uri);
    },
    [engine],
  );
  const resume = useCallback(
    (positionMs?: number, uri?: string) => {
      // Same sticky-finish consume as load/play (#298). Resume seeks and
      // plays without going through those methods (#544).
      mirrorRef.current = { ...mirrorRef.current, didJustFinish: true };
      return engine.resume(positionMs, uri);
    },
    [engine],
  );
  const pause = useCallback(() => engine.pause(), [engine]);
  const seek = useCallback((ms: number) => engine.seek(ms), [engine]);
  const stop = useCallback(() => engine.stop(), [engine]);

  return useMemo(
    () => ({
      status,
      positionMs,
      durationMs,
      load,
      play,
      resume,
      pause,
      seek,
      stop,
    }),
    [status, positionMs, durationMs, load, play, resume, pause, seek, stop],
  );
}
