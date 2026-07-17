import React, { useCallback } from 'react';
import {
  FlatList,
  ListRenderItem,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { StackScreenHeader } from '../../components/layout/StackScreenHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ProjectChapterRow } from '../../components/ui/ProjectChapterRow';
import { PROJECT_CHAPTERS_EMPTY_MESSAGE } from '../../constants/messages';
import { useProjectChapters } from '../../hooks/useProjectChapters';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { useSync } from '../../hooks/useSync';
import { theme } from '../../theme';
import { ProjectChapter } from '../../types/db/types';
import { RootStackParamList } from '../../types/navigation/types';

type Nav = StackNavigationProp<RootStackParamList, 'Chapters'>;
type Route = RouteProp<RootStackParamList, 'Chapters'>;

export default function ViewProject() {
  const navigation = useNavigation<Nav>();
  const { projectId, projectName, language } = useRoute<Route>().params;
  const { chapters, loading, refreshing, error, refresh, retry, reload } =
    useProjectChapters(projectId);

  const { isSyncing } = useSync({ onSyncComplete: reload });
  const { status: syncStatus } = useSyncStatus({ isSyncing });
  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const handleSyncPress = useCallback(() => {
    navigation.navigate('Sync');
  }, [navigation]);

  const renderChapter: ListRenderItem<ProjectChapter> = useCallback(
    ({ item }) => (
      <ProjectChapterRow
        chapter={item}
        isSyncing={isSyncing}
        onPress={() =>
          navigation.navigate('VerseDetail', {
            chapterId: item.id,
            chapterName: item.displayLabel,
            projectName,
            language,
          })
        }
      />
    ),
    [navigation, projectName, language, isSyncing],
  );

  const header = (
    <StackScreenHeader
      title={projectName}
      subtitle={language}
      onBack={goBack}
      onSyncPress={handleSyncPress}
      syncStatus={syncStatus}
    />
  );

  let body: React.ReactNode;

  if (loading) {
    body = (
      <View style={styles.centered}>
        <LoadingSpinner />
      </View>
    );
  } else if (error) {
    body = (
      <>
        {header}
        <View style={styles.centered}>
          <Text style={styles.errorMessage}>Unable to load this project.</Text>
          <TouchableOpacity onPress={retry} accessibilityRole="button">
            <Text style={styles.retryLink}>Try again</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  } else {
    body = (
      <>
        {header}
        {chapters.length === 0 ? (
          <EmptyState message={PROJECT_CHAPTERS_EMPTY_MESSAGE} />
        ) : (
          <FlatList
            data={chapters}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={refresh}
            renderItem={renderChapter}
          />
        )}
      </>
    );
  }

  return (
    <ScreenContainer edges={['bottom']}>
      <View style={styles.screen}>{body}</View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  listContent: theme.homeListContent,
  errorMessage: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.foreground,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  retryLink: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.medium,
    textAlign: 'center',
  },
});
