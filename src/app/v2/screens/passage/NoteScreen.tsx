import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from '../../../../components/ui/icons';
import { PageDots } from '../../../../components/ui/PageDots';
import { RoundButton } from '../../../../components/ui/RoundButton';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';
import type { PassageNote } from './noteMatch';

/** Past this many notes the dots don't fit beside the quote; count instead. */
const MAX_DOTS = 7;
/** Figma's note fades out over its last two lines. */
const FADE_LINES = 2;
/** The blue grows out from the tapped phrase, then shrinks back (Q25). */
const OPEN_MS = 380;
const CLOSE_MS = 300;
/** How far the title, note and footer rise as they arrive. */
const RISE = 12;

/**
 * Figma's Understanding screen (2440:31081): a translation note on the blue
 * (Accent) screen, the sheet picks the mode. The phrase is the title, the
 * note reads under the reading fade, and swiping, Previous and Next step
 * through the passage's notes. Covers the player down to its keys.
 *
 * The blue grows out of the tapped phrase as a circle, and the title, note
 * and footer rise in behind it; closing runs it backwards.
 */
export function NoteScreen({
  notes,
  index,
  bottom,
  from,
  closing,
  onIndexChange,
  onClose,
  onClosed,
}: {
  notes: PassageNote[];
  index: number;
  /** The keys' height; the note stops above them. */
  bottom: number;
  /** Where the phrase was tapped, on screen; the blue grows from here. */
  from: { x: number; y: number } | null;
  /** Run the close; `onClosed` follows once the blue is gone. */
  closing: boolean;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  const { motion, fontScale, roles } = useTheme();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<ScrollView>(null);
  const screenRef = useRef<View>(null);
  // The window until measured, so the first frame's circle already covers
  // and the pager mounts on the tapped note.
  const win = useWindowDimensions();
  const [width, setWidth] = useState(win.width);
  const [first] = useState(index);
  const settle = (x: number) => {
    const to = Math.min(
      Math.max(Math.round(x / (width || 1)), 0),
      notes.length - 1,
    );
    if (to !== index) onIndexChange(to);
  };
  const [frame, setFrame] = useState({
    x: 0,
    y: 0,
    width: win.width,
    height: win.height,
  });
  const reveal = useSharedValue(0);
  const styles = useThemedStyles(t => ({
    screen: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      overflow: 'hidden',
    },
    blue: { position: 'absolute', backgroundColor: t.roles.bgDefault },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      paddingHorizontal: t.spacing.xl,
      paddingVertical: t.spacing.md,
    },
    title: { ...t.type.overline, color: t.roles.fgPrimary, flex: 1 },
    pager: { flex: 1 },
    page: { paddingHorizontal: t.spacing.xl },
    body: { ...t.type.lead, color: t.roles.fgPrimary },
    end: { height: FADE_LINES * t.type.lead.lineHeight },
    fade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: FADE_LINES * t.type.lead.lineHeight,
      experimental_backgroundImage: t.fade.reading,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.spacing.md,
      paddingHorizontal: t.spacing.lg + t.spacing.xl,
      paddingTop: t.spacing.lg,
      paddingBottom: t.spacing.xxl + t.spacing.lg,
    },
    quote: { ...t.type.title, color: t.roles.fgPrimary, flex: 1 },
    count: { ...t.type.meta, color: t.roles.fgSecondary },
  }));

  // Mounts on the tapped note (a scroll before the pages are laid out is
  // dropped); after that Previous and Next turn pages the way a swipe does.
  const shown = useRef(index);
  useEffect(() => {
    const turned = shown.current !== index;
    shown.current = index;
    pagerRef.current?.scrollTo({
      x: index * width,
      animated: turned && !reduceMotion,
    });
  }, [index, width, reduceMotion]);

  useEffect(() => {
    const { x1, y1, x2, y2 } = motion.easeStandard;
    const done = (finished?: boolean) => {
      'worklet';
      if (finished && closing) scheduleOnRN(onClosed);
    };
    reveal.value = withTiming(
      closing ? 0 : 1,
      {
        duration: reduceMotion
          ? motion.releaseMs
          : closing
          ? CLOSE_MS
          : OPEN_MS,
        easing: Easing.bezier(x1, y1, x2, y2),
      },
      done,
    );
    // Only opening and closing animate; the callback can change freely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing, reduceMotion, reveal, motion]);

  // A circle that covers the screen from the tapped point, in local terms.
  const cx = (from?.x ?? frame.x + frame.width / 2) - frame.x;
  const cy = (from?.y ?? frame.y + frame.height / 3) - frame.y;
  const radius = Math.hypot(
    Math.max(cx, frame.width - cx),
    Math.max(cy, frame.height - cy),
  );
  const blueStyle = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: reveal.value }
      : { transform: [{ scale: reveal.value }] },
  );
  // The title, then the note, then the footer rise in behind the blue.
  const lift = reduceMotion ? 0 : RISE;
  const headerStyle = useAnimatedStyle(() => riseIn(reveal.value, 0.45, lift));
  const bodyStyle = useAnimatedStyle(() => riseIn(reveal.value, 0.55, lift));
  const rowStyle = useAnimatedStyle(() => riseIn(reveal.value, 0.6, lift));

  const note = notes[index];
  if (!note) return null;

  return (
    <View
      ref={screenRef}
      style={[styles.screen, { bottom, paddingTop: insets.top }]}
      pointerEvents={closing ? 'none' : 'auto'}
      onLayout={() =>
        screenRef.current?.measureInWindow((x, y, w, h) =>
          setFrame({ x, y, width: w, height: h }),
        )
      }
      testID="passage-note"
    >
      <Animated.View
        style={[
          styles.blue,
          {
            left: cx - radius,
            top: cy - radius,
            width: radius * 2,
            height: radius * 2,
            borderRadius: radius,
            backgroundColor: roles.bgDefault,
          },
          blueStyle,
        ]}
      />
      <Animated.View style={[styles.header, headerStyle]}>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {note.quote}
        </Text>
        <RoundButton
          variant="flat"
          icon={X}
          accessibilityLabel="Close the note"
          onPress={onClose}
          testID="passage-note-close"
        />
      </Animated.View>
      <Animated.View
        style={[styles.pager, bodyStyle]}
        onLayout={e => setWidth(Math.round(e.nativeEvent.layout.width))}
      >
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: first * width, y: 0 }}
          onMomentumScrollEnd={e => settle(e.nativeEvent.contentOffset.x)}
          // A slow drag can stop without momentum, so it settles here.
          onScrollEndDrag={e => {
            if (!e.nativeEvent.velocity?.x)
              settle(e.nativeEvent.contentOffset.x);
          }}
          testID="passage-note-pager"
        >
          {/* Only the pages near this one are built; a passage can have
              a couple hundred notes. Two each side, so a drag that
              interrupts a snap still lands on a built page. */}
          {notes.map((n, i) =>
            Math.abs(i - index) > 2 ? (
              <View key={n.id} style={{ width }} />
            ) : (
              <ScrollView
                key={n.id}
                style={{ width }}
                contentContainerStyle={styles.page}
                showsVerticalScrollIndicator={false}
                importantForAccessibility={
                  i === index ? 'auto' : 'no-hide-descendants'
                }
              >
                <Text
                  style={styles.body}
                  maxFontSizeMultiplier={fontScale.readingMax}
                >
                  {n.body}
                </Text>
                {/* Room to scroll the last lines out from under the fade. */}
                <View style={styles.end} />
              </ScrollView>
            ),
          )}
        </ScrollView>
        <View style={styles.fade} pointerEvents="none" />
      </Animated.View>
      <Animated.View style={[styles.row, rowStyle]}>
        <Text style={styles.quote} numberOfLines={1}>
          “{note.quote}”
        </Text>
        {notes.length > MAX_DOTS ? (
          <Text style={styles.count}>
            {index + 1} of {notes.length}
          </Text>
        ) : (
          <PageDots
            count={notes.length}
            index={index}
            accessibilityLabel={`Note ${index + 1} of ${notes.length}`}
            testID="passage-note-dots"
          />
        )}
      </Animated.View>
    </View>
  );
}

function riseIn(reveal: number, start: number, lift: number) {
  'worklet';
  return {
    opacity: interpolate(reveal, [start, 1], [0, 1], 'clamp'),
    transform: [
      { translateY: interpolate(reveal, [start, 1], [lift, 0], 'clamp') },
    ],
  };
}
