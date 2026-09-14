import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
} from 'lucide-react-native';
import { useDraftingContext } from '../context/DraftingContext';
import { useBibleTabUnits } from '../../hooks/useBibleTabUnits';
import type { BibleTabUnitView } from '../../hooks/useBibleTabUnits';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { iconSizes, listIconStrokeWidth, theme } from '../../theme';

const playingVerseHighlight = `${theme.colors.primary}14`;

type BibleTabProps = {
  /** Opens the Record tab for the tapped verse (drafting bottom nav). */
  onOpenRecord?: () => void;
};

function PericopeVerseRun({
  verses,
}: {
  verses: BibleTabUnitView['bodyVerses'];
}) {
  return (
    <View style={styles.verseRun}>
      {verses.map((verse, index) => (
        <React.Fragment key={verse.verseNumber}>
          {index > 0 ? (
            <View style={styles.verseWord}>
              <Text style={styles.verseBody}> </Text>
            </View>
          ) : null}
          <View style={styles.verseSuperAlign}>
            <View
              style={styles.verseSuperSlot}
              testID={`bible-pericope-verse-${verse.verseNumber}`}
            >
              <Text style={styles.verseSuper}>{verse.verseNumber}</Text>
            </View>
          </View>
          {verse.text.split(' ').map((word, wordIndex, words) => (
            <View
              key={`${verse.verseNumber}-${wordIndex}`}
              style={styles.verseWord}
            >
              <Text style={styles.verseBody}>
                {wordIndex < words.length - 1 ? `${word} ` : word}
              </Text>
            </View>
          ))}
        </React.Fragment>
      ))}
    </View>
  );
}

function PericopeStatusIcon({
  status,
}: {
  status: BibleTabUnitView['recordedStatus'];
}) {
  const size = iconSizes.headerTab;
  if (status === 'partial') {
    return (
      <LoaderCircle
        size={size}
        strokeWidth={listIconStrokeWidth}
        color={theme.colors.workflowBadgeDraftBorder}
        testID="bible-unit-partial"
      />
    );
  }
  return (
    <Check
      size={size}
      strokeWidth={listIconStrokeWidth}
      color={
        status === 'recorded'
          ? theme.colors.syncSynced
          : theme.colors.mutedForeground
      }
      testID={
        status === 'recorded' ? 'bible-unit-recorded' : 'bible-unit-unrecorded'
      }
    />
  );
}

export function BibleTab(_props: BibleTabProps = {}) {
  const {
    verses,
    selectedVerse,
    setSelectedVerse,
    currentlyPlayingVerse,
    recordedVerseNumbers,
    projectId,
    bookName,
    chapterName,
  } = useDraftingContext();
  const first = verses[0];
  const { units, lastUnrecorded, draftingUnit, effectiveUnit } =
    useBibleTabUnits({
      bibleId: first?.bibleId ?? 0,
      bookId: first?.bookId ?? 0,
      chapterNumber: first?.chapterNumber ?? 0,
      projectId,
      verses,
      chapterName,
      bookName,
      selectedVerse,
      coverageEpoch: recordedVerseNumbers.size,
    });

  const listRef = useRef<FlatList<BibleTabUnitView>>(null);
  const prevDraftingUnitRef = useRef(draftingUnit);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const initialIndex = Math.max(
    0,
    units.findIndex(unit => unit.anchorVerse === selectedVerse),
  );

  useEffect(() => {
    const selected = units.find(unit =>
      unit.verses.some(verse => verse.verseNumber === selectedVerse),
    );
    if (selected && effectiveUnit === 'pericope') {
      setExpandedKey(selected.key);
    }
  }, [effectiveUnit, selectedVerse, units]);

  useEffect(() => {
    if (prevDraftingUnitRef.current === draftingUnit) {
      return;
    }
    if (draftingUnit === 'pericope' && effectiveUnit !== 'pericope') {
      return;
    }
    prevDraftingUnitRef.current = draftingUnit;
    if (lastUnrecorded != null) {
      setSelectedVerse(lastUnrecorded);
    }
  }, [draftingUnit, effectiveUnit, lastUnrecorded, setSelectedVerse]);

  const handleScrollToIndexFailed = useCallback((info: { index: number }) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: info.index, animated: false });
    });
  }, []);

  const handleUnitPress = useCallback(
    (unit: BibleTabUnitView) => {
      setSelectedVerse(unit.anchorVerse);
      if (effectiveUnit === 'pericope') {
        setExpandedKey(current => (current === unit.key ? null : unit.key));
      }
    },
    [effectiveUnit, setSelectedVerse],
  );

  const renderVerseRow = useCallback(
    ({ item }: { item: BibleTabUnitView }) => {
      const isSelected = item.anchorVerse === selectedVerse;
      const isPlaying = item.anchorVerse === currentlyPlayingVerse;

      return (
        <TouchableOpacity
          style={[
            styles.row,
            isSelected && styles.rowSelected,
            isPlaying && styles.rowPlaying,
          ]}
          onPress={() => handleUnitPress(item)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Verse ${item.anchorVerse}${
            isSelected ? ', selected' : ''
          }`}
        >
          <View style={styles.iconColumn}>
            <Text
              style={[
                styles.verseNumber,
                isSelected && styles.verseNumberSelected,
              ]}
            >
              {item.title}
            </Text>
            <AudioLines
              size={iconSizes.chapterSync}
              strokeWidth={listIconStrokeWidth}
              color={
                item.recordedStatus === 'recorded'
                  ? theme.colors.syncSynced
                  : theme.colors.mutedForeground
              }
              testID="bible-verse-waveform"
            />
          </View>
          <Text style={styles.verseText}>{item.previewText}</Text>
        </TouchableOpacity>
      );
    },
    [currentlyPlayingVerse, handleUnitPress, selectedVerse],
  );

  const renderPericopeCard = useCallback(
    ({ item }: { item: BibleTabUnitView }) => {
      const isSelected = item.anchorVerse === selectedVerse;
      const expanded = expandedKey === item.key;
      const Chevron = expanded ? ChevronUp : ChevronDown;

      return (
        <TouchableOpacity
          style={[
            styles.card,
            expanded ? styles.cardExpanded : styles.cardCollapsed,
          ]}
          onPress={() => handleUnitPress(item)}
          activeOpacity={theme.listCard.activeOpacity}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}${isSelected ? ', selected' : ''}`}
          testID={`bible-pericope-${item.key}`}
        >
          <View style={styles.cardHeader}>
            <PericopeStatusIcon status={item.recordedStatus} />
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Chevron
              size={iconSizes.headerTab}
              color={theme.colors.mutedForeground}
              strokeWidth={listIconStrokeWidth}
            />
          </View>
          {expanded ? (
            <PericopeVerseRun verses={item.bodyVerses} />
          ) : (
            <Text style={styles.cardPreview} numberOfLines={2}>
              {item.previewText}
            </Text>
          )}
        </TouchableOpacity>
      );
    },
    [expandedKey, handleUnitPress, selectedVerse],
  );

  return (
    <FlatList
      ref={listRef}
      data={units}
      keyExtractor={item => item.key}
      renderItem={
        effectiveUnit === 'pericope' ? renderPericopeCard : renderVerseRow
      }
      initialScrollIndex={initialIndex > 0 ? initialIndex : undefined}
      onScrollToIndexFailed={handleScrollToIndexFailed}
      contentContainerStyle={
        effectiveUnit === 'pericope' ? styles.cardContent : styles.content
      }
      style={styles.list}
      showsVerticalScrollIndicator={false}
      testID="bible-tab"
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  cardContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    backgroundColor: theme.colors.background,
  },
  rowSelected: {
    borderLeftColor: theme.colors.primary,
  },
  rowPlaying: {
    backgroundColor: playingVerseHighlight,
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
  card: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  cardCollapsed: {
    backgroundColor: theme.colors.cardBackground,
  },
  cardExpanded: {
    backgroundColor: playingVerseHighlight,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
  },
  cardPreview: {
    fontSize: theme.typography.sizes.md,
    lineHeight: theme.typography.lineHeights.normal,
    color: theme.colors.mutedForeground,
    includeFontPadding: false,
  },
  verseRun: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    overflow: 'visible',
  },
  verseWord: {
    alignSelf: 'flex-start',
  },
  verseBody: {
    fontSize: theme.typography.sizes.md,
    lineHeight: theme.typography.lineHeights.normal,
    color: theme.colors.foreground,
    includeFontPadding: false,
  },
  verseSuperAlign: {
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
    height: theme.typography.lineHeights.normal,
  },
  verseSuperSlot: {
    marginRight: 2,
    transform: [{ translateY: 3 }],
  },
  verseSuper: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
    includeFontPadding: false,
  },
});
