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
import {
  BUTTON_SIZE,
  RoundButton,
} from '../../../../components/ui/RoundButton';
import { verseKey } from './noteMatch';
import {
  CHIP_DESCENT,
  chipIds,
  moreNotesLabels,
  noteWords,
  segments,
  useChipJoins,
  useChipStyle,
  type ScriptNotes,
} from './noteWords';
import { type Ready } from './ready';

export type { ScriptNotes } from './noteWords';
import { useScriptMetrics } from './scriptMetrics';
import type { VerseSteps } from './useRecorder';
import { VersePages } from './VersePages';

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
  verseSteps,
  versePages,
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
  /** Verse mode: recorded verse numbers fill, other chapters dim. */
  verseSteps: VerseSteps | null;
  /** The open player in verse mode shows a page per verse instead. */
  versePages: boolean;
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
    recordedNumber: { color: t.roles.accentPrimary },
    note: { ...t.type.label, color: t.roles.fgSecondary },
    // Pinned over the script's bottom right, above the waveform.
    more: { position: 'absolute', right: 0, bottom: t.spacing.md },
    scriptTop: { paddingTop: t.spacing.xs },
    // Room under the last line, so it scrolls clear of the pinned button.
    scriptRoom: {
      paddingTop: t.spacing.xs,
      paddingBottom: BUTTON_SIZE + t.spacing.md + t.spacing.lg,
    },
    hidden: { display: 'none' },
    fade: {
      position: 'absolute',
      left: 0,
      right: 0,
      experimental_backgroundImage: t.fade.reading,
    },
  }));

  const chip = useChipStyle();
  // Notes quoting another translation have no phrase to tap. The script lists
  // the passage's; a verse page, its verse's.
  const [pageMore, setPageMore] = useState<number[]>([]);
  const onPages = versePages && verseSteps !== null;
  const allMore = useMemo(() => {
    const count = notes?.unplaced ?? 0;
    const from = (notes?.quotes.length ?? 0) - count;
    return Array.from({ length: count }, (_, i) => from + i);
  }, [notes?.unplaced, notes?.quotes.length]);
  const more = !expanded || !notes?.onOpen ? [] : onPages ? pageMore : allMore;
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
  // Verse numbers are inline views too, so they hold places in the lines.
  const chipOrder = useMemo(
    () =>
      shown.flatMap(v => {
        const key = verseKey(v.chapterNumber, v.verseNumber);
        return [`v${key}`, ...chipIds(segments(v.text, notes?.chips.get(key)))];
      }),
    [shown, notes?.chips],
  );
  const { joined, onLines } = useChipJoins(chipOrder, notes !== undefined);
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

  const verseMode = verseSteps !== null;
  // Only what the script shows re-renders it, not the sheet around it.
  const script = useMemo(
    () =>
      shown.map(v => {
        const key = verseKey(v.chapterNumber, v.verseNumber);
        // Source audio is the assignment's chapter only (Q12).
        const inChapter = v.chapterNumber === passage.assignment.chapterNumber;
        const playing = inChapter && v.verseNumber === playingVerse;
        const dim =
          (playingVerse !== null && !playing) || (verseMode && !inChapter);
        const filled = verseMode && inChapter && v.recorded !== null;
        return (
          <Text
            key={key}
            style={dim ? styles.notPlaying : undefined}
            testID={playing ? 'passage-script-playing' : undefined}
          >
            <Animated.View style={numberStyle}>
              <Text
                style={[styles.verseNumber, filled && styles.recordedNumber]}
                testID={`passage-script-verse-${v.verseNumber}`}
              >
                {v.verseNumber}
              </Text>
            </Animated.View>{' '}
            {noteWords({
              segs: segments(v.text, notes?.chips.get(key)),
              keyPrefix: key,
              notes,
              joined,
              chip,
              maxFontSizeMultiplier: theme.fontScale.readingMax,
              testIDPrefix: 'passage-note-chip',
            })}
          </Text>
        );
      }),
    [
      shown,
      passage.assignment.chapterNumber,
      playingVerse,
      verseMode,
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
        {versePages && verseSteps ? (
          <VersePages
            steps={verseSteps}
            playing={playingVerse}
            notes={notes}
            onMoreNotes={setPageMore}
          />
        ) : null}
        <ScrollView
          style={versePages && verseSteps ? styles.hidden : undefined}
          ref={scriptRef}
          // Room for the first line's chip outlines.
          contentContainerStyle={
            more.length > 0 ? styles.scriptRoom : styles.scriptTop
          }
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
      {more.length > 0 && notes?.onOpen ? (
        // Over the fade, in the script's frame; the text passes beneath.
        <Animated.View
          style={[styles.pager, pagerStyle]}
          pointerEvents="box-none"
        >
          <RoundButton
            variant="flat"
            icon={Notebook}
            label={moreNotesLabels(more.length).label}
            accessibilityLabel={moreNotesLabels(more.length).spoken}
            onPress={() => notes.onOpen?.(more[0])}
            style={styles.more}
            testID="passage-more-notes"
          />
        </Animated.View>
      ) : null}
    </>
  );
}

/** Its capitals' height, as a share of its size. */
const CAP_HEIGHT = 0.72;
