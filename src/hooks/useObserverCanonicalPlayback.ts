import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaybackEngine } from './usePlaybackEngine';
import type {
  ObserverDraftUnit,
  ObserverUnresolvedConflictPlaybackPolicy,
} from '../types/draftDownload/types';

/**
 * Why a canonical take can or cannot play. Missing/null conflictStatus fails
 * closed; conflict audio plays only when the caller explicitly passes `allow`.
 */
export type ObserverCanonicalAudioAvailability =
  | 'playable'
  | 'unknownStatus'
  | 'conflictBlocked'
  | 'conflictUndecided'
  | 'noTake'
  | 'notDownloaded';

export function canonicalAudioAvailability(
  unit: ObserverDraftUnit,
  policy: ObserverUnresolvedConflictPlaybackPolicy,
): ObserverCanonicalAudioAvailability {
  if (unit.conflictStatus === null) {
    return 'unknownStatus';
  }
  if (unit.conflictStatus === 'conflict' && policy !== 'allow') {
    return policy === 'block' ? 'conflictBlocked' : 'conflictUndecided';
  }
  if (unit.activeTakeId === null) {
    return 'noTake';
  }
  if (unit.localPlaybackUri === null || unit.localPlaybackUri.length === 0) {
    return 'notDownloaded';
  }
  return 'playable';
}

export function canPlayCanonicalAudio(
  unit: ObserverDraftUnit,
  policy: ObserverUnresolvedConflictPlaybackPolicy,
): boolean {
  return canonicalAudioAvailability(unit, policy) === 'playable';
}

type PlaybackIdentity = {
  bibleTextId: number;
  activeTakeId: number;
  localPlaybackUri: string;
  conflictStatus: NonNullable<ObserverDraftUnit['conflictStatus']>;
  policy: ObserverUnresolvedConflictPlaybackPolicy;
};

function playbackIdentityOf(
  unit: ObserverDraftUnit,
  policy: ObserverUnresolvedConflictPlaybackPolicy,
): PlaybackIdentity | null {
  if (
    !canPlayCanonicalAudio(unit, policy) ||
    unit.activeTakeId === null ||
    unit.localPlaybackUri === null ||
    unit.conflictStatus === null
  ) {
    return null;
  }
  return {
    bibleTextId: unit.bibleTextId,
    activeTakeId: unit.activeTakeId,
    localPlaybackUri: unit.localPlaybackUri,
    conflictStatus: unit.conflictStatus,
    policy,
  };
}

function identitiesEqual(
  a: PlaybackIdentity | null,
  b: PlaybackIdentity | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.bibleTextId === b.bibleTextId &&
    a.activeTakeId === b.activeTakeId &&
    a.localPlaybackUri === b.localPlaybackUri &&
    a.conflictStatus === b.conflictStatus &&
    a.policy === b.policy
  );
}

export type ObserverCanonicalPlaybackScope = {
  units: ObserverDraftUnit[];
  /**
   * Stable chapter-assignment identity. chapterNumber alone is not unique
   * across books/projects (both can be chapter 1).
   */
  chapterAssignmentId: string | number;
  /** Opaque account identity — any change stops/clears playback + selection. */
  accountId: string | number;
  /** Chapter/assignment access; loss clears playback. */
  hasAccess: boolean;
  /** Visible + focused; false stops/clears playback + selection. */
  isActive: boolean;
  unresolvedConflictPlaybackPolicy: ObserverUnresolvedConflictPlaybackPolicy;
};

export type ObserverCanonicalPlayback = {
  status: ReturnType<typeof usePlaybackEngine>['status'];
  positionMs: number;
  durationMs: number;
  selectedBibleTextId: number | null;
  playingBibleTextId: number | null;
  loadedBibleTextId: number | null;
  /** Returns false when the scope is not live (nothing selected). */
  selectUnit: (unit: ObserverDraftUnit) => boolean;
  playPause: (unit: ObserverDraftUnit) => Promise<void>;
  seekUnit: (unit: ObserverDraftUnit, ms: number) => void;
};

/**
 * Read-only canonical take playback for an Observer chapter. Playback is bound
 * to the exact take identity (bibleTextId, activeTakeId, URI, conflict status,
 * policy); an account / assignment / access / visibility change, or a changed
 * identity under an active unit, stops and clears it. Loads are serialized so
 * a late load cannot replace newer-scope audio.
 */
export function useObserverCanonicalPlayback({
  units,
  chapterAssignmentId,
  accountId,
  hasAccess,
  isActive,
  unresolvedConflictPlaybackPolicy,
}: ObserverCanonicalPlaybackScope): ObserverCanonicalPlayback {
  const playback = usePlaybackEngine();
  // Depend on stable method identities — the playback bag rebinds every tick.
  const {
    stop: stopPlayback,
    pause: pausePlayback,
    load: loadUri,
    resume: resumePlayback,
    seek,
  } = playback;
  const [selectedBibleTextId, setSelectedBibleTextId] = useState<number | null>(
    null,
  );
  const [playingBibleTextId, setPlayingBibleTextId] = useState<number | null>(
    null,
  );
  const [loadedBibleTextId, setLoadedBibleTextId] = useState<number | null>(
    null,
  );

  const playbackGenerationRef = useRef(0);
  const activeIdentityRef = useRef<PlaybackIdentity | null>(null);
  const loadChainRef = useRef(Promise.resolve());
  /** Latest render units/policy — validate pending loads even when UI ids are null. */
  const unitsRef = useRef(units);
  const policyRef = useRef(unresolvedConflictPlaybackPolicy);
  unitsRef.current = units;
  policyRef.current = unresolvedConflictPlaybackPolicy;
  const scopeRef = useRef({
    accountId,
    chapterAssignmentId,
    hasAccess,
    isActive,
  });
  scopeRef.current = {
    accountId,
    chapterAssignmentId,
    hasAccess,
    isActive,
  };

  const latestIdentityFor = useCallback((bibleTextId: number) => {
    const unit = unitsRef.current.find(u => u.bibleTextId === bibleTextId);
    if (unit === undefined) {
      return null;
    }
    return playbackIdentityOf(unit, policyRef.current);
  }, []);

  /**
   * Queue stop on the load chain and skip engine.stop when a newer generation
   * already claimed the player — a late stop must not idle a newer unit.
   */
  const enqueueStopBarrier = useCallback(
    (generation: number) => {
      const barrier = async () => {
        if (generation !== playbackGenerationRef.current) {
          return;
        }
        try {
          await stopPlayback();
        } catch {
          // Native unmount / aborted stop must not surface as unhandled rejection.
        }
      };
      loadChainRef.current = loadChainRef.current.then(barrier, barrier);
    },
    [stopPlayback],
  );

  const clearSelectionAndPlayback = useCallback(() => {
    const generation = ++playbackGenerationRef.current;
    activeIdentityRef.current = null;
    setSelectedBibleTextId(null);
    setPlayingBibleTextId(null);
    setLoadedBibleTextId(null);
    enqueueStopBarrier(generation);
  }, [enqueueStopBarrier]);

  const clearPlaybackOnly = useCallback(() => {
    const generation = ++playbackGenerationRef.current;
    activeIdentityRef.current = null;
    setPlayingBibleTextId(null);
    setLoadedBibleTextId(null);
    enqueueStopBarrier(generation);
  }, [enqueueStopBarrier]);

  useEffect(() => {
    clearSelectionAndPlayback();
  }, [
    accountId,
    chapterAssignmentId,
    hasAccess,
    isActive,
    clearSelectionAndPlayback,
  ]);

  useEffect(() => {
    return () => {
      activeIdentityRef.current = null;
      playbackGenerationRef.current += 1;
      enqueueStopBarrier(playbackGenerationRef.current);
    };
  }, [enqueueStopBarrier]);

  // Canonical URI / take / conflict eligibility / explicit policy change while
  // a unit is active OR a load is pending → stop (do not resume under a new identity).
  useEffect(() => {
    const pendingIdentity = activeIdentityRef.current;
    if (
      pendingIdentity === null &&
      playingBibleTextId === null &&
      loadedBibleTextId === null
    ) {
      return;
    }
    const activeId =
      pendingIdentity?.bibleTextId ?? playingBibleTextId ?? loadedBibleTextId;
    if (activeId === null) {
      return;
    }
    const nextIdentity = latestIdentityFor(activeId);
    if (!identitiesEqual(pendingIdentity, nextIdentity)) {
      clearPlaybackOnly();
    }
  }, [
    units,
    unresolvedConflictPlaybackPolicy,
    playingBibleTextId,
    loadedBibleTextId,
    latestIdentityFor,
    clearPlaybackOnly,
  ]);

  const isScopeLive = useCallback(
    (
      startedAccountId: string | number,
      startedAssignmentId: string | number,
    ) => {
      const scope = scopeRef.current;
      return (
        scope.hasAccess &&
        scope.isActive &&
        scope.accountId === startedAccountId &&
        scope.chapterAssignmentId === startedAssignmentId
      );
    },
    [],
  );

  const isIdentityStillCurrent = useCallback(
    (expected: PlaybackIdentity) => {
      const latest = latestIdentityFor(expected.bibleTextId);
      return (
        identitiesEqual(expected, latest) &&
        identitiesEqual(activeIdentityRef.current, latest)
      );
    },
    [latestIdentityFor],
  );

  const selectUnit = useCallback(
    (unit: ObserverDraftUnit) => {
      if (!hasAccess || !isActive) {
        return false;
      }
      setSelectedBibleTextId(unit.bibleTextId);
      return true;
    },
    [hasAccess, isActive],
  );

  const playPause = useCallback(
    async (unit: ObserverDraftUnit) => {
      if (!hasAccess || !isActive) {
        return;
      }
      const identity = playbackIdentityOf(
        unit,
        unresolvedConflictPlaybackPolicy,
      );
      if (identity === null) {
        return;
      }
      const uri = identity.localPlaybackUri;

      const isThisPlaying =
        playingBibleTextId === unit.bibleTextId &&
        playback.status === 'playing';
      if (isThisPlaying) {
        const generation = playbackGenerationRef.current;
        const startedAccountId = accountId;
        const startedAssignmentId = chapterAssignmentId;
        await pausePlayback();
        if (generation !== playbackGenerationRef.current) {
          return;
        }
        if (!isScopeLive(startedAccountId, startedAssignmentId)) {
          // Scope already cleared via effect; do not stop a newer unit.
          return;
        }
        setPlayingBibleTextId(null);
        return;
      }

      const generation = ++playbackGenerationRef.current;
      const startedAccountId = accountId;
      const startedAssignmentId = chapterAssignmentId;
      activeIdentityRef.current = identity;

      const stillCurrent = () =>
        generation === playbackGenerationRef.current &&
        isScopeLive(startedAccountId, startedAssignmentId) &&
        isIdentityStillCurrent(identity);

      const runLoad = async () => {
        if (!stillCurrent()) {
          return;
        }
        try {
          await loadUri(uri);
          if (!stillCurrent()) {
            return;
          }
          const resumeUri = activeIdentityRef.current?.localPlaybackUri ?? uri;
          await resumePlayback(undefined, resumeUri);
          if (!stillCurrent()) {
            return;
          }
          setPlayingBibleTextId(unit.bibleTextId);
          setLoadedBibleTextId(unit.bibleTextId);
        } catch {
          if (generation !== playbackGenerationRef.current) {
            return;
          }
          if (activeIdentityRef.current?.bibleTextId === unit.bibleTextId) {
            activeIdentityRef.current = null;
          }
          setPlayingBibleTextId(null);
          setLoadedBibleTextId(null);
        }
      };

      const queued = loadChainRef.current.then(runLoad, runLoad);
      loadChainRef.current = queued.then(
        () => undefined,
        () => undefined,
      );
      try {
        await queued;
      } catch {
        // Chain catches above; never leave an unhandled rejection to the host.
      }
    },
    [
      accountId,
      chapterAssignmentId,
      hasAccess,
      isActive,
      isIdentityStillCurrent,
      isScopeLive,
      loadUri,
      pausePlayback,
      playback.status,
      playingBibleTextId,
      resumePlayback,
      unresolvedConflictPlaybackPolicy,
    ],
  );

  const seekUnit = useCallback(
    (unit: ObserverDraftUnit, ms: number) => {
      if (
        !hasAccess ||
        !isActive ||
        loadedBibleTextId !== unit.bibleTextId ||
        !isScopeLive(accountId, chapterAssignmentId)
      ) {
        return;
      }
      void seek(ms).catch(() => {
        // A seek on a torn-down player is a no-op for the reader.
      });
    },
    [
      accountId,
      chapterAssignmentId,
      hasAccess,
      isActive,
      isScopeLive,
      loadedBibleTextId,
      seek,
    ],
  );

  return {
    status: playback.status,
    positionMs: playback.positionMs,
    durationMs: playback.durationMs,
    selectedBibleTextId,
    playingBibleTextId,
    loadedBibleTextId,
    selectUnit,
    playPause,
    seekUnit,
  };
}
