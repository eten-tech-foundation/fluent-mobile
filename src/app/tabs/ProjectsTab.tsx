import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { logger } from '../../utils/logger';
import { ProjectSummary } from '../../types/db/types';
import { getProjectsWithSummary } from '../../db/queries';
import { RootStackParamList } from '../../types/navigation/types';
import { EmptyState } from '../../components/ui/EmptyState';
import { ListCard } from '../../components/ui/ListCard';
import { SyncIndicator } from '../../components/ui/SyncIndicator';
import { theme } from '../../theme';

const log = logger.create('ProjectsTab');
type Nav = StackNavigationProp<RootStackParamList, 'Home'>;

const PROJECTS_EMPTY_MESSAGE =
  'No projects are available right now. Connect to the internet to sync and find available work.';

function formatChapterCount(count: number): string {
  return count === 1 ? '1 chapter' : `${count} chapters`;
}

interface ProjectsTabProps {
  refreshKey?: number;
}

export function ProjectsTab({ refreshKey = 0 }: ProjectsTabProps) {
  const navigation = useNavigation<Nav>();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const data = await getProjectsWithSummary();
      setProjects(data);
    } catch (error) {
      log.error('Error loading projects:', { error });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadProjects();
  }, [loadProjects, refreshKey]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadProjects();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (projects.length === 0) {
    return <EmptyState message={PROJECTS_EMPTY_MESSAGE} />;
  }

  return (
    <FlatList
      data={projects}
      keyExtractor={item => item.id.toString()}
      contentContainerStyle={styles.listContent}
      refreshing={refreshing}
      onRefresh={handleRefresh}
      renderItem={({ item }) => (
        <ListCard
          onPress={() =>
            navigation.navigate('Chapters', {
              projectId: item.id,
              projectName: item.name,
              language: item.target_language_name,
            })
          }
        >
          <View style={styles.titleRow}>
            <Text style={styles.title}>{item.name}</Text>
            <SyncIndicator syncState={item.syncState} />
          </View>
          <Text style={styles.subtitle}>
            {item.target_language_name} ·{' '}
            {formatChapterCount(item.chapterCount)}
          </Text>
        </ListCard>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
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
  subtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    marginTop: theme.spacing.xs,
  },
});
