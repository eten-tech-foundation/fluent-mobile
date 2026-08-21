import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MY_WORK_EMPTY_MESSAGE } from '../../constants/messages';
import { useMyWorkChapters } from '../../hooks/useMyWorkChapters';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { MyWorkRow } from '../../components/ui/MyWorkRow';
import { hrefs } from '../../navigation/hrefs';
import { theme } from '../../theme';

interface MyWorkTabProps {
  refreshKey?: number;
  isSyncing?: boolean;
}

export function MyWorkTab({
  refreshKey = 0,
  isSyncing = false,
}: MyWorkTabProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { chapters, loading, refreshing, refresh } =
    useMyWorkChapters(refreshKey);

  if (loading || (isSyncing && chapters.length === 0)) {
    return <LoadingSpinner />;
  }

  if (chapters.length === 0) {
    return <EmptyState message={MY_WORK_EMPTY_MESSAGE} />;
  }

  return (
    <FlatList
      data={chapters}
      keyExtractor={item => String(item.id)}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: theme.spacing.lg + insets.bottom },
      ]}
      refreshing={refreshing}
      onRefresh={refresh}
      renderItem={({ item }) => (
        <MyWorkRow
          chapter={item}
          isSyncing={isSyncing}
          onPress={() =>
            router.push(
              hrefs.verseDetail({
                chapterId: item.id,
                chapterName: item.displayLabel,
                projectName: item.projectName,
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
