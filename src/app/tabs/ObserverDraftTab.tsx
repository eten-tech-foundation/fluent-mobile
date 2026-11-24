import React, { useCallback } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { DraftTakeRow } from '../../components/ui/DraftTakeRow';
import {
  canPlayCanonicalAudio,
  useObserverCanonicalPlayback,
} from '../../hooks/useObserverCanonicalPlayback';
import { theme } from '../../theme';
import type {
  ObserverDraftUnit,
  ObserverDraftUnitAnchor,
  ObserverUnresolvedConflictPlaybackPolicy,
} from '../../types/draftDownload/types';

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

function canonicalDraftLabel(verseNumber: number): string {
  // Explicit label — never invent a take ordinal for Observer read-only.
  return `Canonical draft - Verse - v. ${verseNumber}`;
}

function hasDraftText(draftText: string | null): boolean {
  return draftText !== null && draftText.trim().length > 0;
}

/**
 * Legacy read-only Observer Draft tab: verse reading layout + canonical
 * take playback only. Rendered by the Legacy Observer screen; Next renders
 * `src/app/v2/screens/ObserverScreen.tsx` on the same route.
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
  const playback = useObserverCanonicalPlayback({
    units,
    chapterAssignmentId,
    accountId,
    hasAccess,
    isActive,
    unresolvedConflictPlaybackPolicy,
  });
  const {
    selectedBibleTextId,
    playingBibleTextId,
    loadedBibleTextId,
    selectUnit,
    playPause: handlePlayPause,
    seekUnit: handleSeek,
  } = playback;

  const handleSelectUnit = useCallback(
    (unit: ObserverDraftUnit) => {
      if (!selectUnit(unit)) {
        return;
      }
      onSelectUnit?.({
        bibleTextId: unit.bibleTextId,
        verseNumber: unit.verseNumber,
        chapterNumber,
        chapterAssignmentId,
      });
    },
    [chapterAssignmentId, chapterNumber, onSelectUnit, selectUnit],
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
                label={canonicalDraftLabel(item.verseNumber)}
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
