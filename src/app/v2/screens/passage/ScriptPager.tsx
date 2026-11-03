import React, { type RefObject } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import type { usePassage } from '../../../../hooks/usePassage';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';
import { type Ready } from './ready';
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
}) {
  const theme = useTheme();
  const { small, large, smallLine, largeLine, fadeSmall, fadeLarge } =
    useScriptMetrics();
  const styles = useThemedStyles(t => ({
    pager: { position: 'absolute', left: t.spacing.xl, right: t.spacing.xl },
    reading: { ...t.type.reading, color: t.roles.fgPrimary },
    // No lineHeight, so it follows the script's as that grows.
    verseNumber: {
      fontFamily: t.type.label.fontFamily,
      fontSize: t.type.label.fontSize,
      fontWeight: t.type.label.fontWeight,
      color: t.roles.fgSecondary,
    },
    notPlaying: { color: t.roles.fgSecondary },
    note: { ...t.type.label, color: t.roles.fgSecondary },
    fade: {
      position: 'absolute',
      left: 0,
      right: 0,
      experimental_backgroundImage: t.fade.reading,
    },
  }));

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

  // Legacy shows whatever verses are on the phone; so does the script.
  const shown = passage.verses.filter(v => v.text);
  const missingNote =
    downloadState === 'failed'
      ? "The text didn't download. Check your connection and try again."
      : downloadState === 'downloading'
      ? 'Downloading the text…'
      : 'The text isn’t on this phone yet.';

  return (
    <>
      <Animated.View style={[styles.pager, pagerStyle]} testID="passage-pager">
        <ScrollView
          ref={scriptRef}
          scrollEnabled={expanded}
          showsVerticalScrollIndicator={false}
          testID="passage-script-frame"
        >
          {shown.length > 0 ? (
            <Pressable
              onPress={expanded ? undefined : onOpen}
              accessibilityRole={expanded ? undefined : 'button'}
              accessibilityLabel={
                expanded ? undefined : 'Open the script in the player'
              }
              testID="passage-script"
            >
              <Animated.Text
                style={[styles.reading, textStyle]}
                maxFontSizeMultiplier={theme.fontScale.readingMax}
              >
                {shown.map(v => {
                  // Source audio is the assignment's chapter only (Q12).
                  const playing =
                    v.chapterNumber === passage.assignment.chapterNumber &&
                    v.verseNumber === playingVerse;
                  return (
                    <Text
                      key={`${v.chapterNumber}:${v.verseNumber}`}
                      style={
                        playingVerse !== null && !playing
                          ? styles.notPlaying
                          : undefined
                      }
                      testID={playing ? 'passage-script-playing' : undefined}
                    >
                      <Text style={styles.verseNumber}>{v.verseNumber} </Text>
                      {v.text}{' '}
                    </Text>
                  );
                })}
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
    </>
  );
}
