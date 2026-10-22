import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  PixelRatio,
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  ArrowDown,
  ArrowLeft,
  PlayFill,
  RecordFill,
  type NextIconProps,
} from '../../../../components/ui/icons';
import { RoundButton } from '../../../../components/ui/RoundButton';
import { useHaptics } from '../../../../hooks/useHaptics';
import type { usePassage } from '../../../../hooks/usePassage';
import {
  ColorModeScope,
  useTheme,
  useThemedStyles,
} from '../../../../theme/useTheme';
import { Footer } from './Footer';
import { MaterialPage } from './MaterialPage';
import { Materials } from './Materials';
import { PlayerKeys } from './PlayerKeys';
import { STEPS, type Ready } from './steps';
import { takesLine } from './Takes';

/** Firm, barely any bounce; a drag's release speed carries into it. */
const SHEET_SPRING = { damping: 26, stiffness: 220, mass: 1 };
/** How far the hero drags before a release opens or closes it. */
const SNAP_AT = 0.35;
const FLING = 500;
/** The hero shows this many lines of the script at body size. */
const PREVIEW_LINES = 4;
const PLAYER_FADE_LINES = 2;
/** Round button width; the centered title stays clear of the corners. */
const ROUND_BUTTON = 48;

/**
 * The hero and the player are one sheet. Opening it keeps the script where
 * it is and grows it to reading size, slides the title over to the player
 * header, then raises the keys from below the screen.
 */
export function Sheet({
  passage,
  onBack,
  onOpenDrafting,
  onDownload,
  downloadState,
}: {
  passage: Ready;
  onBack: () => void;
  onOpenDrafting: () => void;
  onDownload: () => void;
  downloadState: ReturnType<typeof usePassage>['downloadState'];
}) {
  const theme = useTheme();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [recordMode, setRecordMode] = useState(false);
  const [container, setContainer] = useState(0);
  const [header, setHeader] = useState(0);
  const [headerWidth, setHeaderWidth] = useState(0);
  const [titleWidth, setTitleWidth] = useState(0);
  const [actions, setActions] = useState(0);
  const [panel, setPanel] = useState(0);
  const progress = useSharedValue(0);
  const scriptRef = useRef<ScrollView>(null);
  const pagerRef = useRef<ScrollView>(null);
  /** 0 is the script; then one page per listening material. */
  const [page, setPage] = useState(0);

  const { spacing } = theme;
  // The script grows from body size in the hero to reading size in the
  // player. maxFontSizeMultiplier caps the glyphs but Android scales
  // lineHeight by the full font scale, so cap that by hand (figma-to-component.md).
  const small = theme.type.body;
  const large = theme.type.reading;
  const fontScale = PixelRatio.getFontScale();
  const capped = Math.min(fontScale, theme.fontScale.readingMax);
  const lineProp = (lineHeight: number) => (lineHeight * capped) / fontScale;
  const smallLine = lineProp(small.lineHeight);
  const largeLine = lineProp(large.lineHeight);
  const headerBottom = insets.top + header;
  const scriptTop = headerBottom + spacing.sm;
  const preview = PREVIEW_LINES * small.lineHeight * capped;
  const actionsTop = scriptTop + preview + spacing.lg;
  const collapsed = actionsTop + actions + spacing.xl;
  const measured = header > 0 && actions > 0 && container > 0;
  const range = Math.max(1, container - collapsed);
  const fullScript = Math.max(preview, container - headerBottom - panel);
  const pageWidth = headerWidth;
  const goToPage = useCallback(
    (index: number) => {
      setPage(index);
      pagerRef.current?.scrollTo({ x: index * pageWidth, animated: false });
    },
    [pageWidth],
  );

  const settled = useCallback(() => haptics.press(), [haptics]);
  const animateTo = useCallback(
    (open: boolean, velocity = 0) => {
      setExpanded(open);
      // The hero previews the first verses, wherever the player was scrolled.
      if (!open) {
        scriptRef.current?.scrollTo({ y: 0, animated: true });
        goToPage(0);
      }
      const target = open ? 1 : 0;
      const done = (finished?: boolean) => {
        'worklet';
        if (finished && open) scheduleOnRN(settled);
      };
      progress.value = reduceMotion
        ? withTiming(target, { duration: 0 }, done)
        : withSpring(target, { ...SHEET_SPRING, velocity }, done);
    },
    [progress, reduceMotion, settled, goToPage],
  );
  /** Opens on the script, or on a listening material's page. */
  const open = useCallback(
    (record: boolean, atPage = 0) => {
      setRecordMode(record);
      goToPage(record ? 0 : atPage);
      animateTo(true);
    },
    [animateTo, goToPage],
  );
  // Recording is always of the script.
  const changeMode = useCallback(
    (record: boolean) => {
      setRecordMode(record);
      if (record) goToPage(0);
    },
    [goToPage],
  );

  useEffect(() => {
    if (!expanded) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      animateTo(false);
      return true;
    });
    return () => sub.remove();
  }, [expanded, animateTo]);

  // The collapsed hero drags open; once open, only the header drags it
  // closed, so the script keeps its own scrolling.
  const drag = (enabled: boolean) =>
    Gesture.Pan()
      .enabled(enabled)
      .activeOffsetY([-12, 12])
      .onUpdate(e => {
        const start = expanded ? 1 : 0;
        progress.value = Math.min(
          1,
          Math.max(0, start - e.translationY / range),
        );
      })
      .onEnd(e => {
        const shouldOpen = expanded
          ? progress.value > 1 - SNAP_AT && e.velocityY < FLING
          : progress.value > SNAP_AT || e.velocityY < -FLING;
        scheduleOnRN(animateTo, shouldOpen, -e.velocityY / range);
      });

  // Styles resolve in Canvas: the screen wraps the sheet in it.
  const styles = useThemedStyles(t => ({
    sheet: { flex: 1 },
    frame: { overflow: 'hidden', backgroundColor: t.roles.bgDefault },
    layer: {
      position: 'absolute',
      left: t.spacing.xl,
      right: t.spacing.xl,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      paddingVertical: t.spacing.md,
    },
    corner: { position: 'absolute', top: t.spacing.md, right: 0 },
    // Centered in the hero; slides to the left edge as the player arrives.
    overlineSlot: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      justifyContent: 'center',
    },
    overline: { ...t.type.overline, color: t.roles.fgPrimary },
    reading: { ...t.type.reading, color: t.roles.fgPrimary },
    // No lineHeight, so it follows the script's as that grows.
    verseNumber: {
      fontFamily: t.type.label.fontFamily,
      fontSize: t.type.label.fontSize,
      fontWeight: t.type.label.fontWeight,
      color: t.roles.fgSecondary,
    },
    note: { ...t.type.label, color: t.roles.fgSecondary },
    actions: { gap: t.spacing.lg },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing.md,
    },
    primary: { paddingHorizontal: t.spacing.xl },
    // Record's ring: accent/record around the dot, like the Soft rim.
    recordRing: {
      borderRadius: t.radius.full,
      borderWidth: t.stroke[2],
      borderColor: t.roles.accentRecord,
      padding: t.spacing.xxs,
    },
    meta: {
      ...t.type.meta,
      color: t.roles.fgSecondary,
      textAlign: 'center',
    },
    handle: { alignItems: 'center', paddingVertical: t.spacing.sm },
    grip: {
      width: 36,
      height: 4,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.fgSecondary,
    },
    bottom: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
    },
    // Figma fade/reading over the last line, so the script trails off.
    fade: {
      position: 'absolute',
      left: 0,
      right: 0,
      experimental_backgroundImage: t.fade.reading,
    },
  }));

  const frameStyle = useAnimatedStyle(() =>
    measured
      ? { height: collapsed + range * Math.min(1, progress.value) }
      : { height: 0 },
  );
  const backStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12], [1, 0], 'clamp'),
  }));
  const closeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.6, 1], [0, 1], 'clamp'),
  }));
  // Clear of Back and Close either side while it's centered.
  const titleMax = Math.max(0, headerWidth - 2 * (ROUND_BUTTON + spacing.md));
  const titleCenter = (headerWidth - Math.min(titleWidth, titleMax)) / 2;
  const titleReady = headerWidth > 0 && titleWidth > 0;
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleReady ? 1 : 0,
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0.3, 0.8],
          [titleCenter, 0],
          'clamp',
        ),
      },
    ],
  }));
  const scriptStyle = useAnimatedStyle(() => ({
    top: interpolate(
      progress.value,
      [0, 1],
      [scriptTop, headerBottom],
      'clamp',
    ),
    height: interpolate(progress.value, [0, 1], [preview, fullScript], 'clamp'),
  }));
  // One line deep in the hero; two in the player, so reading eases out
  // well before the waveform.
  const fadeSmall = small.lineHeight * capped;
  const fadeLarge = PLAYER_FADE_LINES * large.lineHeight * capped;
  const fadeStyle = useAnimatedStyle(() => {
    const height = interpolate(
      progress.value,
      [0, 1],
      [fadeSmall, fadeLarge],
      'clamp',
    );
    const top = interpolate(
      progress.value,
      [0, 1],
      [scriptTop + preview, headerBottom + fullScript],
      'clamp',
    );
    return { top: top - height, height };
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
  // Gone before the growing script reaches them.
  const actionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12], [1, 0], 'clamp'),
    transform: [
      {
        translateY: interpolate(progress.value, [0, 0.4], [0, 24], 'clamp'),
      },
    ],
  }));
  // Overlaps the materials fading out on the same cream, so the keys come
  // up out of the page instead of arriving after it.
  const bottomStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.45, 0.8], [0, 1], 'clamp'),
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0.4, 1],
          [(panel || container) * 0.4, 0],
          'clamp',
        ),
      },
    ],
  }));

  const heroTitle = passage.title ?? passage.reference;
  const measure = (set: (h: number) => void) => (e: LayoutChangeEvent) =>
    set(Math.round(e.nativeEvent.layout.height));

  return (
    <View style={styles.sheet} onLayout={measure(setContainer)}>
      <GestureDetector gesture={drag(!expanded)}>
        <Animated.View style={[styles.frame, frameStyle]}>
          {/* Swipes from the script through the listening materials. */}
          <Animated.ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            style={[styles.layer, scriptStyle]}
            scrollEnabled={expanded && !recordMode}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={e =>
              setPage(
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
                  onPress={expanded ? undefined : () => open(false)}
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
                    : 'The text for this passage isn’t on this phone yet.'}
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
          <Animated.View
            style={[
              styles.layer,
              styles.actions,
              { top: actionsTop },
              actionsStyle,
            ]}
            pointerEvents={expanded ? 'none' : 'auto'}
            importantForAccessibility={
              expanded ? 'no-hide-descendants' : 'auto'
            }
            onLayout={measure(setActions)}
          >
            <Text style={styles.meta} testID="passage-takes-meta">
              {takesLine(passage)}
            </Text>
            {/* Like a music app: one labelled primary, plain circles beside. */}
            <View style={styles.actionRow}>
              <RoundButton
                variant="flat"
                icon={PlayFill}
                label="Listen"
                accessibilityLabel="Listen"
                onPress={() => open(false)}
                style={styles.primary}
                testID="passage-listen"
              />
              <View style={styles.recordRing}>
                <RoundButton
                  variant="flat"
                  icon={RecordIcon}
                  accessibilityLabel={
                    passage.takes.length > 0 ? 'Record a take' : 'Record'
                  }
                  onPress={() => open(true)}
                  testID="passage-record"
                />
              </View>
              {passage.downloaded ? null : (
                <RoundButton
                  variant="flat"
                  icon={ArrowDown}
                  accessibilityLabel={
                    downloadState === 'downloading'
                      ? 'Downloading the text'
                      : 'Download the text'
                  }
                  onPress={onDownload}
                  disabled={downloadState === 'downloading'}
                  testID="passage-download"
                />
              )}
            </View>
            <Pressable
              onPress={() => open(false)}
              accessibilityRole="button"
              accessibilityLabel="Open the full player"
              hitSlop={12}
              style={styles.handle}
              testID="passage-handle"
            >
              <View style={styles.grip} />
            </Pressable>
          </Animated.View>
          <GestureDetector gesture={drag(expanded)}>
            <View
              style={[styles.layer, styles.header, { top: insets.top }]}
              onLayout={e => {
                setHeader(Math.round(e.nativeEvent.layout.height));
                setHeaderWidth(Math.round(e.nativeEvent.layout.width));
              }}
            >
              <Animated.View
                style={backStyle}
                pointerEvents={expanded ? 'none' : 'auto'}
                importantForAccessibility={
                  expanded ? 'no-hide-descendants' : 'auto'
                }
              >
                <RoundButton
                  variant="flat"
                  icon={ArrowLeft}
                  accessibilityLabel="Back"
                  onPress={onBack}
                  testID="passage-back"
                />
              </Animated.View>
              <Animated.View
                style={[
                  styles.overlineSlot,
                  { maxWidth: titleMax },
                  titleStyle,
                ]}
                pointerEvents="none"
              >
                <Text
                  style={styles.overline}
                  numberOfLines={1}
                  accessibilityRole="header"
                  onLayout={e =>
                    setTitleWidth(Math.round(e.nativeEvent.layout.width))
                  }
                >
                  {heroTitle}
                </Text>
              </Animated.View>
              <Animated.View
                style={[styles.corner, closeStyle]}
                pointerEvents={expanded ? 'auto' : 'none'}
              >
                {expanded ? (
                  <RoundButton
                    variant="flat"
                    icon={ArrowDown}
                    accessibilityLabel="Close the player"
                    onPress={() => animateTo(false)}
                    testID="passage-close"
                  />
                ) : null}
              </Animated.View>
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
      <ColorModeScope value="hardware">
        <Materials
          reference={passage.reference}
          progress={progress}
          hidden={expanded}
          onOpen={step => open(false, step + 1)}
        />
      </ColorModeScope>
      <Animated.View
        style={[styles.bottom, bottomStyle]}
        pointerEvents={expanded ? 'auto' : 'none'}
        importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
        onLayout={measure(setPanel)}
        testID="passage-player"
      >
        <Footer
          passage={passage}
          page={page}
          recordMode={recordMode}
          takes={passage.takes}
          onOpenDrafting={onOpenDrafting}
        />
        <PlayerKeys
          recordMode={recordMode}
          onRecordModeChange={changeMode}
          onOpenDrafting={onOpenDrafting}
        />
      </Animated.View>
    </View>
  );
}

function RecordIcon({ size }: NextIconProps) {
  const theme = useTheme();
  return <RecordFill color={theme.roles.accentRecord} size={size} />;
}
