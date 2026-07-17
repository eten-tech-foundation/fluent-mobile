import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { SelectionCheckbox } from './SelectionCheckbox';

interface BookSectionHeaderProps {
  bookName: string;
  expanded: boolean;
  selectedCount: number;
  totalChapters: number;
  isBookFullySelected: boolean;
  onToggleExpanded: () => void;
  onToggleBook: () => void;
}

export function BookSectionHeader({
  bookName,
  expanded,
  selectedCount,
  totalChapters,
  isBookFullySelected,
  onToggleExpanded,
  onToggleBook,
}: BookSectionHeaderProps) {
  const hasSelection = selectedCount > 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.titleButton}
        onPress={onToggleExpanded}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${bookName}, ${selectedCount} of ${totalChapters} chapters selected`}
      >
        <Text style={styles.bookTitle}>{bookName}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.selectAllButton}
        onPress={onToggleBook}
        accessibilityRole="button"
        accessibilityLabel={`Select all chapters in ${bookName}`}
      >
        <SelectionCheckbox
          selected={isBookFullySelected}
          showCheck={hasSelection}
        />
        <Text style={styles.selectAllLabel}>Select all</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.chevronButton}
        onPress={onToggleExpanded}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${bookName}`}
      >
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  titleButton: {
    flexShrink: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.foreground,
  },
  selectAllButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  selectAllLabel: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
  },
  chevronButton: {
    minWidth: 36,
    minHeight: 40,
    marginLeft: 'auto',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
