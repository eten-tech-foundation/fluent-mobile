import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MessageSquare, MessageSquareCheck } from 'lucide-react-native';
import { useDraftDownload } from '../../hooks/useDraftDownload';
import { MyWorkChapter } from '../../types/db/types';
import type { DraftDownloadRequest } from '../../types/draftDownload/types';
import { getMyWorkCommentIndicator } from '../../utils/myWorkCommentIndicator';
import {
  buildMyWorkDraftDownloadRequest,
  getValidatedMyWorkDownloadUserId,
} from '../../utils/myWorkDraftDownload';
import { getMyWorkRowDisplay } from '../../utils/myWorkRowDisplay';
import { iconSizes, listIconStrokeWidth, theme } from '../../theme';
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

function sameDraftDownloadIdentity(
  a: DraftDownloadRequest,
  b: DraftDownloadRequest,
): boolean {
  return (
    a.userId === b.userId &&
    a.role === b.role &&
    a.chapterAssignmentId === b.chapterAssignmentId &&
    a.projectId === b.projectId &&
    a.projectUnitId === b.projectUnitId
  );
}

export function MyWorkRow({
  chapter,
  onPress,
  isSyncing = false,
}: MyWorkRowProps) {
  const display = getMyWorkRowDisplay(chapter, isSyncing);
  const commentIndicator = getMyWorkCommentIndicator(chapter);
  // Fail closed when synced id drifts from active account (#291 / multi-account).
  const userId = getValidatedMyWorkDownloadUserId();
  const downloadRequest =
    userId !== null ? buildMyWorkDraftDownloadRequest(chapter, userId) : null;
  const { state, start } = useDraftDownload(downloadRequest);
  const CommentIcon = commentIndicator?.currentUserHasCommented
    ? MessageSquareCheck
    : MessageSquare;

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
              {commentIndicator ? (
                <View
                  style={styles.commentMeta}
                  accessible
                  accessibilityLabel={commentIndicator.accessibilityLabel}
                  testID={`my-work-row-comment-${chapter.id}`}
                >
                  <CommentIcon
                    size={iconSizes.headerTab}
                    color={theme.colors.mutedForeground}
                    strokeWidth={listIconStrokeWidth}
                    testID={
                      commentIndicator.currentUserHasCommented
                        ? `my-work-row-comment-check-${chapter.id}`
                        : `my-work-row-comment-icon-${chapter.id}`
                    }
                  />
                  <Text
                    style={styles.commentCount}
                    testID={`my-work-row-comment-count-${chapter.id}`}
                  >
                    {commentIndicator.commentCount}
                  </Text>
                </View>
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
              // Revalidate at press — grant revocation without rerender must not start.
              const currentUserId = getValidatedMyWorkDownloadUserId();
              if (currentUserId === null) {
                return;
              }
              const liveRequest = buildMyWorkDraftDownloadRequest(
                chapter,
                currentUserId,
              );
              if (
                liveRequest === null ||
                !sameDraftDownloadIdentity(liveRequest, downloadRequest)
              ) {
                return;
              }
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
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  commentCount: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
  },
});
