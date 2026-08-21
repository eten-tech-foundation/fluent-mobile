import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BookOpen,
  Images,
  MessageCircleQuestionMark,
  type LucideIcon,
} from 'lucide-react-native';
import { useDraftingContext } from '../context/DraftingContext';
import { EmptyState } from '../../components/ui/EmptyState';
import { ResourceSectionAccordion } from '../../components/ui/ResourceSectionAccordion';
import { RESOURCES_EMPTY_MESSAGE } from '../../constants/messages';
import { useTranslationNotesForUnit } from '../../hooks/useTranslationNotesForUnit';
import { useImagesMapsForUnit } from '../../hooks/useImagesMapsForUnit';
import { useUnitResourcesAvailability } from '../../hooks/useUnitResourcesAvailability';
import { ResourceSectionId } from '../../types/resources/types';
import { ImagesMapsSectionHost } from './resources/ImagesMapsSectionHost';
import { TranslationNotesSectionHost } from './resources/TranslationNotesSectionHost';
import { TranslationQuestionsSection } from './resources/TranslationQuestionsSection';
import {
  getResourcesTabUiState,
  setResourcesTabUiState,
} from '../../utils/resourcesTabUiState';
import { theme } from '../../theme';

type ResourcesTabProps = {
  chapterId: number;
  chapterName: string;
  /** Fluent project id for Prepare Offline inventory gating (#192). */
  projectId: number | null;
  /** Active user id for download_queue inventory rows (#53/#201). */
  userId: number | null;
  /** USFM book code for Aquifer resource lookup (e.g. MRK). */
  bookCode: string;
  chapterNumber: number;
};

const SECTION_META: {
  id: ResourceSectionId;
  label: string;
  Icon: LucideIcon;
}[] = [
  {
    id: 'translationNotes',
    label: 'Translation Notes',
    Icon: BookOpen,
  },
  {
    id: 'translationQuestions',
    label: 'Translation Questions',
    Icon: MessageCircleQuestionMark,
  },
  {
    id: 'imagesMaps',
    label: 'Images & Maps',
    Icon: Images,
  },
];

/**
 * Resources tab host (#188 + #192): Prepare Offline inventory gates which
 * sections appear. Translation Notes (#189), Translation Questions (#190), and
 * Images & Maps (#191) fill Aquifer-backed bodies when inventoried.
 */
export function ResourcesTab({
  chapterId,
  chapterName,
  projectId,
  userId,
  bookCode,
  chapterNumber,
}: ResourcesTabProps) {
  const { selectedVerse } = useDraftingContext();
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);

  const resources = useUnitResourcesAvailability({
    projectId,
    userId,
    chapterName,
    verseNumber: selectedVerse,
  });

  const { state: notesState, retry: retryNotes } = useTranslationNotesForUnit({
    bookCode,
    chapterNumber,
    verseNumber: selectedVerse,
  });

  const { state: imagesMapsState, retry: retryImagesMaps } =
    useImagesMapsForUnit({
      bookCode,
      chapterNumber,
      verseNumber: selectedVerse,
    });

  const [openAccordionIds, setOpenAccordionIds] = useState<Set<string>>(
    () => getResourcesTabUiState(chapterId, selectedVerse).openAccordionIds,
  );
  const openIdsRef = useRef(openAccordionIds);

  useEffect(() => {
    const saved = getResourcesTabUiState(chapterId, selectedVerse);
    openIdsRef.current = saved.openAccordionIds;
    setOpenAccordionIds(saved.openAccordionIds);
    scrollOffsetRef.current = saved.scrollOffset;
    scrollRef.current?.scrollTo({
      y: saved.scrollOffset,
      animated: false,
    });
  }, [chapterId, selectedVerse]);

  const persistUiState = useCallback(
    (nextOpenIds: Set<string>, scrollOffset: number) => {
      setResourcesTabUiState(chapterId, selectedVerse, {
        openAccordionIds: nextOpenIds,
        scrollOffset,
      });
    },
    [chapterId, selectedVerse],
  );

  const handleToggle = useCallback(
    (sectionId: ResourceSectionId) => {
      const next = new Set(openAccordionIds);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      setOpenAccordionIds(next);
      openIdsRef.current = next;
      persistUiState(next, scrollOffsetRef.current);
    },
    [openAccordionIds, persistUiState],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = event.nativeEvent.contentOffset.y;
      scrollOffsetRef.current = offset;
      persistUiState(openIdsRef.current, offset);
    },
    [persistUiState],
  );

  const visibleSections = SECTION_META.filter(section => {
    if (!resources.sections.includes(section.id)) {
      return false;
    }
    // Hide Images & Maps only when load finished with nothing to show.
    if (
      section.id === 'imagesMaps' &&
      imagesMapsState.status === 'ready' &&
      imagesMapsState.items.length === 0
    ) {
      return false;
    }
    return true;
  });

  if (visibleSections.length === 0) {
    return (
      <View style={styles.emptyHost} testID="resources-tab">
        <EmptyState message={RESOURCES_EMPTY_MESSAGE} />
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      testID="resources-tab"
      onScroll={handleScroll}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
    >
      <View
        style={styles.header}
        testID={`resources-unit-${chapterId}-${selectedVerse}`}
      >
        <Text style={styles.reference}>{resources.referenceLabel}</Text>
        {resources.passageTitle ? (
          <Text style={styles.passageTitle}>{resources.passageTitle}</Text>
        ) : null}
      </View>

      <View style={styles.sections}>
        {visibleSections.map(({ id, label, Icon }) => {
          const expanded = openAccordionIds.has(id);
          return (
            <ResourceSectionAccordion
              key={`${chapterId}-${selectedVerse}-${id}`}
              label={label}
              Icon={Icon}
              expanded={expanded}
              onToggle={() => handleToggle(id)}
              testID={`resources-section-${id}`}
            >
              {id === 'translationNotes' ? (
                <TranslationNotesSectionHost
                  state={notesState}
                  retry={retryNotes}
                  sectionExpanded={expanded}
                  bookCode={bookCode}
                  chapterNumber={chapterNumber}
                  verseNumber={selectedVerse}
                />
              ) : id === 'translationQuestions' ? (
                <TranslationQuestionsSection
                  bookCode={bookCode}
                  chapterNumber={chapterNumber}
                  verseNumber={selectedVerse}
                  sectionExpanded={expanded}
                />
              ) : id === 'imagesMaps' ? (
                <ImagesMapsSectionHost
                  state={imagesMapsState}
                  retry={retryImagesMaps}
                />
              ) : (
                <Text style={styles.stubBody}>
                  Content for this section will appear here.
                </Text>
              )}
            </ResourceSectionAccordion>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  emptyHost: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xxl,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.xl,
  },
  header: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  reference: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
    textAlign: 'center',
  },
  passageTitle: {
    fontSize: theme.typography.sizes.sm,
    fontStyle: 'italic',
    color: theme.colors.mutedForeground,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeights.normal,
  },
  sections: {
    gap: theme.spacing.sm,
  },
  stubBody: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    lineHeight: theme.typography.lineHeights.normal,
  },
});
