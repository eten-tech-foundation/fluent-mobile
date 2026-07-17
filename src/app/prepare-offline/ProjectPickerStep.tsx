import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ProjectSummary } from '../../types/db/types';
import { useProjectsSummary } from '../../hooks/useProjectsSummary';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ProjectRow } from '../../components/ui/ProjectRow';
import { PROJECTS_EMPTY_MESSAGE } from '../../constants/messages';
import { theme } from '../../theme';

interface ProjectPickerStepProps {
  onSelectProject: (project: ProjectSummary) => void;
}

export function ProjectPickerStep({ onSelectProject }: ProjectPickerStepProps) {
  const { projects, loading } = useProjectsSummary();

  if (loading) {
    return (
      <View style={styles.centered}>
        <LoadingSpinner />
      </View>
    );
  }

  if (projects.length === 0) {
    return <EmptyState message={PROJECTS_EMPTY_MESSAGE} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Select a project</Text>
      <View style={styles.listContent}>
        {projects.map(project => (
          <ProjectRow
            key={project.id}
            project={project}
            onPress={() => onSelectProject(project)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
});
