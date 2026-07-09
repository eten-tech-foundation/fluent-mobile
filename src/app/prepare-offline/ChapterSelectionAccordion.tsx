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
        <View style={styles.body}>
          {books.map(book => (
            <BookChapterSection
              key={book.bookId}
              book={book}
              selectedIds={selectedIds}
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
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.foreground,
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
});
