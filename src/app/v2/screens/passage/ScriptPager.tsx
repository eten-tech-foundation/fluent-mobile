import React, { useMemo, useState, type RefObject } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import type { usePassage } from '../../../../hooks/usePassage';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';
import { Notebook } from '../../../../components/ui/icons';
import { RoundButton } from '../../../../components/ui/RoundButton';
import { Word } from '../../../../components/ui/Word';
import { verseKey, verseWords, type NoteChips } from './noteMatch';
import { type Ready } from './ready';

/** The passage's translation notes, as the script shows them. */
export interface ScriptNotes {
  /** Phrases with a note, by verse. */
  chips: NoteChips;
  /** Each note's quote, by note index, for TalkBack. */
  quotes: string[];
  /** The note last opened: its phrase stays full blue; the rest rest quiet. */
  current: number | null;
  /** Notes whose phrase isn't in this text; they follow the placed ones. */
  unplaced: number;
  /** Opens a note by index, from where it was tapped. Unset, chips are inert. */
  onOpen?: (note: number, from?: { x: number; y: number }) => void;
}
import { useScriptMetrics } from './scriptMetrics';

/**
 * The script. It stays where it is as the player opens and grows from body
 * to reading size, with Figma's fade/reading over its last line. The FIA
 * listening steps that once paged beside it are hidden until their audio
 * exists (Q11).
 */
export function ScriptPager({
  passage,
  downloadState,
  progress,
  expanded,
  playingVerse,
  top,
  height,
  scriptRef,
  onOpen,
  notes,
}: {
  passage: Ready;
  downloadState: ReturnType<typeof usePassage>['downloadState'];
  progress: SharedValue<number>;
  expanded: boolean;
  /** Source audio's verse; the rest of the script dims while it plays (Q10). */
  playingVerse: number | null;
  /** Where the script sits, hero then player. */
  top: readonly [number, number];
  height: readonly [number, number];
  scriptRef: RefObject<ScrollView | null>;
  /** Tapping the hero's script opens the player. */
  onOpen: () => void;
  notes?: ScriptNotes;
}) {
  const theme = useTheme();
  const { small, large, smallLine, largeLine, fadeSmall, fadeLarge } =
    useScriptMetrics();
  const styles = useThemedStyles(t => ({
    pager: { position: 'absolute', left: t.spacing.xl, right: t.spacing.xl },
    reading: { ...t.type.reading, color: t.roles.fgPrimary },
    // type/title, tight to its glyphs so it sits by its baseline.
    verseNumber: {
      fontFamily: t.type.title.fontFamily,
      fontSize: t.type.title.fontSize,
      lineHeight: t.type.title.fontSize,
      fontWeight: t.type.title.fontWeight,
      color: t.roles.fgSecondary,
    },
    notPlaying: { color: t.roles.fgSecondary },
    note: { ...t.type.label, color: t.roles.fgSecondary },
    more: { alignSelf: 'flex-start', marginTop: t.spacing.lg },
    scriptTop: { paddingTop: t.spacing.xs },
    fade: {
      position: 'absolute',
      left: 0,
      right: 0,
      experimental_backgroundImage: t.fade.reading,
    },
  }));

  // Chips are drawn only in the still, open player, at its size: a space/4
  // shorter than the line (Figma Word), less their border. Android sits an
  // inline view's bottom on the baseline, so they drop by the font's descent.
  const chip = useMemo(
    () => ({
      text: {
        fontSize: large.fontSize,
        lineHeight: largeLine - theme.spacing.xs - 2 * theme.stroke[2],
      },
      box: { transform: [{ translateY: CHIP_DESCENT * large.fontSize }] },
    }),
    [large.fontSize, largeLine, theme],
  );
  // Legacy shows whatever verses are on the phone; so does the script.
  const shown = useMemo(
    () => passage.verses.filter(v => v.text),
    [passage.verses],
  );
  const missingNote =
    downloadState === 'failed'
      ? "The text didn't download. Check your connection and try again."
      : downloadState === 'downloading'
      ? 'Downloading the text…'
      : 'The text isn’t on this phone yet.';
  const [heroTop, playerTop] = top;
  const [heroHeight, playerHeight] = height;
  const pagerStyle = useAnimatedStyle(() => ({
    top: interpolate(progress.value, [0, 1], [heroTop, playerTop], 'clamp'),
    height: interpolate(
      progress.value,
      [0, 1],
      [heroHeight, playerHeight],
      'clamp',
    ),
  }));
  const fadeStyle = useAnimatedStyle(() => {
    const h = interpolate(
      progress.value,
      [0, 1],
      [fadeSmall, fadeLarge],
      'clamp',
    );
    const bottom = interpolate(
      progress.value,
      [0, 1],
      [heroTop + heroHeight, playerTop + playerHeight],
      'clamp',
    );
    return { top: bottom - h, height: h };
  });
  // A phrase's words square off where they meet on a line and stay round
  // where it wraps. Each inline chip is one placeholder character in its
  // line, so the lines say which words share one; only a change re-renders.
  const chipOrder = useMemo(() => {
    const ids: string[] = [];
    for (const v of shown) {
      const key = verseKey(v.chapterNumber, v.verseNumber);
      // Verse numbers are inline views too.
      ids.push(`v${key}`);
      for (const seg of segments(v.text, notes?.chips.get(key))) {
        if (seg.note !== null) {
          seg.words.forEach((_, j) => ids.push(`${seg.note}-${j}`));
        }
      }
    }
    return ids;
  }, [shown, notes?.chips]);
  const [joined, setJoined] = useState<ReadonlySet<string>>(() => new Set());
  const onLines = (lines: { text: string }[]) => {
    if (!notes) return;
    const lineOf = new Map<string, number>();
    let at = 0;
    lines.forEach((line, row) => {
      const count = line.text.split(INLINE).length - 1;
      for (let k = 0; k < count && at < chipOrder.length; k += 1) {
        lineOf.set(chipOrder[at], row);
        at += 1;
      }
    });
    const next = new Set<string>();
    for (const [id, row] of lineOf) {
      if (id.startsWith('v')) continue;
      const [note, word] = id.split('-').map(Number);
      if (lineOf.get(`${note}-${word + 1}`) === row) next.add(id);
    }
    setJoined(prev =>
      prev.size === next.size && [...next].every(k => prev.has(k))
        ? prev
        : next,
    );
  };
  // A verse number is a superscript: its top meets the capitals as the
  // script grows. A nested span can't leave the baseline, so it's an inline
  // view, which Android sits bottom on the baseline.
  const numberSize = theme.type.title.fontSize;
  const numberStyle = useAnimatedStyle(() => {
    const size = interpolate(
      progress.value,
      [0, 1],
      [small.fontSize, large.fontSize],
      'clamp',
    );
    return {
      transform: [
        {
          translateY:
            CHIP_DESCENT * numberSize - CAP_HEIGHT * (size - numberSize),
        },
      ],
    };
  });
  const textStyle = useAnimatedStyle(() => ({
    fontSize: interpolate(
      progress.value,
      [0, 1],
      [small.fontSize, large.fontSize],
      'clamp',
    ),
    lineHeight: interpolate(
      progress.value,
      [0, 1],
      [smallLine, largeLine],
      'clamp',
    ),
  }));

  // Only what the script shows re-renders it, not the sheet around it.
  const script = useMemo(
    () =>
      shown.map(v => {
        const key = verseKey(v.chapterNumber, v.verseNumber);
        // Source audio is the assignment's chapter only (Q12).
        const playing =
          v.chapterNumber === passage.assignment.chapterNumber &&
          v.verseNumber === playingVerse;
        return (
          <Text
            key={key}
            style={
              playingVerse !== null && !playing ? styles.notPlaying : undefined
            }
            testID={playing ? 'passage-script-playing' : undefined}
          >
            <Animated.View style={numberStyle}>
              <Text style={styles.verseNumber}>{v.verseNumber}</Text>
            </Animated.View>{' '}
            {segments(v.text, notes?.chips.get(key)).map((seg, i) =>
              seg.note === null ? (
                `${seg.text} `
              ) : (
                <React.Fragment key={`${key}-${i}`}>
                  {/* Words of one phrase touch, so the chip reads as one
                      band and still wraps between words. */}
                  {seg.words.map((w, j) => (
                    <Word
                      key={j}
                      word={w}
                      variant={notes?.current === seg.note ? 'phrase' : 'note'}
                      textStyle={chip.text}
                      boxStyle={chip.box}
                      maxFontSizeMultiplier={theme.fontScale.readingMax}
                      onPress={
                        notes?.onOpen
                          ? e =>
                              notes.onOpen?.(
                                seg.note,
                                e?.nativeEvent && {
                                  x: e.nativeEvent.pageX,
                                  y: e.nativeEvent.pageY,
                                },
                              )
                          : undefined
                      }
                      accessibilityLabel={`Translation note: ${
                        notes?.quotes[seg.note] ?? seg.text
                      }`}
                      hiddenFromAccessibility={j > 0}
                      joinStart={joined.has(`${seg.note}-${j - 1}`)}
                      joinEnd={joined.has(`${seg.note}-${j}`)}
                      testID={`passage-note-chip-${seg.note}-${j}`}
                    />
                  ))}{' '}
                </React.Fragment>
              ),
            )}
          </Text>
        );
      }),
    [
      shown,
      passage.assignment.chapterNumber,
      playingVerse,
      notes,
      joined,
      styles,
      chip,
      numberStyle,
      theme.fontScale.readingMax,
    ],
  );
  // Chips read as buttons, not words, so TalkBack gets the whole text here.
  const spoken = useMemo(
    () => shown.map(v => `${v.verseNumber} ${v.text}`).join(' '),
    [shown],
  );

  return (
    <>
      <Animated.View style={[styles.pager, pagerStyle]} testID="passage-pager">
        <ScrollView
          ref={scriptRef}
          // Room for the first line's chip outlines.
          contentContainerStyle={styles.scriptTop}
          scrollEnabled={expanded}
          showsVerticalScrollIndicator={false}
          testID="passage-script-frame"
        >
          {shown.length > 0 ? (
            <Pressable
              onPress={expanded ? undefined : onOpen}
              // Open, the chips inside are the buttons.
              accessible={!expanded}
              focusable={!expanded}
              importantForAccessibility={expanded ? 'no' : 'auto'}
              accessibilityRole={expanded ? undefined : 'button'}
              accessibilityLabel={
                expanded ? undefined : 'Open the script in the player'
              }
              testID="passage-script"
            >
              <Animated.Text
                style={[styles.reading, textStyle]}
                maxFontSizeMultiplier={theme.fontScale.readingMax}
                accessibilityLabel={spoken}
                onTextLayout={e => onLines(e.nativeEvent.lines)}
                testID="passage-script-text"
              >
                {script}
              </Animated.Text>
              {expanded && notes?.onOpen && notes.unplaced > 0 ? (
                // Notes quoting another translation have no phrase to tap.
                <RoundButton
                  variant="flat"
                  icon={Notebook}
                  label={`${notes.unplaced} more ${
                    notes.unplaced === 1 ? 'note' : 'notes'
                  }`}
                  accessibilityLabel={`${notes.unplaced} more translation ${
                    notes.unplaced === 1 ? 'note' : 'notes'
                  }`}
                  onPress={() =>
                    notes.onOpen?.(notes.quotes.length - notes.unplaced)
                  }
                  style={styles.more}
                  testID="passage-more-notes"
                />
              ) : null}
              {passage.downloaded ? null : (
                <Text style={styles.note}>{missingNote}</Text>
              )}
            </Pressable>
          ) : (
            <Text style={styles.note}>{missingNote}</Text>
          )}
        </ScrollView>
      </Animated.View>
      <Animated.View
        style={[styles.fade, fadeStyle]}
        pointerEvents="none"
        testID="passage-fade"
      />
    </>
  );
}

/** Google Sans Flex's descent, as a share of its size. */
const CHIP_DESCENT = 0.2;
/** Its capitals' height, as a share of its size. */
const CAP_HEIGHT = 0.72;

/** How Android lays an inline view into a line of text. */
const INLINE = '\uFFFC';

type Segment =
  | { note: null; text: string }
  | { note: number; text: string; words: string[] };

/** A verse's text split into plain runs and the phrases with a note. */
function segments(
  text: string,
  spans: { start: number; end: number; note: number }[] | undefined,
): Segment[] {
  const words = verseWords(text);
  if (!spans?.length) return [{ note: null, text: words.join(' ') }];
  const out: Segment[] = [];
  let at = 0;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (span.start > at) {
      out.push({ note: null, text: words.slice(at, span.start).join(' ') });
    }
    const phrase = words.slice(span.start, span.end);
    out.push({ note: span.note, text: phrase.join(' '), words: phrase });
    at = span.end;
  }
  if (at < words.length) {
    out.push({ note: null, text: words.slice(at).join(' ') });
  }
  return out;
}
