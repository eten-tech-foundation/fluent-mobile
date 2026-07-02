import React, { useCallback, useRef } from 'react';
import { AudioLines } from 'lucide-react-native';
import { VerseData } from '../../types/db/types';
import { useDraftingContext } from '../context/DraftingContext';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { iconSizes, listIconStrokeWidth, theme } from '../../theme';

export function BibleTab() {
  const { verses, selectedVerse, setSelectedVerse, currentlyPlayingVerse } =
    useDraftingContext();
  const listRef = useRef<FlatList<VerseData>>(null);

  const initialIndex = verses.findIndex(v => v.verseNumber === selectedVerse);

  const handleScrollToIndexFailed = useCallback((info: { index: number }) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: info.index, animated: false });
    });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: VerseData }) => {
      const isSelected = item.verseNumber === selectedVerse;
      const isPlaying = item.verseNumber === currentlyPlayingVerse;
      const hasRecording = false;

      return (
        <TouchableOpacity
          style={[
            styles.row,
            isSelected && styles.rowSelected,
            isPlaying && styles.rowPlaying,
          ]}
          onPress={() => setSelectedVerse(item.verseNumber)}
          activeOpacity={0.7}
        >
          <View style={styles.iconColumn}>
            <Text
              style={[
                styles.verseNumber,
                isSelected && styles.verseNumberSelected,
              ]}
            >
              {item.verseNumber}
            </Text>
            <AudioLines
              size={iconSizes.chapterSync}
              strokeWidth={listIconStrokeWidth}
              color={
                hasRecording
                  ? theme.colors.syncSynced
                  : theme.colors.mutedForeground
              }
            />
          </View>
          <Text style={styles.verseText}>{item.text}</Text>
        </TouchableOpacity>
      );
    },
    [selectedVerse, currentlyPlayingVerse, setSelectedVerse],
  );

  return (
    <FlatList
      ref={listRef}
      data={verses}
      keyExtractor={item => String(item.verseNumber)}
      renderItem={renderItem}
      initialScrollIndex={initialIndex > 0 ? initialIndex : undefined}
      onScrollToIndexFailed={handleScrollToIndexFailed}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  rowSelected: {
    borderLeftColor: theme.colors.primary,
  },
  rowPlaying: {
    backgroundColor: `${theme.colors.primary}14`,
  },
  iconColumn: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    width: 24,
  },
  verseNumber: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.mutedForeground,
  },
  verseNumberSelected: {
    color: theme.colors.primary,
  },
  verseText: {
    flex: 1,
    fontSize: theme.typography.sizes.md,
    lineHeight: theme.typography.lineHeights.normal,
    color: theme.colors.foreground,
  },
});
