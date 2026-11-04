import React, { useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { INACTIVE_SIZE } from '../../../../components/ui/PageDots';
import { VerseChip } from '../../../../components/ui/VerseChip';
import type { PassageVerse } from '../../../../hooks/usePassage';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';
import { useScriptMetrics } from './scriptMetrics';
import type { VerseSteps } from './useRecorder';

/** Past this many verses the dots don't fit a phone, so a count stands in. */
const MAX_DOTS = 12;

/**
 * The open player in verse mode: a page per verse of this chapter, swiped
 * sideways. While Listen plays, the pages follow the verse playing (Q31).
 */
export function VersePages({
  steps,
  playing = null,
}: {
  steps: VerseSteps;
  /** The source's verse while it plays; it leads the place until it stops. */
  playing?: number | null;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const { large, largeLine, fadeLarge } = useScriptMetrics();
  const styles = useThemedStyles(t => ({
    pages: { flex: 1 },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      paddingBottom: t.spacing.md,
    },
    // Figma Page dot, Inactive.
    dot: {
      width: INACTIVE_SIZE,
      height: INACTIVE_SIZE,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.fgInactive,
    },
    count: { ...t.type.meta, color: t.roles.fgSecondary },
    // The open script's size, so a verse reads the same on its page.
    reading: { ...large, lineHeight: largeLine, color: t.roles.fgPrimary },
  }));
  const [width, setWidth] = useState(0);
  const listRef = useRef<FlatList<PassageVerse>>(null);
  // A swipe holds its verse until the audio reaches it or the place moves
  // on, so the verse still playing doesn't pull the page back.
  const [swiped, setSwiped] = useState<{
    verse: number;
    reached: boolean;
  } | null>(null);
  const place = steps.current;
  useEffect(() => {
    if (!swiped) return;
    const here = place === swiped.verse;
    if (playing === swiped.verse || (here && playing === null)) {
      setSwiped(null);
    } else if (here && !swiped.reached) {
      setSwiped({ ...swiped, reached: true });
    } else if (!here && swiped.reached) {
      setSwiped(null);
    }
  }, [swiped, playing, place]);
  const lead = swiped?.verse ?? playing;
  const leadIndex =
    lead === null ? -1 : steps.verses.findIndex(v => v.verseNumber === lead);
  const index = Math.max(0, leadIndex >= 0 ? leadIndex : steps.index);
  const count = steps.verses.length;
  // The page showing, so a swipe and a jump from elsewhere don't fight.
  const shown = useRef(index);
  const laidOut = useRef(width);
  useEffect(() => {
    if (width === 0) return;
    const resized = laidOut.current !== width;
    laidOut.current = width;
    if (!resized && shown.current === index) return;
    shown.current = index;
    listRef.current?.scrollToIndex({
      index,
      animated: !resized && !reduceMotion,
    });
  }, [index, width, reduceMotion]);

  const verse = steps.verses[index];
  // The chip fills once its verse is recorded, like the Verses list's ring.
  const chip = {
    verse: verse?.verseNumber ?? steps.current,
    current: verse !== undefined && verse.recorded !== null,
  };
  return (
    <View
      style={styles.pages}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      testID="passage-verse-pages"
    >
      {/* The verse's chip stands in for its dot; past 12 it's "of 71". */}
      <View
        style={styles.top}
        accessible
        accessibilityLabel={`Verse ${chip.verse}${
          chip.current ? ', recorded' : ''
        }, ${index + 1} of ${count}`}
        testID="passage-verse-position"
      >
        {count <= MAX_DOTS ? (
          steps.verses.map((v, i) =>
            i === index ? (
              <VerseChip key={v.verseNumber} {...chip} />
            ) : (
              <View key={v.verseNumber} style={styles.dot} />
            ),
          )
        ) : (
          <>
            <VerseChip {...chip} />
            <Text style={styles.count}>{`of ${count}`}</Text>
          </>
        )}
      </View>
      {width > 0 ? (
        <FlatList
          ref={listRef}
          testID="passage-verse-pager"
          data={steps.verses}
          keyExtractor={v => String(v.verseNumber)}
          horizontal
          pagingEnabled
          scrollEnabled={!steps.locked}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({
            length: width,
            offset: width * i,
            index: i,
          })}
          onMomentumScrollEnd={e => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            const next = steps.verses[i];
            if (!next || i === shown.current) return;
            shown.current = i;
            setSwiped({ verse: next.verseNumber, reached: false });
            steps.go(next.verseNumber);
          }}
          renderItem={({ item }) => (
            <ScrollView
              style={{ width }}
              contentContainerStyle={{ paddingBottom: fadeLarge }}
              showsVerticalScrollIndicator={false}
              testID={`passage-verse-page-${item.verseNumber}`}
            >
              <Text
                style={styles.reading}
                maxFontSizeMultiplier={theme.fontScale.readingMax}
              >
                {item.text}
              </Text>
            </ScrollView>
          )}
        />
      ) : null}
    </View>
  );
}
