import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PROJECTS_EMPTY_MESSAGE } from '../../constants/messages';
import { useProjectsSummary } from '../../hooks/useProjectsSummary';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ProjectRow } from '../../components/ui/ProjectRow';
import { hrefs } from '../../navigation/hrefs';
import { theme } from '../../theme';

interface ProjectsTabProps {
  refreshKey?: number;
}

export function ProjectsTab({ refreshKey = 0 }: ProjectsTabProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: theme.spacing.lg + insets.bottom },
      ]}
      refreshing={refreshing}
      onRefresh={refresh}
      renderItem={({ item }) => (
        <ProjectRow
          project={item}
          onPress={() =>
            router.push(
              hrefs.chapters({
                projectId: item.id,
                projectName: item.name,
                language: item.target_language_name,
              }),
            )
          }
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  listContent: theme.homeListContent,
});
