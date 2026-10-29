import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MY_WORK_EMPTY_MESSAGE } from '../../constants/messages';
import { useMyWorkChapters } from '../../hooks/useMyWorkChapters';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { MyWorkRow } from '../../components/ui/MyWorkRow';
import { PhaseStatusIcon } from '../../components/ui/PhaseStatusIcon';
import { isUserProjectMember } from '../../db/repository';
import { hrefs } from '../../navigation/hrefs';
import { getObserverDraftDestination } from '../../navigation/observerDraft';
import { getActiveUserId } from '../../services/storage';
import { getObserverProjectIds } from '../../services/userOrgGrants';
import { MyWorkChapter } from '../../types/db/types';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { classifyMyWorkListAccess } from '../../utils/myWorkChapterFilter';
import { getTranslatorProjectIds } from '../../utils/myWorkDraftDownload';
import { parseUserId } from '../../utils/parseUserId';
import {
  groupMyWorkChaptersByStage,
  MyWorkAccordionStage,
  MyWorkExpandedStagesState,
  myWorkAccordionBadgeStage,
  myWorkStageAccordionTitle,
  reconcileExpandedMyWorkStages,
  toggleMyWorkStageExpanded,
} from '../../utils/myWorkStageGroups';

interface MyWorkTabProps {
  refreshKey?: number;
  isSyncing?: boolean;
}

const EMPTY_EXPANDED_STATE: MyWorkExpandedStagesState = {
  expanded: new Set(),
  userTouched: new Set(),
  didAutoExpandSole: false,
};

export function MyWorkTab({
  refreshKey = 0,
  isSyncing = false,
}: MyWorkTabProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { chapters, loading, refreshing, refresh } =
    useMyWorkChapters(refreshKey);
  const [expandedState, setExpandedState] =
    useState<MyWorkExpandedStagesState>(EMPTY_EXPANDED_STATE);
  const expandedStateRef = useRef(expandedState);
  expandedStateRef.current = expandedState;
  const pressGenerationRef = useRef(0);

  const groups = groupMyWorkChaptersByStage(chapters);
  const groupStagesKey = groups.map(group => group.stage).join('|');

  useEffect(() => {
    const groupStages = groupStagesKey
      ? (groupStagesKey.split('|') as MyWorkAccordionStage[])
      : [];
    setExpandedState(
      reconcileExpandedMyWorkStages(groupStages, expandedStateRef.current),
    );
  }, [groupStagesKey]);

  const openChapter = async (chapter: MyWorkChapter) => {
    const pressGeneration = ++pressGenerationRef.current;

    // Reclassify from live account + grants — stale listAccess must not route.
    const activeRaw = getActiveUserId();
    const syncedUserId = parseUserId();
    if (
      !activeRaw ||
      syncedUserId === null ||
      activeRaw !== String(syncedUserId)
    ) {
      return;
    }
    const grantProjectIds = getObserverProjectIds(String(syncedUserId));
    const translatorProjectIds = getTranslatorProjectIds(String(syncedUserId));
    const access = classifyMyWorkListAccess({
      userId: syncedUserId,
      assignmentStatus: chapter.assignmentStatus,
      assignedUserId: chapter.assignedUserId,
      peerCheckerId: chapter.peerCheckerId,
      projectId: chapter.projectId,
      grantProjectIds,
      translatorProjectIds,
      // From the list snapshot: a stale `true` after a drain only opens
      // verse-detail, which re-checks access itself.
      hasPendingStageAdvance: chapter.hasPendingStageAdvance,
    });
    if (access === null) {
      return;
    }

    if (access === 'observer') {
      // Grant snapshot alone is not enough after list SQL — re-check
      // user_projects membership with the same generation/account guards.
      const stillMember = await isUserProjectMember(
        syncedUserId,
        chapter.projectId,
      );
      if (pressGenerationRef.current !== pressGeneration) {
        return;
      }
      const midRaw = getActiveUserId();
      const midSynced = parseUserId();
      if (
        !stillMember ||
        !midRaw ||
        midSynced === null ||
        midRaw !== String(midSynced) ||
        midSynced !== syncedUserId ||
        !getObserverProjectIds(String(midSynced)).includes(chapter.projectId)
      ) {
        return;
      }

      // Guarded helper revalidates account/grant pre- and post-await.
      // Null must not fall back to mutable verse-detail.
      const destination = await getObserverDraftDestination({
        chapterAssignmentId: chapter.id,
        projectId: chapter.projectId,
      });
      if (pressGenerationRef.current !== pressGeneration) {
        return;
      }
      if (destination === null) {
        return;
      }
      const afterRaw = getActiveUserId();
      const afterSynced = parseUserId();
      if (
        !afterRaw ||
        afterSynced === null ||
        afterRaw !== String(afterSynced) ||
        afterSynced !== syncedUserId ||
        !getObserverProjectIds(String(afterSynced)).includes(chapter.projectId)
      ) {
        return;
      }
      const memberAfter = await isUserProjectMember(
        afterSynced,
        chapter.projectId,
      );
      if (pressGenerationRef.current !== pressGeneration) {
        return;
      }
      const finalRaw = getActiveUserId();
      const finalSynced = parseUserId();
      if (
        !memberAfter ||
        !finalRaw ||
        finalSynced === null ||
        finalRaw !== String(finalSynced) ||
        finalSynced !== syncedUserId ||
        !getObserverProjectIds(String(finalSynced)).includes(chapter.projectId)
      ) {
        return;
      }
      router.push(destination);
      return;
    }

    // Assigned + open_peer: existing verse-detail peer route (PR #538 /
    // fb634e598e2f83ebef07e89c8ff495964c8a0940). Recheck Translator grant
    // immediately before navigate — fail closed on revoke/account drift.
    if (access === 'open_peer') {
      if (
        !getTranslatorProjectIds(String(syncedUserId)).includes(
          chapter.projectId,
        )
      ) {
        return;
      }
    }

    router.push(
      hrefs.verseDetail({
        chapterId: chapter.id,
        chapterName: chapter.displayLabel,
        projectName: chapter.projectName,
        language: chapter.targetLanguageName,
      }),
    );
  };

  if (loading || (isSyncing && chapters.length === 0)) {
    return <LoadingSpinner />;
  }

  if (chapters.length === 0) {
    return (
      <EmptyState message={MY_WORK_EMPTY_MESSAGE} testID="my-work-empty" />
    );
  }

  return (
    <FlatList
      data={groups}
      keyExtractor={item => item.stage}
      testID="my-work-list"
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: theme.spacing.lg + insets.bottom },
      ]}
      refreshing={refreshing}
      onRefresh={refresh}
      ListFooterComponent={
        <View
          testID="my-work-list-end"
          collapsable={false}
          accessible={false}
          style={styles.listEndMarker}
        >
          <View
            testID={`my-work-list-count-${chapters.length}`}
            collapsable={false}
            accessible={false}
            style={styles.listEndMarker}
          />
        </View>
      }
      renderItem={({ item: group }) => {
        const expanded = expandedState.expanded.has(group.stage);
        const title = myWorkStageAccordionTitle(
          group.label,
          group.chapters.length,
        );
        const badgeStage = myWorkAccordionBadgeStage(group.stage);

        return (
          <View
            style={styles.stageGroup}
            testID={`my-work-stage-${group.stage}`}
          >
            <TouchableOpacity
              style={styles.stageHeader}
              onPress={() =>
                setExpandedState(current =>
                  toggleMyWorkStageExpanded(group.stage, current),
                )
              }
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={title}
              testID={`my-work-stage-${group.stage}-toggle`}
            >
              <PhaseStatusIcon stage={badgeStage} />
              <Text
                style={styles.stageTitle}
                numberOfLines={1}
                testID={`my-work-stage-${group.stage}-title`}
              >
                {title}
              </Text>
              {expanded ? (
                <ChevronUp
                  size={iconSizes.chevron}
                  color={theme.colors.mutedForeground}
                  strokeWidth={listIconStrokeWidth}
                />
              ) : (
                <ChevronDown
                  size={iconSizes.chevron}
                  color={theme.colors.mutedForeground}
                  strokeWidth={listIconStrokeWidth}
                />
              )}
            </TouchableOpacity>

            {expanded
              ? group.chapters.map(chapter => (
                  <MyWorkRow
                    key={chapter.id}
                    chapter={chapter}
                    isSyncing={isSyncing}
                    onPress={() => {
                      void openChapter(chapter);
                    }}
                  />
                ))
              : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  listContent: theme.homeListContent,
  listEndMarker: { height: 1 },
  stageGroup: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    minHeight: 44,
  },
  stageTitle: {
    flex: 1,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.foreground,
  },
});
