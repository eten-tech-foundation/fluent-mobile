import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { theme } from '../../theme';

const GRID_COLUMNS = 5;
const GRID_GAP = theme.spacing.sm;

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
  const { width: windowWidth } = useWindowDimensions();
  const horizontalPadding = theme.spacing.lg * 2;
  const bookSectionPadding = theme.spacing.md * 2;
  const availableWidth =
    windowWidth - horizontalPadding - bookSectionPadding - GRID_GAP * 4;
  const cellSize = Math.floor(availableWidth / GRID_COLUMNS);

  return (
    <View style={styles.grid}>
      {chapterIds.map((chapterId, index) => {
        const selected = selectedIds.has(chapterId);
        const chapterNumber = chapterNumbers[index];

        return (
          <TouchableOpacity
            key={chapterId}
            style={[
              styles.cell,
              { width: cellSize, height: cellSize, borderRadius: cellSize / 2 },
              selected && styles.cellSelected,
            ]}
            onPress={() => onToggleChapter(chapterId)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`Chapter ${chapterNumber}`}
          >
            <Text
              style={[styles.cellLabel, selected && styles.cellLabelSelected]}
            >
              {chapterNumber}
            </Text>
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
    gap: GRID_GAP,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  cellSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  cellLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
  cellLabelSelected: {
    color: theme.colors.primaryForeground,
  },
});
