import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { PROJECTS_EMPTY_MESSAGE } from '../../constants/messages';
import { useProjectsSummary } from '../../hooks/useProjectsSummary';
import { RootStackParamList } from '../../types/navigation/types';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ProjectRow } from '../../components/ui/ProjectRow';
import { theme } from '../../theme';

type Nav = StackNavigationProp<RootStackParamList, 'Home'>;

interface ProjectsTabProps {
  refreshKey?: number;
}

export function ProjectsTab({ refreshKey = 0 }: ProjectsTabProps) {
  const navigation = useNavigation<Nav>();
  const { projects, loading, refreshing, refresh } =
    useProjectsSummary(refreshKey);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (projects.length === 0) {
    return <EmptyState message={PROJECTS_EMPTY_MESSAGE} />;
  }

  return (
    <FlatList
      data={projects}
      keyExtractor={item => String(item.id)}
      contentContainerStyle={styles.listContent}
      refreshing={refreshing}
      onRefresh={refresh}
      renderItem={({ item }) => (
        <ProjectRow
          project={item}
          onPress={() =>
            navigation.navigate('Chapters', {
              projectId: item.id,
              projectName: item.name,
              language: item.target_language_name,
            })
          }
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
});
