import React, { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { StackScreenHeader } from '../../components/layout/StackScreenHeader';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { usePrepareOfflineSelection } from '../../hooks/usePrepareOfflineSelection';
import { usePrepareOfflineResources } from '../../hooks/usePrepareOfflineResources';
import { usePrepareOfflineDownload } from '../../hooks/usePrepareOfflineDownload';
import { ProjectSummary } from '../../types/db/types';
import { parseUserId } from '../../utils/parseUserId';
import { parseOptionalNumber } from '../../navigation/routeParams';
import { theme } from '../../theme';
import { ChapterSelectionAccordion } from '../prepare-offline/ChapterSelectionAccordion';
import { PrepareOfflineDownloadFooter } from '../prepare-offline/PrepareOfflineDownloadFooter';
import { PrepareOfflineResourcesSection } from '../prepare-offline/PrepareOfflineResourcesSection';
import { ManageDeviceStorageSection } from '../prepare-offline/ManageDeviceStorageSection';
import { ProjectPickerStep } from '../prepare-offline/ProjectPickerStep';

const INSTRUCTION = 'Download project resources to work without a connection.';

export default function PrepareForOfflineScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rawParams = useLocalSearchParams<{ projectId?: string }>();
  const routeProjectId = parseOptionalNumber(rawParams.projectId);

  const [pickedProjectId, setPickedProjectId] = useState<number | null>(
    routeProjectId ?? null,
  );

  const projectId = pickedProjectId ?? routeProjectId ?? null;
  const userId = useMemo(() => parseUserId(), []);

  const {
    books,
    chapters,
    loading,
    error,
    selectedIds,
    selectedCount,
    isAssignedUser,
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

  const {
    catalog,
    totalBytes,
    selectedItems,
    canDownload,
    manifestLoading,
    manifestError,
    isItemSelected,
    toggleItemSelected,
  } = usePrepareOfflineResources({
    projectId,
    userId,
    chapters,
    selectedIds,
    selectedCount,
    isAssignedUser,
  });

  const {
    session,
    busy,
    catalogWithProgress,
    downloadButtonLabel,
    canDownload: canDownloadNow,
    inventoryRefreshSignal,
    handleDownload,
    pause,
    resume,
    cancel,
  } = usePrepareOfflineDownload({
    projectId,
    userId,
    catalog,
    selectedItems,
    canDownload,
  });

  const goBack = useCallback(() => router.back(), [router]);

  const scrollContentStyle = [
    styles.content,
    { paddingBottom: theme.spacing.xxl + insets.bottom },
  ];

  const handleSelectProject = useCallback((project: ProjectSummary) => {
    setPickedProjectId(project.id);
  }, []);

  const showDownloadFooter =
    catalog.items.length > 0 &&
    !loading &&
    !error &&
    !manifestLoading &&
    !manifestError;

  const showStorageSection =
    projectId !== null && projectId !== undefined && !loading && !error;

  const storageSection =
    showStorageSection && projectId !== null && projectId !== undefined ? (
      <ManageDeviceStorageSection
        projectId={projectId}
        inventoryRefreshSignal={inventoryRefreshSignal}
        downloadInProgress={
          busy || session === 'downloading' || session === 'paused'
        }
      />
    ) : null;

  let body: React.ReactNode;

  if (!projectId) {
    body = (
      <ScrollView contentContainerStyle={scrollContentStyle}>
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
    body = (
      <ScrollView contentContainerStyle={scrollContentStyle}>
        <EmptyState message="No chapters available for this project." />
        {storageSection}
      </ScrollView>
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={scrollContentStyle}>
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
        <PrepareOfflineResourcesSection
          catalog={catalogWithProgress}
          isItemSelected={isItemSelected}
          onToggleItem={toggleItemSelected}
        />
        {showDownloadFooter ? (
          <PrepareOfflineDownloadFooter
            totalBytes={totalBytes}
            canDownload={canDownloadNow}
            downloadButtonLabel={downloadButtonLabel}
            session={session}
            busy={busy}
            onDownload={() => void handleDownload()}
            onPause={() => void pause()}
            onResume={() => void resume()}
            onCancel={() => void cancel()}
          />
        ) : null}
        {storageSection}
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
