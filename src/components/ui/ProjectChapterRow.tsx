import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ProjectChapter } from '../../types/db/types';
import { getProjectChapterRowDisplay } from '../../utils/projectChapterRowDisplay';
import { theme } from '../../theme';
import { iconSizes } from '../../theme/iconSpecs';
import { ChapterProgressRing } from './ChapterProgressRing';
import { ChapterCloudSyncIndicator } from './ChapterSyncIndicator';
import { ListCard } from './ListCard';
import { PhaseStatusIcon } from './PhaseStatusIcon';
import { WorkflowBadge } from './WorkflowBadge';

interface ProjectChapterRowProps {
  chapter: ProjectChapter;
  onPress: () => void;
  isSyncing?: boolean;
}

export function ProjectChapterRow({
  chapter,
  onPress,
  isSyncing = false,
}: ProjectChapterRowProps) {
  const display = getProjectChapterRowDisplay(chapter, isSyncing);
  const { workflowStage, syncState, displayLabel, lastActivityLabel } = chapter;

  return (
    <ListCard
      onPress={onPress}
      leading={
        display.showPhaseIcon ? (
          <PhaseStatusIcon stage={workflowStage!} />
        ) : undefined
      }
    >
      <View style={styles.column}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {displayLabel}
          </Text>
          {display.showCloudSync ? (
            <ChapterCloudSyncIndicator
              syncState={syncState}
              size={iconSizes.projectSync}
            />
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <WorkflowBadge stage={workflowStage!} />
          {display.showActivityDate ? (
            <Text style={styles.activity}>{lastActivityLabel}</Text>
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
