import React from 'react';
import { View } from 'react-native';
import { isDevPreviewChangesRequestedEnabled } from '../../../../config/devPreviewChangesRequested';
import { draftingChapters } from '../../../../hooks/useNextUp';
import { useThemedStyles } from '../../../../theme/useTheme';
import type { MyWorkChapter } from '../../../../types/db/types';
import { AttentionCard } from './AttentionCard';

/** The sample has no notes to point at, so it opens the chapter's first passage. */
const SAMPLE_VERSE = 1;

/** The chapter the sample card points at: a draft with recordings to redo. */
export function sampleSentBack(
  chapters: MyWorkChapter[],
): MyWorkChapter | null {
  const drafts = draftingChapters(chapters);
  return drafts.find(c => c.completedVerses > 0) ?? drafts[0] ?? null;
}

/**
 * The top of Home when a peer check sends my chapter back: what came back
 * and who from, opening the passage to re-record. A dev-only sample on one
 * of my drafts until the API can send a chapter back.
 */
export function ChangesRequested({
  chapters,
  onOpen,
}: {
  chapters: MyWorkChapter[];
  onOpen: (chapter: MyWorkChapter, anchorVerse: number) => void;
}) {
  const styles = useThemedStyles(t => ({
    section: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.xl },
  }));

  const chapter = isDevPreviewChangesRequestedEnabled()
    ? sampleSentBack(chapters)
    : null;
  if (!chapter) return null;

  return (
    <View style={styles.section} testID="home-changes-requested">
      <AttentionCard
        eyebrow="Changes requested"
        title={`Ravi left 3 notes on your ${chapter.displayLabel}`}
        actionLabel="Make changes"
        faces={['R']}
        onPress={() => onOpen(chapter, SAMPLE_VERSE)}
        testID={`home-changes-requested-${chapter.id}`}
      />
    </View>
  );
}
