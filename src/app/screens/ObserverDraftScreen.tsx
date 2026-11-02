import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookOpen, FileText } from 'lucide-react-native';
import { DraftingHeader } from '../../components/layout/DraftingHeader';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { useObserverDraftChapter } from '../../hooks/useObserverDraftChapter';
import { getObserverDraftDestination } from '../../navigation/observerDraft';
import { parseOptionalNumber } from '../../navigation/routeParams';
import { hrefs } from '../../navigation/hrefs';
import { iconSizes, listIconStrokeWidth, theme } from '../../theme';
import { UiVersionOverride } from '../../theme/useTheme';
import { BibleTab } from '../tabs/BibleTab';
import { ObserverDraftTab } from '../tabs/ObserverDraftTab';
import { DraftingProvider } from '../context/DraftingContext';
import { useActiveAccountSummary } from '../../hooks/useActiveAccountSummary';
import { useGlobalSyncStatus } from '../../hooks/useGlobalSyncStatus';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { AccountSwitcherPanel } from '../../components/ui/AccountSwitcherPanel';

type ObserverTab = 'bible' | 'draft';

/**
 * Legacy-only Observer Bible + Draft surface (#452).
 *
 * unresolvedConflictPlaybackPolicy is explicitly `undecided` — product has not
 * settled allow/block for unresolved conflict audio. That keeps full #452
 * acceptance blocked (no false readiness): conflict/unknown audio stays
 * neutrally unavailable; only clean/resolved canonical takes play.
 */
export default function ObserverDraftScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams<{
    chapterAssignmentId?: string;
    projectId?: string;
  }>();
  const chapterAssignmentId =
    parseOptionalNumber(raw.chapterAssignmentId) ?? null;
  const projectId = parseOptionalNumber(raw.projectId) ?? null;

  const [activeTab, setActiveTab] = useState<ObserverTab>('bible');
  const [accountSwitcherVisible, setAccountSwitcherVisible] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const chapter = useObserverDraftChapter({
    chapterAssignmentId,
    projectId,
  });
  const isSyncing = useGlobalSyncStatus(() => setRefreshKey(key => key + 1));
  const { status: syncStatus, failedErrorText } = useSyncStatus({
    isSyncing,
    refreshKey,
  });
  const activeAccount = useActiveAccountSummary(refreshKey);

  const goBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleSyncPress = useCallback(() => {
    router.push(hrefs.sync);
  }, [router]);

  const handleChapterPress = useCallback(
    async (nextChapterAssignmentId: number) => {
      if (projectId === null) {
        return;
      }
      const href = await getObserverDraftDestination({
        chapterAssignmentId: nextChapterAssignmentId,
        projectId,
      });
      if (href === null) {
        return;
      }
      router.replace(href);
    },
    [projectId, router],
  );

  const assignment = chapter.assignment;
  const chapterTitle =
    assignment !== null
      ? `${assignment.bookName ?? 'Chapter'} ${assignment.chapterNumber}`
      : 'Observer draft';

  const showContent = chapter.hasAccess && assignment !== null;

  return (
    <UiVersionOverride value="legacy">
      <ScreenContainer>
        <View style={styles.screen} testID="observer-draft-screen">
          <DraftingHeader
            title={chapterTitle}
            onBack={goBack}
            syncStatus={syncStatus}
            failedErrorText={failedErrorText}
            onSyncPress={handleSyncPress}
            showAccountIndicator={activeAccount.hasMultipleAccounts}
            accountFirstName={activeAccount.firstName}
            accountLastName={activeAccount.lastName}
            accountEmail={activeAccount.email}
            onAccountPress={() => setAccountSwitcherVisible(true)}
          />

          {chapter.loading ? (
            <View style={styles.centered} testID="observer-draft-loading">
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : !showContent ? (
            <View style={styles.centered} testID="observer-draft-no-access">
              <Text style={styles.emptyText}>
                This Observer draft is unavailable for the active account.
              </Text>
            </View>
          ) : (
            <DraftingProvider
              verses={chapter.sourceVerses}
              initialVerse={chapter.sourceVerses[0]?.verseNumber ?? 1}
              projectId={assignment.projectId}
              projectUnitId={assignment.projectUnitId}
              bookName={assignment.bookName ?? ''}
              chapterName={chapterTitle}
            >
              <View style={styles.content}>
                <View
                  style={[
                    styles.tabPane,
                    activeTab !== 'bible' && styles.tabHidden,
                  ]}
                  pointerEvents={activeTab === 'bible' ? 'auto' : 'none'}
                  testID="observer-draft-bible-pane"
                >
                  {/* BibleTab reused unchanged — no Record open path here. */}
                  <BibleTab />
                </View>
                <View
                  style={[
                    styles.tabPane,
                    activeTab !== 'draft' && styles.tabHidden,
                  ]}
                  pointerEvents={activeTab === 'draft' ? 'auto' : 'none'}
                  testID="observer-draft-draft-pane"
                >
                  <ObserverDraftTab
                    units={chapter.draftUnits}
                    chapterNumber={assignment.chapterNumber}
                    chapterAssignmentId={assignment.id}
                    accountId={chapter.accountId}
                    hasAccess={chapter.hasAccess}
                    isActive={activeTab === 'draft'}
                    unresolvedConflictPlaybackPolicy="undecided"
                  />
                </View>
              </View>

              <View
                style={styles.chapterBrowse}
                testID="observer-draft-chapter-browse"
              >
                <FlatList
                  horizontal
                  data={chapter.unitChapters}
                  keyExtractor={item => String(item.id)}
                  showsHorizontalScrollIndicator={false}
                  renderItem={({ item }) => {
                    const selected = item.id === assignment.id;
                    return (
                      <Pressable
                        onPress={() => {
                          void handleChapterPress(item.id);
                        }}
                        style={[
                          styles.chapterChip,
                          selected && styles.chapterChipSelected,
                        ]}
                        testID={`observer-draft-chapter-chip-${item.id}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${item.book_name} ${item.chapter_number}`}
                      >
                        <Text
                          style={[
                            styles.chapterChipText,
                            selected && styles.chapterChipTextSelected,
                          ]}
                        >
                          {item.chapter_number}
                        </Text>
                      </Pressable>
                    );
                  }}
                />
              </View>

              <View style={styles.tabBar} testID="observer-draft-tab-bar">
                <Pressable
                  style={styles.tab}
                  onPress={() => setActiveTab('bible')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: activeTab === 'bible' }}
                  accessibilityLabel="Bible"
                  testID="observer-draft-tab-bible"
                >
                  <BookOpen
                    size={iconSizes.headerTab}
                    color={
                      activeTab === 'bible'
                        ? theme.colors.primary
                        : theme.colors.mutedForeground
                    }
                    strokeWidth={listIconStrokeWidth}
                  />
                  <Text
                    style={[
                      styles.tabLabel,
                      activeTab === 'bible' && styles.tabLabelActive,
                    ]}
                  >
                    Bible
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.tab}
                  onPress={() => setActiveTab('draft')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: activeTab === 'draft' }}
                  accessibilityLabel="Draft"
                  testID="observer-draft-tab-draft"
                >
                  <FileText
                    size={iconSizes.headerTab}
                    color={
                      activeTab === 'draft'
                        ? theme.colors.primary
                        : theme.colors.mutedForeground
                    }
                    strokeWidth={listIconStrokeWidth}
                  />
                  <Text
                    style={[
                      styles.tabLabel,
                      activeTab === 'draft' && styles.tabLabelActive,
                    ]}
                  >
                    Draft
                  </Text>
                </Pressable>
              </View>
            </DraftingProvider>
          )}
        </View>
        <AccountSwitcherPanel
          visible={accountSwitcherVisible}
          onClose={() => setAccountSwitcherVisible(false)}
        />
      </ScreenContainer>
    </UiVersionOverride>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
  },
  tabPane: {
    flex: 1,
  },
  tabHidden: {
    display: 'none',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  emptyText: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
  },
  chapterBrowse: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  chapterChip: {
    minWidth: 36,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginRight: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.cardBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  chapterChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chapterChipText: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.foreground,
    textAlign: 'center',
  },
  chapterChipTextSelected: {
    color: theme.colors.primaryForeground,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  tabLabel: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
  },
  tabLabelActive: {
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.semibold,
  },
});
