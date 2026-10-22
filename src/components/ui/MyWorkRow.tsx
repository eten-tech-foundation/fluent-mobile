import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDraftDownload } from '../../hooks/useDraftDownload';
import { MyWorkChapter } from '../../types/db/types';
import {
  buildMyWorkDraftDownloadRequest,
  getValidatedMyWorkDownloadUserId,
} from '../../utils/myWorkChapterFilter';
import { getMyWorkRowDisplay } from '../../utils/myWorkRowDisplay';
import { theme } from '../../theme';
import { ChapterConflictIndicator } from './ChapterConflictIndicator';
import { ChapterProgressRing } from './ChapterProgressRing';
import { ChapterCloudSyncIndicator } from './ChapterSyncIndicator';
import { DraftDownloadChip } from './DraftDownloadChip';
import { ListCard } from './ListCard';
import { ChapterOwnershipIndicator } from './ChapterOwnershipIndicator';

interface MyWorkRowProps {
  chapter: MyWorkChapter;
  onPress: () => void;
  isSyncing?: boolean;
}

export function MyWorkRow({
  chapter,
  onPress,
  isSyncing = false,
}: MyWorkRowProps) {
  const display = getMyWorkRowDisplay(chapter, isSyncing);
  // Fail closed when synced id drifts from active account (#291 / multi-account).
  const userId = getValidatedMyWorkDownloadUserId();
  const downloadRequest =
    userId !== null ? buildMyWorkDraftDownloadRequest(chapter, userId) : null;
  const { state, start } = useDraftDownload(downloadRequest);

  return (
    <View style={styles.row} testID={`my-work-row-wrap-${chapter.id}`}>
      <View style={styles.cardSlot}>
        <ListCard
          onPress={onPress}
          testID={`my-work-row-${chapter.id}`}
          accessibilityLabel={chapter.displayLabel}
        >
          <View style={styles.column}>
            <View style={styles.titleRow}>
              <Text
                style={styles.title}
                numberOfLines={1}
                accessible={false}
                testID={`my-work-row-title-${chapter.id}`}
              >
                {chapter.displayLabel}
              </Text>
              {display.showCloudSync ? (
                <ChapterCloudSyncIndicator syncState={chapter.syncState} />
              ) : null}
              {chapter.hasConflict ? (
                <ChapterConflictIndicator />
              ) : (
                <ChapterOwnershipIndicator
                  ownershipState={chapter.ownershipState}
                />
              )}
            </View>

            <View style={styles.metaRow}>
              {display.showActivityDate ? (
                <Text style={styles.activity}>{chapter.lastActivityLabel}</Text>
              ) : null}
              {display.showProgressRing ? (
                <ChapterProgressRing
                  filled={chapter.downloadedVerses}
                  indeterminate={display.progressRingIndeterminate}
                  total={chapter.totalVerses}
                />
              ) : null}
            </View>
          </View>
        </ListCard>
      </View>
      <View
        style={styles.chipColumn}
        testID={`my-work-row-chip-column-${chapter.id}`}
      >
        {downloadRequest ? (
          <DraftDownloadChip
            state={state}
            onPress={() => {
              void start();
            }}
            testID={`my-work-draft-download-${chapter.id}`}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  cardSlot: {
    flex: 1,
    minWidth: 0,
  },
  chipColumn: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: {
    gap: theme.spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  title: {
    flexShrink: 1,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.foreground,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  activity: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
  },
});
