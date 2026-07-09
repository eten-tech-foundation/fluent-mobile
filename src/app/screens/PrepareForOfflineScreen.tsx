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
import { PageHeader } from '../../components/layout/PageHeader';
import { PageHeaderBackButton } from '../../components/ui/PageHeaderBackButton';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
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
  const routeProjectName = route.params?.projectName;

  const [pickedProject, setPickedProject] = useState<{
    id: number;
    name: string;
  } | null>(
    routeProjectId
      ? { id: routeProjectId, name: routeProjectName ?? 'Project' }
      : null,
  );

  const projectId = pickedProject?.id ?? routeProjectId ?? null;
  const userId = useMemo(() => parseUserId(), []);

  const {
    books,
    loading,
    error,
    selectedIds,
    accordionExpanded,
    setAccordionExpanded,
    accordionTitle,
    toggleChapter,
    toggleBook,
    isBookFullySelected,
    retry,
  } = usePrepareOfflineSelection(projectId, userId);

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const handleSelectProject = useCallback((project: ProjectSummary) => {
    setPickedProject({ id: project.id, name: project.name });
  }, []);

  const handleChangeProject = useCallback(() => {
    setPickedProject(null);
  }, []);

  let body: React.ReactNode;

  if (!projectId) {
    body = <ProjectPickerStep onSelectProject={handleSelectProject} />;
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
      <>
        {pickedProject && !routeProjectId ? (
          <TouchableOpacity
            onPress={handleChangeProject}
            accessibilityRole="button"
          >
            <Text style={styles.projectLink}>
              {pickedProject.name} · Change
            </Text>
          </TouchableOpacity>
        ) : null}
        <ChapterSelectionAccordion
          title={accordionTitle}
          expanded={accordionExpanded}
          onToggleExpanded={() => setAccordionExpanded(prev => !prev)}
          books={books}
          selectedIds={selectedIds}
          onToggleChapter={toggleChapter}
          onToggleBook={toggleBook}
          isBookFullySelected={isBookFullySelected}
        />
      </>
    );
  }

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        <PageHeader
          title="Prepare for Offline"
          leftIcon={<PageHeaderBackButton onPress={goBack} />}
        />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.instruction}>{INSTRUCTION}</Text>
          {body}
        </ScrollView>
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
    gap: theme.spacing.md,
    flexGrow: 1,
  },
  instruction: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.mutedForeground,
    lineHeight: 22,
  },
  projectLink: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.primary,
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
