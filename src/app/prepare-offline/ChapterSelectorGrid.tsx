import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../../theme';
import { SelectionCheckbox } from './SelectionCheckbox';

const GRID_COLUMNS = 5;

interface ChapterSelectorGridProps {
  chapterNumbers: number[];
  chapterIds: number[];
  selectedIds: Set<number>;
  onToggleChapter: (chapterId: number) => void;
}

export function ChapterSelectorGrid({
  chapterNumbers,
  chapterIds,
  selectedIds,
  onToggleChapter,
}: ChapterSelectorGridProps) {
  return (
    <View style={styles.grid}>
      {chapterIds.map((chapterId, index) => {
        const selected = selectedIds.has(chapterId);
        const chapterNumber = chapterNumbers[index];

        return (
          <TouchableOpacity
            key={chapterId}
            style={styles.cell}
            onPress={() => onToggleChapter(chapterId)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`Chapter ${chapterNumber}`}
          >
            <SelectionCheckbox selected={selected} />
            <Text style={styles.cellLabel}>{chapterNumber}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / GRID_COLUMNS}%`,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  cellLabel: {
    minWidth: 14,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.foreground,
  },
});
