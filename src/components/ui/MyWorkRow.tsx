import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MyWorkChapter } from '../../types/db/types';
import { ListCard } from './ListCard';
import { WorkflowBadge } from './WorkflowBadge';
import { ChapterSyncIndicator } from './ChapterSyncIndicator';
import { SourceNotDownloadedChip } from './SourceNotDownloadedChip';
import { theme } from '../../theme';

interface MyWorkRowProps {
  chapter: MyWorkChapter;
  onPress: () => void;
}

export function MyWorkRow({ chapter, onPress }: MyWorkRowProps) {
  const showBadgeRow =
    chapter.workflowStage !== null || !chapter.tier1Downloaded;

  return (
    <ListCard onPress={onPress}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{chapter.displayLabel}</Text>
        <ChapterSyncIndicator syncState={chapter.syncState} />
      </View>

      {chapter.lastActivityLabel ? (
        <Text style={styles.activity}>{chapter.lastActivityLabel}</Text>
      ) : null}

      {showBadgeRow ? (
        <View style={styles.badgeRow}>
          {chapter.workflowStage ? (
            <WorkflowBadge stage={chapter.workflowStage} />
          ) : null}
          {!chapter.tier1Downloaded ? <SourceNotDownloadedChip /> : null}
        </View>
      ) : null}
    </ListCard>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  title: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.foreground,
  },
  activity: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    marginTop: theme.spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
});
