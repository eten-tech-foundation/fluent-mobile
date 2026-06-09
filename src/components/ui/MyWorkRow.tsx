import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MyWorkChapter } from '../../types/db/types';
import { getMyWorkRowDisplay } from '../../utils/myWorkRowDisplay';
import { theme } from '../../theme';
import { ChapterProgressRing } from './ChapterProgressRing';
import { ChapterCloudSyncIndicator } from './ChapterSyncIndicator';
import { ListCard } from './ListCard';
import { WorkflowBadge } from './WorkflowBadge';

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
  const { workflowStage } = chapter;

  return (
    <ListCard onPress={onPress}>
      <View style={styles.column}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {chapter.displayLabel}
          </Text>
          {display.showCloudSync ? (
            <ChapterCloudSyncIndicator syncState={chapter.syncState} />
          ) : null}
        </View>

        <View style={styles.metaRow}>
          {workflowStage ? <WorkflowBadge stage={workflowStage} /> : null}
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
  );
}

const styles = StyleSheet.create({
  column: {
    gap: theme.spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
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
