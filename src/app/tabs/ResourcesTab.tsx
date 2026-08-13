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
import { ResourceSectionId } from '../../types/resources/types';
import {
  getMockResourcesForUnit,
  unitHasAnyResources,
} from './resources/mockResourceData';
import { ImagesMapsSectionHost } from './resources/ImagesMapsSectionHost';
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
 * Images & Maps body: #191 (live Aquifer). Notes / Questions stubs remain until #189 / #190.
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
  const hasContent = unitHasAnyResources(resources);

  const [openAccordionIds, setOpenAccordionIds] = useState<Set<string>>(
    () => getResourcesTabUiState(chapterId, selectedVerse).openAccordionIds,
  );
  const openIdsRef = useRef(openAccordionIds);

  // Restore scroll + accordion state when the active unit changes.
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

  if (!hasContent) {
    return (
      <View style={styles.emptyHost} testID="resources-tab">
        <EmptyState message={RESOURCES_EMPTY_MESSAGE} />
      </View>
    );
  }

  const visibleSections = SECTION_META.filter(section =>
    resources.sections.includes(section.id),
  );

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
              {id === 'imagesMaps' ? (
                <ImagesMapsSectionHost
                  bookCode={bookCode}
                  chapterNumber={chapterNumber}
                  verseNumber={selectedVerse}
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
