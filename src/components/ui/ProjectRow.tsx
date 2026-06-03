import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ProjectSummary } from '../../types/db/types';
import { formatChapterCount } from '../../utils/formatChapterCount';
import { ListCard } from './ListCard';
import { SyncIndicator } from './SyncIndicator';
import { theme } from '../../theme';

interface ProjectRowProps {
  project: ProjectSummary;
  onPress: () => void;
}

export function ProjectRow({ project, onPress }: ProjectRowProps) {
  return (
    <ListCard onPress={onPress}>
      <View style={styles.column}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {project.name}
          </Text>
          <SyncIndicator syncState={project.syncState} />
        </View>
        <Text style={styles.subtitle}>
          {project.target_language_name} ·{' '}
          {formatChapterCount(project.chapterCount)}
        </Text>
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
  subtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
});
