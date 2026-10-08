import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MILESTONES_EMPTY_MESSAGE } from '../../constants/messages';
import { useMilestonesSummary } from '../../hooks/useMilestonesSummary';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { MilestoneRow } from '../../components/ui/MilestoneRow';
import { hrefs } from '../../navigation/hrefs';
import { theme } from '../../theme';

interface ProjectsTabProps {
  refreshKey?: number;
}

export function ProjectsTab({ refreshKey = 0 }: ProjectsTabProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { milestones, loading, refreshing, refresh } =
    useMilestonesSummary(refreshKey);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (milestones.length === 0) {
    return <EmptyState message={MILESTONES_EMPTY_MESSAGE} />;
  }

  return (
    <FlatList
      data={milestones}
      keyExtractor={item => String(item.id)}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: theme.spacing.lg + insets.bottom },
      ]}
      refreshing={refreshing}
      onRefresh={refresh}
      renderItem={({ item }) => (
        <MilestoneRow
          milestone={item}
          onPress={() =>
            router.push(
              hrefs.chapters({
                projectId: item.projectId,
                projectUnitId: item.id,
                projectName: item.projectName,
                milestoneName: item.name,
                language: item.targetLanguageName,
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
