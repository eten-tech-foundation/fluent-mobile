import React, { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { StackScreenHeader } from '../../components/layout/StackScreenHeader';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { usePrepareOfflineSelection } from '../../hooks/usePrepareOfflineSelection';
import { ProjectSummary } from '../../types/db/types';
import { RootStackParamList } from '../../types/navigation/types';
import { parseUserId } from '../../utils/parseUserId';
import { theme } from '../../theme';
import { ChapterSelectionAccordion } from '../prepare-offline/ChapterSelectionAccordion';
import { ProjectPickerStep } from '../prepare-offline/ProjectPickerStep';

type Nav = StackNavigationProp<RootStackParamList, 'PrepareForOffline'>;
type Route = RouteProp<RootStackParamList, 'PrepareForOffline'>;

const INSTRUCTION = 'Download project resources to work without a connection.';

export default function PrepareForOfflineScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const routeProjectId = route.params?.projectId;

  const [pickedProjectId, setPickedProjectId] = useState<number | null>(
    routeProjectId ?? null,
  );

  const projectId = pickedProjectId ?? routeProjectId ?? null;
  const userId = useMemo(() => parseUserId(), []);

  const {
    books,
    loading,
    error,
    selectedIds,
    accordionExpanded,
    setAccordionExpanded,
    expandedBookIds,
    toggleBookExpanded,
    accordionTitle,
    toggleChapter,
    toggleBook,
    isBookFullySelected,
    retry,
  } = usePrepareOfflineSelection(projectId, userId);

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const handleSelectProject = useCallback((project: ProjectSummary) => {
    setPickedProjectId(project.id);
  }, []);

  let body: React.ReactNode;

  if (!projectId) {
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <ProjectPickerStep onSelectProject={handleSelectProject} />
      </ScrollView>
    );
  } else if (loading) {
    body = (
      <View style={styles.centered}>
        <LoadingSpinner />
      </View>
    );
  } else if (error) {
    body = (
      <View style={styles.centered}>
        <Text style={styles.errorMessage}>Unable to load chapters.</Text>
        <TouchableOpacity
          onPress={() => void retry()}
          accessibilityRole="button"
        >
          <Text style={styles.retryLink}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (books.length === 0) {
    body = <EmptyState message="No chapters available for this project." />;
  } else {
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        {/* Issue 51 adds the resource summary and Download action below this chapter selection; that Download action must call setPrepareOfflineDownloadStarted for the selected project. */}
        <ChapterSelectionAccordion
          title={accordionTitle}
          expanded={accordionExpanded}
          onToggleExpanded={() => setAccordionExpanded(prev => !prev)}
          books={books}
          selectedIds={selectedIds}
          expandedBookIds={expandedBookIds}
          onToggleBookExpanded={toggleBookExpanded}
          onToggleChapter={toggleChapter}
          onToggleBook={toggleBook}
          isBookFullySelected={isBookFullySelected}
        />
      </ScrollView>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.screen}>
        <StackScreenHeader
          title="Prepare for Offline"
          subtitle={INSTRUCTION}
          onBack={goBack}
          subtitleLines={2}
        />
        {body}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  errorMessage: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.foreground,
    textAlign: 'center',
  },
  retryLink: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.medium,
  },
});
