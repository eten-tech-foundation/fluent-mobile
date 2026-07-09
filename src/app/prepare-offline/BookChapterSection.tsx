import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp, CircleCheck } from 'lucide-react-native';
import { PrepareOfflineBookGroup } from '../../types/prepareOffline/types';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { ChapterSelectorGrid } from './ChapterSelectorGrid';

interface BookChapterSectionProps {
  book: PrepareOfflineBookGroup;
  selectedIds: Set<number>;
  onToggleChapter: (chapterId: number) => void;
  onToggleBook: (book: PrepareOfflineBookGroup) => void;
  isBookFullySelected: boolean;
}

export function BookChapterSection({
  book,
  selectedIds,
  onToggleChapter,
  onToggleBook,
  isBookFullySelected,
}: BookChapterSectionProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerMain}
          onPress={() => setExpanded(prev => !prev)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text style={styles.bookTitle}>{book.bookName}</Text>
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
        <TouchableOpacity
          style={styles.selectAllButton}
          onPress={() => onToggleBook(book)}
          accessibilityRole="button"
          accessibilityLabel={`Select all chapters in ${book.bookName}`}
        >
          <CircleCheck
            size={iconSizes.headerTab}
            color={
              isBookFullySelected
                ? theme.colors.primary
                : theme.colors.mutedForeground
            }
            strokeWidth={listIconStrokeWidth}
          />
          <Text style={styles.selectAllLabel}>Select all</Text>
        </TouchableOpacity>
      </View>

      {expanded ? (
        <ChapterSelectorGrid
          chapterIds={book.chapters.map(ch => ch.id)}
          chapterNumbers={book.chapters.map(ch => ch.chapterNumber)}
          selectedIds={selectedIds}
          onToggleChapter={onToggleChapter}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  headerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  bookTitle: {
    flex: 1,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.foreground,
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  selectAllLabel: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
});
