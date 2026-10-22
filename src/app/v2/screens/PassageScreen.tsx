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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { HardwarePanel } from '../../../components/ui/HardwarePanel';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  EjectFill,
  PlayFill,
  RecordFill,
  SkipBackFill,
  SkipForwardFill,
  type NextIconProps,
} from '../../../components/ui/icons';
import { Key } from '../../../components/ui/Key';
import { PageDots } from '../../../components/ui/PageDots';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { ProgressRing } from '../../../components/ui/ProgressRing';
import { RoundButton } from '../../../components/ui/RoundButton';
import { VerseChip } from '../../../components/ui/VerseChip';
import { Waveform, type WaveformVerse } from '../../../components/ui/Waveform';
import { useHaptics } from '../../../hooks/useHaptics';
import {
  usePassage,
  type Passage,
  type PassageTake,
  type PassageVerse,
} from '../../../hooks/usePassage';
import { hrefs } from '../../../navigation/hrefs';
import { formatLastActivity } from '../../../utils/formatLastActivity';
import {
  parseRequiredNumber,
  parseRequiredString,
} from '../../../navigation/routeParams';
import {
  ColorModeScope,
  useTheme,
  useThemedStyles,
} from '../../../theme/useTheme';

/** Firm, barely any bounce; a drag's release speed carries into it. */
const SHEET_SPRING = { damping: 26, stiffness: 220, mass: 1 };
/** How far the hero drags before a release opens or closes it. */
const SNAP_AT = 0.35;
const FLING = 500;
/** The hero shows this many lines of the script at body size. */
const PREVIEW_LINES = 4;
/** Round button width; the centered title stays clear of the corners. */
const ROUND_BUTTON = 48;

/**
 * FIA listening steps. Their audio has no source yet (Q11 in
 * docs/features/next-ui-redesign/open-questions.md).
 */
const STEPS = [
  'Hear & Heart',
  'Setting the Stage',
  'Defining the Scenes',
  'Embodying the Text',
  'Filling the Gaps',
  'Speaking the Word',
];

type Ready = Extract<Passage, { status: 'ready' }>;

/**
 * Next passage page: a dark hero with the script, Listen and Record, and the
 * takes, which grows into the full player; then the listening materials as
 * Figma's passage rows. Until the player is wired, its keys open Legacy
 * drafting at this passage.
 */
export default function PassageScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams<{
    chapterId?: string;
    anchorVerse?: string;
    projectUnitId?: string;
    chapterName?: string;
    projectName?: string;
    language?: string;
  }>();
  const chapterId = parseRequiredNumber(raw.chapterId, 'chapterId');
  const anchorVerse = parseRequiredNumber(raw.anchorVerse, 'anchorVerse');
  const projectUnitId = parseRequiredNumber(raw.projectUnitId, 'projectUnitId');
  const chapterName = parseRequiredString(raw.chapterName, 'chapterName');
  const projectName = parseRequiredString(raw.projectName, 'projectName');
  const language = parseRequiredString(raw.language, 'language');
  const { passage, download, downloadState } = usePassage(
    chapterId,
    anchorVerse,
    projectUnitId,
  );
  const styles = useThemedStyles(t => ({
    screen: { flex: 1, backgroundColor: t.roles.bgDefault },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    message: { ...t.type.body, color: t.roles.fgPrimary },
  }));

  const openDrafting = useCallback(
    () =>
      router.push(
        hrefs.verseDetail({
          chapterId,
          chapterName,
          projectName,
          language,
          recoverVerse: anchorVerse,
        }),
      ),
    [router, chapterId, chapterName, projectName, language, anchorVerse],
  );

  if (passage.status === 'loading') {
    return (
      <View style={styles.screen}>
        <LoadingSpinner />
      </View>
    );
  }
  if (passage.status === 'missing') {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.message}>This passage couldn't be found.</Text>
      </View>
    );
  }
  return (
    <View style={styles.screen}>
      <ColorModeScope value="canvas">
        <Sheet
          passage={passage}
          onBack={() => router.back()}
          onOpenDrafting={openDrafting}
          onDownload={download}
          downloadState={downloadState}
        />
      </ColorModeScope>
    </View>
  );
}

/**
 * The hero and the player are one sheet. Opening it keeps the script where
 * it is and shows more of it, shrinks the title into the header's overline,
 * then raises the keys from below the screen.
 */
function Sheet({
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
    key: { flex: 1 },
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
  // One line deep, at whatever size the script is.
  const fadeSmall = small.lineHeight * capped;
  const fadeLarge = large.lineHeight * capped;
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
        <ColorModeScope value="hardware">
          <HardwarePanel
            recordMode={recordMode}
            onRecordModeChange={changeMode}
          >
            {recordMode ? (
              <>
                <Key
                  icon={RecordFill}
                  accessibilityLabel="Record in drafting"
                  onPress={onOpenDrafting}
                  style={styles.key}
                />
                <Key
                  icon={PlayFill}
                  accessibilityLabel="Play takes in drafting"
                  onPress={onOpenDrafting}
                  style={styles.key}
                />
                <Key
                  icon={EjectFill}
                  accessibilityLabel="Eject"
                  disabled
                  style={styles.key}
                />
              </>
            ) : (
              <>
                <Key
                  icon={PlayFill}
                  accessibilityLabel="Listen in drafting"
                  onPress={onOpenDrafting}
                  style={styles.key}
                />
                <Key
                  icon={SkipBackFill}
                  accessibilityLabel="Previous verse"
                  disabled
                  style={styles.key}
                />
                <Key
                  icon={SkipForwardFill}
                  accessibilityLabel="Next verse"
                  disabled
                  style={styles.key}
                />
              </>
            )}
          </HardwarePanel>
        </ColorModeScope>
      </Animated.View>
    </View>
  );
}

/**
 * Under the script, as in the Figma Listen player: the waveform with its verse
 * chips, then the reference and which page of the script is showing. Record
 * mode adds the takes.
 */
function Footer({
  passage,
  page,
  recordMode,
  takes,
  onOpenDrafting,
}: {
  passage: Ready;
  page: number;
  recordMode: boolean;
  takes: PassageTake[];
  onOpenDrafting: () => void;
}) {
  const styles = useThemedStyles(t => ({
    footer: {
      backgroundColor: t.roles.bgDefault,
      paddingHorizontal: t.spacing.xl,
      paddingVertical: t.spacing.md,
      gap: t.spacing.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    reference: { ...t.type.label, color: t.roles.fgPrimary },
  }));
  const pages = 1 + STEPS.length;
  const name = page === 0 ? passage.reference : STEPS[page - 1];
  return (
    <View style={styles.footer}>
      {recordMode ? (
        <Takes takes={takes} onPress={onOpenDrafting} />
      ) : (
        // Materials have no audio yet, so their waveform stays empty.
        <Waveform
          verses={page === 0 ? scriptBars(passage.verses) : []}
          progress={0}
          accessibilityLabel={`${name} playback`}
          testID="passage-waveform"
        />
      )}
      <View style={styles.row}>
        <Text style={styles.reference} numberOfLines={1}>
          {name}
        </Text>
        <PageDots
          count={pages}
          index={page}
          accessibilityLabel={`${name}, ${page + 1} of ${pages}`}
          testID="passage-pages"
        />
      </View>
    </View>
  );
}

/** A listening material in the player. Its audio has no source yet (Q11). */
function MaterialPage({
  name,
  width,
  hidden,
}: {
  name: string;
  width: number;
  hidden: boolean;
}) {
  const styles = useThemedStyles(t => ({
    page: { gap: t.spacing.md },
    name: { ...t.type.heading, color: t.roles.fgPrimary },
    note: { ...t.type.label, color: t.roles.fgSecondary },
  }));
  return (
    <View
      style={[styles.page, { width }]}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.note}>This step's audio isn't connected yet.</Text>
    </View>
  );
}

/** Waveform bar heights in pt (Waveform's row is 52). */
const BAR_MIN = 6;
const BAR_MAX = 52;

/**
 * Stand-in levels until playback is wired: a bar per word, taller for longer
 * words, so each verse's chip and segment follow its length.
 */
function scriptBars(verses: PassageVerse[]): WaveformVerse[] {
  return verses
    .filter(v => v.text)
    .map(v => ({
      verse: v.verseNumber,
      bars: v.text
        .split(/\s+/)
        .filter(Boolean)
        .map(word => Math.min(BAR_MAX, BAR_MIN + word.length * 5)),
    }));
}

/** Like a music app's "Updated 3d ago": how many takes, and when. */
function takesLine(passage: Ready) {
  const { takes, recordedStatus } = passage;
  if (takes.length === 0) {
    if (recordedStatus === 'recorded') return 'Recorded verse by verse';
    if (recordedStatus === 'partial') return 'Partly recorded';
    return 'Not recorded yet';
  }
  const latest = takes.reduce((a, b) => (b.recordedAt > a.recordedAt ? b : a));
  const when = formatLastActivity(latest.recordedAt);
  const count = `${takes.length} ${takes.length === 1 ? 'take' : 'takes'}`;
  return when ? `${count} · ${when}` : count;
}

function RecordIcon({ size }: NextIconProps) {
  const theme = useTheme();
  return <RecordFill color={theme.roles.accentRecord} size={size} />;
}

/** Takes of the whole passage as numbered chips, like Figma's Recorder. */
function Takes({
  takes,
  onPress,
}: {
  takes: PassageTake[];
  onPress: () => void;
}) {
  const styles = useThemedStyles(t => ({
    row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
    label: { ...t.type.meta, color: t.roles.fgSecondary },
  }));
  if (takes.length === 0) return null;
  const selected = takes.find(take => take.selected);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${takes.length} ${
        takes.length === 1 ? 'take' : 'takes'
      }${selected ? `, take ${selected.takeNumber} selected` : ''}`}
      style={styles.row}
      testID="passage-takes"
    >
      <Text style={styles.label}>Takes</Text>
      {takes.map(take => (
        <VerseChip
          key={take.id}
          verse={take.takeNumber}
          current={take.selected}
        />
      ))}
    </Pressable>
  );
}

/**
 * Figma's passage rows: title and reference, a Progress ring round button.
 * As the player opens they fade and sink, so the light page reads as
 * turning into the Hardware panel rising under it.
 */
function Materials({
  reference,
  progress,
  hidden,
  onOpen,
}: {
  reference: string;
  progress: SharedValue<number>;
  hidden: boolean;
  /** Opens the player on that material's page. */
  onOpen: (step: number) => void;
}) {
  const sinkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.2, 0.55], [1, 0], 'clamp'),
    transform: [
      { translateY: interpolate(progress.value, [0, 0.6], [0, 32], 'clamp') },
    ],
  }));
  const styles = useThemedStyles(t => ({
    page: { flex: 1 },
    list: { paddingHorizontal: t.spacing.xl, paddingBottom: t.spacing.xxl },
    head: { paddingTop: t.spacing.xl, paddingBottom: t.spacing.md },
    heading: { ...t.type.title, color: t.roles.fgPrimary },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.lg,
      paddingVertical: t.spacing.xs,
    },
    text: { flex: 1, gap: t.spacing.xxs },
    name: { ...t.type.body, color: t.roles.fgSecondary },
    meta: { ...t.type.meta, color: t.roles.fgSecondary },
  }));
  return (
    <Animated.View
      style={[styles.page, sinkStyle]}
      pointerEvents={hidden ? 'none' : 'auto'}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.head}>
          <Text style={styles.heading} accessibilityRole="header">
            Listening materials
          </Text>
          <Text style={styles.meta}>Step audio isn't connected yet</Text>
        </View>
        {STEPS.map((name, step) => (
          <View key={name} style={styles.row}>
            <View style={styles.text}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.meta}>{reference}</Text>
            </View>
            <ProgressRing value={0} accessibilityLabel={`${name} listened`}>
              <RoundButton
                icon={ArrowRight}
                accessibilityLabel={`Open ${name}`}
                onPress={() => onOpen(step)}
                testID={`passage-step-${step}`}
              />
            </ProgressRing>
          </View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}
