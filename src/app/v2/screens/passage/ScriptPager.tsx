import React, { type RefObject } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import type { usePassage } from '../../../../hooks/usePassage';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';
import { MaterialPage } from './MaterialPage';
import { useScriptMetrics } from './scriptMetrics';
import { STEPS, type Ready } from './steps';

/**
 * The script, then one page per listening material, swiped sideways in the
 * player. The script stays where it is as the player opens and grows from
 * body to reading size, with Figma's fade/reading over its last line.
 */
export function ScriptPager({
  passage,
  downloadState,
  progress,
  expanded,
  recordMode,
  pageWidth,
  top,
  height,
  pagerRef,
  scriptRef,
  onPageChange,
  onOpen,
}: {
  passage: Ready;
  downloadState: ReturnType<typeof usePassage>['downloadState'];
  progress: SharedValue<number>;
  expanded: boolean;
  /** Recording is always of the script, so paging is off. */
  recordMode: boolean;
  pageWidth: number;
  /** Where the script sits, hero then player. */
  top: readonly [number, number];
  height: readonly [number, number];
  pagerRef: RefObject<ScrollView | null>;
  scriptRef: RefObject<ScrollView | null>;
  onPageChange: (page: number) => void;
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

  return (
    <>
      <Animated.ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        style={[styles.pager, pagerStyle]}
        scrollEnabled={expanded && !recordMode}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e =>
          onPageChange(
            Math.round(e.nativeEvent.contentOffset.x / (pageWidth || 1)),
          )
        }
        testID="passage-pager"
      >
        <ScrollView
          ref={scriptRef}
          style={{ width: pageWidth }}
          scrollEnabled={expanded}
          showsVerticalScrollIndicator={false}
          testID="passage-script-frame"
        >
          {passage.downloaded ? (
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
                {passage.verses.map(v => (
                  <Text key={`${v.chapterNumber}:${v.verseNumber}`}>
                    <Text style={styles.verseNumber}>{v.verseNumber} </Text>
                    {v.text}{' '}
                  </Text>
                ))}
              </Animated.Text>
            </Pressable>
          ) : (
            <Text style={styles.note}>
              {downloadState === 'failed'
                ? "The text didn't download. Check your connection and try again."
                : 'The text isn’t on this phone yet.'}
            </Text>
          )}
        </ScrollView>
        {STEPS.map(name => (
          <MaterialPage
            key={name}
            name={name}
            width={pageWidth}
            hidden={!expanded}
          />
        ))}
      </Animated.ScrollView>
      <Animated.View
        style={[styles.fade, fadeStyle]}
        pointerEvents="none"
        testID="passage-fade"
      />
    </>
  );
}
