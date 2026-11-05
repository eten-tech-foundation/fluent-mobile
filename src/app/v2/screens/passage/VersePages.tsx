import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Notebook } from '../../../../components/ui/icons';
import { INACTIVE_SIZE } from '../../../../components/ui/PageDots';
import { RoundButton } from '../../../../components/ui/RoundButton';
import { VerseChip } from '../../../../components/ui/VerseChip';
import type { PassageVerse } from '../../../../hooks/usePassage';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';
import { verseKey } from './noteMatch';
import {
  chipIds,
  noteWords,
  segments,
  useChipJoins,
  useChipStyle,
  type ScriptNotes,
} from './noteWords';
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
  notes,
}: {
  steps: VerseSteps;
  /** The source's verse while it plays; it leads the place until it stops. */
  playing?: number | null;
  /** Each verse's translation notes, as chips like the script's. */
  notes?: ScriptNotes;
}) {
  const reduceMotion = useReducedMotion();
  const { fadeLarge } = useScriptMetrics();
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

  const turnable = !steps.locked;

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
        accessibilityRole={turnable ? 'adjustable' : undefined}
        accessibilityLabel={`Verse ${chip.verse}${
          chip.current ? ', recorded' : ''
        }, ${index + 1} of ${count}`}
        accessibilityActions={
          turnable ? [{ name: 'increment' }, { name: 'decrement' }] : []
        }
        // TalkBack turns a page with a swipe up or down.
        onAccessibilityAction={e => {
          const up = e.nativeEvent.actionName === 'increment';
          const at = index + (up ? 1 : -1);
          const to = steps.verses[at];
          if (!to || !turnable) return;
          setSwiped({ verse: to.verseNumber, reached: false });
          steps.go(to.verseNumber);
          // Android says nothing after an adjust without a range value.
          AccessibilityInfo.announceForAccessibility(
            `Verse ${to.verseNumber}, ${at + 1} of ${count}`,
          );
        }}
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
          extraData={notes}
          renderItem={({ item }) => (
            <ScrollView
              style={{ width }}
              contentContainerStyle={{ paddingBottom: fadeLarge }}
              showsVerticalScrollIndicator={false}
              testID={`passage-verse-page-${item.verseNumber}`}
            >
              <VersePage
                verse={item}
                notes={notes}
                first={item === steps.verses[0]}
              />
            </ScrollView>
          )}
        />
      ) : null}
    </View>
  );
}

/** One verse at reading size, its noted phrases as chips like the script's. */
function VersePage({
  verse,
  notes,
  first,
}: {
  verse: PassageVerse;
  notes: ScriptNotes | undefined;
  /** Notes about no verse in particular go on the first page. */
  first: boolean;
}) {
  const theme = useTheme();
  const { large, largeLine } = useScriptMetrics();
  const styles = useThemedStyles(t => ({
    // The open script's size, so a verse reads the same on its page.
    reading: { ...large, lineHeight: largeLine, color: t.roles.fgPrimary },
    more: { alignSelf: 'flex-start', marginTop: t.spacing.lg },
  }));
  const chip = useChipStyle();
  const key = verseKey(verse.chapterNumber, verse.verseNumber);
  const segs = useMemo(
    () => segments(verse.text, notes?.chips.get(key)),
    [verse.text, key, notes?.chips],
  );
  // Its notes that quote another translation, so have no phrase to tap here.
  const more = [
    ...(notes?.unplacedAt.get(key) ?? []),
    ...(first ? notes?.unplacedAt.get('') ?? [] : []),
  ];
  const order = useMemo(() => chipIds(segs), [segs]);
  const { joined, onLines } = useChipJoins(order, notes !== undefined);
  return (
    <>
      <Text
        style={styles.reading}
        maxFontSizeMultiplier={theme.fontScale.readingMax}
        // Chips read as buttons, not words, so TalkBack gets the verse here.
        accessibilityLabel={verse.text}
        onTextLayout={e => onLines(e.nativeEvent.lines)}
      >
        {noteWords({
          segs,
          keyPrefix: `${verse.verseNumber}`,
          notes,
          joined,
          chip,
          maxFontSizeMultiplier: theme.fontScale.readingMax,
          testIDPrefix: `passage-verse-note-${verse.verseNumber}`,
        })}
      </Text>
      {notes?.onOpen && more.length > 0 ? (
        <RoundButton
          variant="flat"
          icon={Notebook}
          label={`${more.length} more ${more.length === 1 ? 'note' : 'notes'}`}
          accessibilityLabel={`${more.length} more translation ${
            more.length === 1 ? 'note' : 'notes'
          }`}
          onPress={() => notes.onOpen?.(more[0])}
          style={styles.more}
          testID={`passage-verse-more-notes-${verse.verseNumber}`}
        />
      ) : null}
    </>
  );
}
