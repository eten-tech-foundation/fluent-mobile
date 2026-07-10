import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PrepareOfflineBookGroup } from '../../types/prepareOffline/types';
import { theme } from '../../theme';
import { BookSectionHeader } from './BookSectionHeader';
import { ChapterSelectorGrid } from './ChapterSelectorGrid';

interface BookChapterSectionProps {
  book: PrepareOfflineBookGroup;
  expanded: boolean;
  selectedIds: Set<number>;
  onToggleExpanded: () => void;
  onToggleChapter: (chapterId: number) => void;
  onToggleBook: (book: PrepareOfflineBookGroup) => void;
  isBookFullySelected: boolean;
}

export function BookChapterSection({
  book,
  expanded,
  selectedIds,
  onToggleExpanded,
  onToggleChapter,
  onToggleBook,
  isBookFullySelected,
}: BookChapterSectionProps) {
  const selectedCount = book.chapters.filter(ch =>
    selectedIds.has(ch.id),
  ).length;

  return (
    <View style={styles.card}>
      <BookSectionHeader
        bookName={book.bookName}
        expanded={expanded}
        selectedCount={selectedCount}
        totalChapters={book.chapters.length}
        isBookFullySelected={isBookFullySelected}
        onToggleExpanded={onToggleExpanded}
        onToggleBook={() => onToggleBook(book)}
      />
      {expanded ? (
        <View style={styles.grid}>
          <ChapterSelectorGrid
            chapterIds={book.chapters.map(ch => ch.id)}
            chapterNumbers={book.chapters.map(ch => ch.chapterNumber)}
            selectedIds={selectedIds}
            onToggleChapter={onToggleChapter}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cardBackground,
  },
  grid: {
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
});
