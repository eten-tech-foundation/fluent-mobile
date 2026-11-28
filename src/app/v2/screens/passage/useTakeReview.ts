import { useCallback, useEffect, useRef, useState } from 'react';
import { TAKE_REVIEW_YOU } from '../../../../constants/messages';
import type { useVerseAudio } from '../../../../hooks/useVerseAudio';
import type { RecordingWithOwner } from '../../../../types/db/types';
import { fileExists, fileSize } from '../../../../utils/audioStorage';
import { formatTakeSubtitle } from '../../../../utils/takeSubtitle';

type VerseAudio = ReturnType<typeof useVerseAudio>;

/** The player, as review uses it: play, pause and seek only. */
export type ReviewAudio = Pick<
  VerseAudio,
  | 'allTakes'
  | 'hasMultipleRecorders'
  | 'playingTakeId'
  | 'loadedTakeId'
  | 'state'
  | 'playbackStatus'
  | 'positionMs'
  | 'durationMs'
  | 'playTake'
  | 'pausePlayback'
  | 'seek'
  | 'stopPlayback'
  | 'errorMessage'
> & {
  /** The account, chapter and verse or passage the takes are for. */
  scope: string;
};

export interface ReviewTake {
  id: string;
  /** e.g. "Take 2 - Pericope - vv. 22-25". */
  label: string;
  official: boolean;
  durationMs: number;
  playing: boolean;
  /** 0–1 through the take, only while it's the one in the player. */
  progress: number;
  /** Its audio isn't on this phone; Play checks again. */
  missing: boolean;
  /** The player couldn't play it. */
  failed: boolean;
  onPlayPause: () => void;
  onSeek: (progress: number) => void;
}

export interface ReviewOwner {
  key: string;
  name: string;
  takes: ReviewTake[];
}

/**
 * Everyone's takes for the passage or verse Record is on, grouped by who
 * recorded them. Review plays and seeks the
 * tapped take only; it never selects, deletes or makes a take official.
 * Playback it started stops when it closes, the scope changes, or the take
 * is no longer one this account may see, and a play or seek that lands after
 * any of those is dropped.
 */
export function useTakeReview({
  audio,
  userId,
  open,
}: {
  audio: ReviewAudio;
  userId: number | null;
  open: boolean;
}) {
  const { scope, allTakes } = audio;
  const live = useRef({ scope, open });
  live.current = { scope, open };
  const audioRef = useRef(audio);
  audioRef.current = audio;
  /** The take review put in the player, so it stops only its own. */
  const started = useRef<string | null>(null);
  /** The take review is loading, until the player's call returns. */
  const loading = useRef<string | null>(null);

  // Rows found without audio, or that failed to play, until review reopens.
  const [missing, setMissing] = useState<{
    scope: string;
    ids: ReadonlySet<string>;
  }>({ scope, ids: new Set() });
  const missingIds = missing.scope === scope ? missing.ids : new Set<string>();
  const [failed, setFailed] = useState<{ scope: string; id: string } | null>(
    null,
  );
  const failedId = failed?.scope === scope ? failed.id : null;
  /** Bumped on each open, so a tap from before a reopen is dropped. */
  const session = useRef(0);
  useEffect(() => {
    if (!open) return;
    session.current += 1;
    setMissing({ scope: live.current.scope, ids: new Set() });
    setFailed(null);
  }, [open]);
  /** The tap still counts: same opening, scope, and the take still here. */
  const current = useCallback(
    (take: RecordingWithOwner, asked: { scope: string; session: number }) =>
      live.current.open &&
      live.current.scope === asked.scope &&
      session.current === asked.session &&
      audioRef.current.allTakes.some(t => t.id === take.id),
    [],
  );
  const { errorMessage } = audio;
  useEffect(() => {
    const id = started.current;
    if (!errorMessage || id === null) return;
    const { playingTakeId, loadedTakeId } = audioRef.current;
    // Only an error from review's own load or take, not e.g. a pause.
    if (loading.current === id || playingTakeId === id || loadedTakeId === id) {
      setFailed({ scope: live.current.scope, id });
    }
  }, [errorMessage]);

  const stopOwn = useCallback(() => {
    const id = started.current;
    const inFlight = loading.current;
    started.current = null;
    loading.current = null;
    if (id === null && inFlight === null) return;
    const { playingTakeId, loadedTakeId, stopPlayback } = audioRef.current;
    // A load still running goes stale on the stop, so it can't start later.
    if (inFlight !== null || playingTakeId === id || loadedTakeId === id) {
      void stopPlayback();
    }
  }, []);

  useEffect(() => {
    if (!open) stopOwn();
  }, [open, stopOwn]);
  useEffect(() => stopOwn, [scope, stopOwn]);
  useEffect(() => {
    const id = loading.current ?? started.current;
    if (id !== null && !allTakes.some(t => t.id === id)) stopOwn();
  }, [allTakes, stopOwn]);

  /** Resolves once its audio is known to be here, still for this scope. */
  const ready = useCallback(
    async (
      take: RecordingWithOwner,
      asked: { scope: string; session: number },
    ): Promise<boolean> => {
      const path = take.localFilePath;
      const here =
        path !== '' &&
        (await fileExists(path)) &&
        ((await fileSize(path)) ?? 0) > 0;
      if (!current(take, asked)) return false;
      setMissing(prev => {
        const ids = new Set(prev.scope === asked.scope ? prev.ids : []);
        if (here) ids.delete(take.id);
        else ids.add(take.id);
        return { scope: asked.scope, ids };
      });
      return here;
    },
    [current],
  );
  const ask = useCallback(
    () => ({ scope: live.current.scope, session: session.current }),
    [],
  );

  /** Puts the take in the player as review's own, until its call returns. */
  const load = useCallback(
    async (
      take: RecordingWithOwner,
      run: (now: ReviewAudio) => Promise<void>,
    ) => {
      started.current = take.id;
      loading.current = take.id;
      setFailed(null);
      try {
        await run(audioRef.current);
      } finally {
        if (loading.current === take.id) loading.current = null;
      }
    },
    [],
  );

  const playPause = useCallback(
    async (take: RecordingWithOwner) => {
      const now = audioRef.current;
      if (now.playingTakeId === take.id && now.state === 'playing') {
        await now.pausePlayback();
        return;
      }
      if (!(await ready(take, ask()))) return;
      await load(take, a => a.playTake(take));
    },
    [ready, load, ask],
  );

  const seek = useCallback(
    async (take: RecordingWithOwner, progress: number) => {
      const length = durationOf(take, audioRef.current);
      if (length <= 0) return;
      const asked = ask();
      if (!(await ready(take, asked))) return;
      const now = audioRef.current;
      // Another take keeps its spot; this one loads paused where tapped.
      if (now.state === 'playing' && now.playingTakeId !== take.id) {
        await now.pausePlayback();
      }
      if (!current(take, asked)) return;
      await load(take, a => a.seek(Math.round(progress * length), take));
    },
    [ready, load, ask, current],
  );

  const owners: ReviewOwner[] = [];
  for (const take of allTakes) {
    const ownerId = take.recordedByUserId ?? null;
    const key = ownerId === null ? 'unassigned' : String(ownerId);
    let owner = owners[owners.length - 1];
    if (!owner || owner.key !== key) {
      owner = {
        key,
        name:
          ownerId !== null && ownerId === userId
            ? `${take.ownerDisplayName} ${TAKE_REVIEW_YOU}`
            : take.ownerDisplayName,
        takes: [],
      };
      owners.push(owner);
    }
    const inPlayer =
      audio.playingTakeId === take.id ||
      (audio.loadedTakeId === take.id && audio.playbackStatus === 'paused');
    const length = durationOf(take, inPlayer ? audio : null);
    owner.takes.push({
      id: take.id,
      label: formatTakeSubtitle(take),
      official: take.isCanonical,
      durationMs: length,
      playing: audio.playingTakeId === take.id && audio.state === 'playing',
      progress:
        inPlayer && length > 0 ? Math.min(1, audio.positionMs / length) : 0,
      missing: missingIds.has(take.id),
      failed: failedId === take.id,
      onPlayPause: () => void playPause(take),
      onSeek: p => void seek(take, p),
    });
  }

  return {
    /** Another account has takes here, so there's more than the fan. */
    available: audio.hasMultipleRecorders,
    owners,
  };
}

/** The player's length once it has this take, else the take's own. */
function durationOf(
  take: RecordingWithOwner,
  player: Pick<
    ReviewAudio,
    'durationMs' | 'loadedTakeId' | 'playingTakeId'
  > | null,
) {
  const has =
    player !== null &&
    (player.loadedTakeId === take.id || player.playingTakeId === take.id);
  if (has && player.durationMs > 0) return player.durationMs;
  return take.durationMs ?? 0;
}
