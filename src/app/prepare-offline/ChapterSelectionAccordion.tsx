import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { PrepareOfflineBookGroup } from '../../types/prepareOffline/types';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { BookChapterSection } from './BookChapterSection';

interface ChapterSelectionAccordionProps {
  title: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  books: PrepareOfflineBookGroup[];
  selectedIds: Set<number>;
  expandedBookIds: Set<number>;
  onToggleBookExpanded: (bookId: number) => void;
  onToggleChapter: (chapterId: number) => void;
  onToggleBook: (book: PrepareOfflineBookGroup) => void;
  isBookFullySelected: (book: PrepareOfflineBookGroup) => boolean;
}

export function ChapterSelectionAccordion({
  title,
  expanded,
  onToggleExpanded,
  books,
  selectedIds,
  expandedBookIds,
  onToggleBookExpanded,
  onToggleChapter,
  onToggleBook,
  isBookFullySelected,
}: ChapterSelectionAccordionProps) {
  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={onToggleExpanded}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={styles.title}>{title}</Text>
        {expanded ? (
          <ChevronUp
            size={iconSizes.headerTab}
            color={theme.colors.mutedForeground}
            strokeWidth={listIconStrokeWidth}
          />
        ) : (
          <ChevronDown
            size={iconSizes.headerTab}
            color={theme.colors.mutedForeground}
            strokeWidth={listIconStrokeWidth}
          />
        )}
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.books}>
          {books.map(book => (
            <BookChapterSection
              key={book.bookId}
              book={book}
              expanded={expandedBookIds.has(book.bookId)}
              selectedIds={selectedIds}
              onToggleExpanded={() => onToggleBookExpanded(book.bookId)}
              onToggleChapter={onToggleChapter}
              onToggleBook={onToggleBook}
              isBookFullySelected={isBookFullySelected(book)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
  books: {
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.md,
  },
});
