import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { ResourceSectionId } from '../../types/resources/types';
import { getMockResourcesForUnit } from './resources/mockResourceData';
import { ImagesMapsSectionHost } from './resources/ImagesMapsSectionHost';
import { TranslationNotesSectionHost } from './resources/TranslationNotesSectionHost';
import { TranslationQuestionsSection } from './resources/TranslationQuestionsSection';
import { useImagesMapsForUnit } from '../../hooks/useImagesMapsForUnit';
import {
  getResourcesTabUiState,
  setResourcesTabUiState,
} from '../../utils/resourcesTabUiState';
import { theme } from '../../theme';

type ResourcesTabProps = {
  chapterId: number;
  chapterName: string;
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
 * Resources tab host (#188): unit-synced shell, empty state, accordion slots.
 * Translation Notes (#189), Translation Questions (#190), and Images & Maps (#191)
 * are Aquifer-backed.
 */
export function ResourcesTab({
  chapterId,
  chapterName,
  bookCode,
  chapterNumber,
}: ResourcesTabProps) {
  const { selectedVerse } = useDraftingContext();
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);

  const resources = useMemo(
    () => getMockResourcesForUnit(chapterId, selectedVerse, chapterName),
    [chapterId, selectedVerse, chapterName],
  );

  const { state: notesState, retry: retryNotes } = useTranslationNotesForUnit({
    bookCode,
    chapterNumber,
    verseNumber: selectedVerse,
  });

  // Live Aquifer TN (#189): show while loading/error, or when notes exist.
  // Do not gate on #188 mock emptiness alone — verse % 3 === 0 still loads Aquifer.
  // Guard notesState so a stale HMR/partial hook result cannot crash on `.status`.
  const showTranslationNotes =
    notesState !== undefined &&
    (notesState.status === 'loading' ||
      notesState.status === 'error' ||
      (notesState.status === 'ready' && notesState.notes.length > 0));

  // Lifted so we can hide the accordion when Aquifer returns 0 items (#191 AC).
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
    if (section.id === 'translationNotes') {
      return showTranslationNotes;
    }
    if (
      section.id === 'imagesMaps' &&
      imagesMapsState.status === 'ready' &&
      imagesMapsState.items.length === 0
    ) {
      return false;
    }
    // TQ stays on the #188 mock shell gate; Images stay visible while loading/error.
    return resources.sections.includes(section.id);
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
