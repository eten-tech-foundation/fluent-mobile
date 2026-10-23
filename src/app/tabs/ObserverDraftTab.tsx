import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { DraftTakeRow } from '../../components/ui/DraftTakeRow';
import { usePlaybackEngine } from '../../hooks/usePlaybackEngine';
import { theme } from '../../theme';
import { UiVersionOverride } from '../../theme/useTheme';
import {
  formatCanonicalObserverDraftLabel,
  type ObserverDraftAudioCoverage,
} from './observerDraftCoverageLabel';

export type { ObserverDraftAudioCoverage };

/** Verified Observer bundle unit projection (render-only; no download/parser). */
export type ObserverDraftUnit = {
  bibleTextId: number;
  verseNumber: number;
  draftText: string | null;
  activeTakeId: number | null;
  localPlaybackUri: string | null;
  conflictStatus: 'clean' | 'conflict' | 'resolved' | null;
  /**
   * Optional coverage from a newer download wire. Absent/null = legacy unit
   * (honest anchor label). Do not invent verse bounds when missing.
   */
  coverage?: ObserverDraftAudioCoverage | null;
};

/**
 * Unresolved-conflict playback is not product-settled. Route owners must pass
 * an explicit policy; this component does not infer a server rule.
 * `undecided` never auto-plays conflict audio and uses neutral unavailable copy.
 */
export type ObserverUnresolvedConflictPlaybackPolicy =
  | 'allow'
  | 'block'
  | 'undecided';

export type ObserverDraftUnitAnchor = {
  bibleTextId: number;
  verseNumber: number;
  chapterNumber: number;
  chapterAssignmentId: string | number;
};

export type ObserverDraftTabProps = {
  units: ObserverDraftUnit[];
  chapterNumber: number;
  /**
   * Stable chapter-assignment identity. Required for scope — chapterNumber alone
   * is not unique across books/projects (both can be chapter 1).
   */
  chapterAssignmentId: string | number;
  /** Opaque account identity — any change stops/clears playback + selection. */
  accountId: string | number;
  /** Chapter/assignment access; loss hides content and clears playback. */
  hasAccess: boolean;
  /** Tab visibility; hide stops/clears playback + selection. */
  isActive: boolean;
  unresolvedConflictPlaybackPolicy: ObserverUnresolvedConflictPlaybackPolicy;
  onSelectUnit?: (anchor: ObserverDraftUnitAnchor) => void;
};

const DRAFT_TEXT_UNAVAILABLE = 'Draft text unavailable';
const DRAFT_AUDIO_UNAVAILABLE = 'Audio unavailable';

const playingVerseHighlight = `${theme.colors.primary}14`;

function hasDraftText(draftText: string | null): boolean {
  return draftText !== null && draftText.trim().length > 0;
}

/**
 * Bundle contract: missing/null conflictStatus fails closed (not playable).
 * Conflict audio only when the caller explicitly passes policy `allow`.
 */
function canPlayCanonicalAudio(
  unit: ObserverDraftUnit,
  policy: ObserverUnresolvedConflictPlaybackPolicy,
): boolean {
  if (unit.conflictStatus === null) {
    return false;
  }
  if (unit.conflictStatus === 'conflict' && policy !== 'allow') {
    return false;
  }
  return (
    unit.activeTakeId !== null &&
    unit.localPlaybackUri !== null &&
    unit.localPlaybackUri.length > 0
  );
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
  if (!canPlayCanonicalAudio(unit, policy) || unit.activeTakeId === null) {
    return null;
  }
  const uri = unit.localPlaybackUri;
  if (uri === null || unit.conflictStatus === null) {
    return null;
  }
  return {
    bibleTextId: unit.bibleTextId,
    activeTakeId: unit.activeTakeId,
    localPlaybackUri: uri,
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

/**
 * Partial #452 read-only Observer Draft tab: verse reading layout + canonical
 * take playback only. No route wiring, download, Resources, record/edit, or
 * conflict-resolution product claim.
 *
 * Legacy-pinned: this surface ships in the current app stack with Legacy verse
 * chrome; Next Observer remains a separate route.
 */
export function ObserverDraftTab({
  units,
  chapterNumber,
  chapterAssignmentId,
  accountId,
  hasAccess,
  isActive,
  unresolvedConflictPlaybackPolicy,
  onSelectUnit,
}: ObserverDraftTabProps) {
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
  /** Serialize Observer loads so an older load cannot replace newer-scope audio. */
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

  // Account / assignment / access / tab hide → clear selection + playback.
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

  const handleSelectUnit = useCallback(
    (unit: ObserverDraftUnit) => {
      if (!hasAccess || !isActive) {
        return;
      }
      setSelectedBibleTextId(unit.bibleTextId);
      onSelectUnit?.({
        bibleTextId: unit.bibleTextId,
        verseNumber: unit.verseNumber,
        chapterNumber,
        chapterAssignmentId,
      });
    },
    [chapterAssignmentId, chapterNumber, hasAccess, isActive, onSelectUnit],
  );

  const handlePlayPause = useCallback(
    async (unit: ObserverDraftUnit) => {
      if (!hasAccess || !isActive) {
        return;
      }
      if (!canPlayCanonicalAudio(unit, unresolvedConflictPlaybackPolicy)) {
        return;
      }

      const uri = unit.localPlaybackUri;
      if (uri === null || unit.activeTakeId === null) {
        return;
      }

      const identity = playbackIdentityOf(
        unit,
        unresolvedConflictPlaybackPolicy,
      );
      if (identity === null) {
        return;
      }

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

      const runLoad = async () => {
        if (generation !== playbackGenerationRef.current) {
          return;
        }
        if (!isScopeLive(startedAccountId, startedAssignmentId)) {
          return;
        }
        if (!isIdentityStillCurrent(identity)) {
          return;
        }
        try {
          await loadUri(uri);
          if (generation !== playbackGenerationRef.current) {
            return;
          }
          if (!isScopeLive(startedAccountId, startedAssignmentId)) {
            return;
          }
          if (!isIdentityStillCurrent(identity)) {
            return;
          }
          const resumeUri = activeIdentityRef.current?.localPlaybackUri ?? uri;
          await resumePlayback(undefined, resumeUri);
          if (generation !== playbackGenerationRef.current) {
            return;
          }
          if (!isScopeLive(startedAccountId, startedAssignmentId)) {
            return;
          }
          if (!isIdentityStillCurrent(identity)) {
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

  const handleSeek = useCallback(
    (unit: ObserverDraftUnit, ms: number) => {
      if (
        !hasAccess ||
        !isActive ||
        loadedBibleTextId !== unit.bibleTextId ||
        !isScopeLive(accountId, chapterAssignmentId)
      ) {
        return;
      }
      const generation = playbackGenerationRef.current;
      void seek(ms).then(() => {
        if (generation !== playbackGenerationRef.current) {
          return;
        }
        if (!isScopeLive(accountId, chapterAssignmentId)) {
          return;
        }
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

  const renderUnit = useCallback(
    ({ item }: { item: ObserverDraftUnit }) => {
      const isSelected = selectedBibleTextId === item.bibleTextId;
      const isPlaying =
        playingBibleTextId === item.bibleTextId &&
        playback.status === 'playing';
      const showLiveProgress =
        playingBibleTextId === item.bibleTextId ||
        (loadedBibleTextId === item.bibleTextId &&
          playback.status === 'paused');
      const playable = canPlayCanonicalAudio(
        item,
        unresolvedConflictPlaybackPolicy,
      );
      const takeId =
        item.activeTakeId !== null ? String(item.activeTakeId) : 'none';

      return (
        <View
          style={styles.unitBlock}
          testID={`observer-draft-unit-${item.bibleTextId}`}
        >
          <TouchableOpacity
            style={[
              styles.row,
              isSelected && styles.rowSelected,
              isPlaying && styles.rowPlaying,
            ]}
            onPress={() => handleSelectUnit(item)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Verse ${item.verseNumber}${
              isSelected ? ', selected' : ''
            }${isPlaying ? ', playing' : ''}`}
            testID={`observer-draft-verse-row-${item.verseNumber}`}
          >
            <View style={styles.iconColumn}>
              <Text
                style={[
                  styles.verseNumber,
                  isSelected && styles.verseNumberSelected,
                ]}
              >
                {item.verseNumber}
              </Text>
            </View>
            {hasDraftText(item.draftText) ? (
              <Text
                style={styles.verseText}
                testID={`observer-draft-text-${item.bibleTextId}`}
              >
                {item.draftText}
              </Text>
            ) : (
              <Text
                style={styles.unavailableText}
                testID={`observer-draft-text-unavailable-${item.bibleTextId}`}
              >
                {DRAFT_TEXT_UNAVAILABLE}
              </Text>
            )}
          </TouchableOpacity>

          {playable &&
          item.activeTakeId !== null &&
          item.localPlaybackUri !== null ? (
            <View style={styles.takeSlot}>
              <DraftTakeRow
                takeId={takeId}
                takeNumber={0}
                label={formatCanonicalObserverDraftLabel(
                  item.verseNumber,
                  item.coverage,
                )}
                isSelected={false}
                isPlaying={isPlaying}
                leadingIndicator="canonicalReadOnly"
                isCanonical
                positionMs={showLiveProgress ? playback.positionMs : 0}
                durationMs={showLiveProgress ? playback.durationMs : 0}
                onPlayPause={() => {
                  void handlePlayPause(item);
                }}
                onSeek={
                  loadedBibleTextId === item.bibleTextId
                    ? ms => {
                        handleSeek(item, ms);
                      }
                    : undefined
                }
              />
            </View>
          ) : (
            <Text
              style={styles.unavailableAudio}
              testID={`observer-draft-audio-unavailable-${item.bibleTextId}`}
            >
              {DRAFT_AUDIO_UNAVAILABLE}
            </Text>
          )}
        </View>
      );
    },
    [
      handlePlayPause,
      handleSeek,
      handleSelectUnit,
      loadedBibleTextId,
      playback.durationMs,
      playback.positionMs,
      playback.status,
      playingBibleTextId,
      selectedBibleTextId,
      unresolvedConflictPlaybackPolicy,
    ],
  );

  return (
    <UiVersionOverride value="legacy">
      <View style={styles.container} testID="observer-draft-tab">
        {hasAccess ? (
          <FlatList
            data={units}
            keyExtractor={item => String(item.bibleTextId)}
            renderItem={renderUnit}
            contentContainerStyle={styles.content}
            style={styles.list}
            showsVerticalScrollIndicator={false}
            extraData={{
              selectedBibleTextId,
              playingBibleTextId,
              loadedBibleTextId,
              playbackStatus: playback.status,
              unresolvedConflictPlaybackPolicy,
            }}
          />
        ) : (
          <View
            style={styles.accessDenied}
            testID="observer-draft-access-denied"
          />
        )}
      </View>
    </UiVersionOverride>
  );
}

/** Legacy-pinned verse reading layout (same tokens as BibleTab verse rows). */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  accessDenied: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  list: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  unitBlock: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  takeSlot: {
    paddingHorizontal: theme.spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    backgroundColor: theme.colors.background,
  },
  rowSelected: {
    borderLeftColor: theme.colors.primary,
  },
  rowPlaying: {
    backgroundColor: playingVerseHighlight,
  },
  iconColumn: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    width: 24,
  },
  verseNumber: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.mutedForeground,
  },
  verseNumberSelected: {
    color: theme.colors.primary,
  },
  verseText: {
    flex: 1,
    fontSize: theme.typography.sizes.md,
    lineHeight: theme.typography.lineHeights.normal,
    color: theme.colors.foreground,
  },
  unavailableText: {
    flex: 1,
    fontSize: theme.typography.sizes.md,
    lineHeight: theme.typography.lineHeights.normal,
    color: theme.colors.mutedForeground,
  },
  unavailableAudio: {
    paddingHorizontal: theme.spacing.lg,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
});
