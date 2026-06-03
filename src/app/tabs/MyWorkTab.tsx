import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MY_WORK_EMPTY_MESSAGE } from '../../constants/messages';
import { useMyWorkChapters } from '../../hooks/useMyWorkChapters';
import { RootStackParamList } from '../../types/navigation/types';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { MyWorkRow } from '../../components/ui/MyWorkRow';
import { theme } from '../../theme';

type Nav = StackNavigationProp<RootStackParamList, 'Home'>;

interface MyWorkTabProps {
  refreshKey?: number;
}

export function MyWorkTab({ refreshKey = 0 }: MyWorkTabProps) {
  const navigation = useNavigation<Nav>();
  const { chapters, loading, refreshing, refresh } =
    useMyWorkChapters(refreshKey);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (chapters.length === 0) {
    return <EmptyState message={MY_WORK_EMPTY_MESSAGE} />;
  }

  return (
    <FlatList
      data={chapters}
      keyExtractor={item => String(item.id)}
      contentContainerStyle={styles.listContent}
      refreshing={refreshing}
      onRefresh={refresh}
      renderItem={({ item }) => (
        <MyWorkRow
          chapter={item}
          onPress={() =>
            navigation.navigate('VerseDetail', {
              chapterId: item.id,
              chapterName: item.displayLabel,
              projectName: item.projectName,
              language: item.targetLanguageName,
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
