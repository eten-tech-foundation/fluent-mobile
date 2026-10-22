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
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { ProgressRing } from '../../../components/ui/ProgressRing';
import { RoundButton } from '../../../components/ui/RoundButton';
import { VerseChip } from '../../../components/ui/VerseChip';
import { useHaptics } from '../../../hooks/useHaptics';
import {
  usePassage,
  type Passage,
  type PassageTake,
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
/** Round button width; the title starts after Back, then slides over. */
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
  const [actions, setActions] = useState(0);
  const [panel, setPanel] = useState(0);
  const progress = useSharedValue(0);
  const scriptRef = useRef<ScrollView>(null);

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

  const settled = useCallback(() => haptics.press(), [haptics]);
  const animateTo = useCallback(
    (open: boolean, velocity = 0) => {
      setExpanded(open);
      // The hero previews the first verses, wherever the player was scrolled.
      if (!open) scriptRef.current?.scrollTo({ y: 0, animated: true });
      const target = open ? 1 : 0;
      const done = (finished?: boolean) => {
        'worklet';
        if (finished && open) scheduleOnRN(settled);
      };
      progress.value = reduceMotion
        ? withTiming(target, { duration: 0 }, done)
        : withSpring(target, { ...SHEET_SPRING, velocity }, done);
    },
    [progress, reduceMotion, settled],
  );
  const open = useCallback(
    (record: boolean) => {
      setRecordMode(record);
      animateTo(true);
    },
    [animateTo],
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
    // The player header's title: beside Back in the hero, then it slides to
    // the left edge as Back fades.
    overlineSlot: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: ROUND_BUTTON + t.spacing.md,
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
    actionRow: { flexDirection: 'row', gap: t.spacing.md },
    primary: { flex: 1 },
    meta: { ...t.type.meta, color: t.roles.fgSecondary },
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
    key: { flex: 1 },
  }));

  const frameStyle = useAnimatedStyle(() =>
    measured
      ? { height: collapsed + range * Math.min(1, progress.value) }
      : { height: 0 },
  );
  // Back clears out before the title slides across where it was.
  const backStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12], [1, 0], 'clamp'),
  }));
  const closeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.6, 1], [0, 1], 'clamp'),
  }));
  const titleSlide = ROUND_BUTTON + spacing.md;
  const titleStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0.08, 0.5],
          [titleSlide, 0],
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
          <Animated.ScrollView
            ref={scriptRef}
            style={[styles.layer, scriptStyle]}
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
          </Animated.ScrollView>
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
            {/* Like a music app: one labelled primary between plain circles.
                Recording is the job here; everything below is listening. */}
            <View style={styles.actionRow}>
              <RoundButton
                variant="flat"
                icon={PlayFill}
                accessibilityLabel="Listen"
                onPress={() => open(false)}
                testID="passage-listen"
              />
              <RoundButton
                variant="flat"
                icon={RecordIcon}
                label={passage.takes.length > 0 ? 'Record a take' : 'Record'}
                accessibilityLabel={
                  passage.takes.length > 0 ? 'Record a take' : 'Record'
                }
                onPress={() => open(true)}
                style={styles.primary}
                testID="passage-record"
              />
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
              onLayout={measure(setHeader)}
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
                style={[styles.overlineSlot, titleStyle]}
                pointerEvents="none"
              >
                <Text
                  style={styles.overline}
                  numberOfLines={1}
                  accessibilityRole="header"
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
          recordMode={recordMode}
          takes={passage.takes}
          onOpenDrafting={onOpenDrafting}
        />
        <ColorModeScope value="hardware">
          <HardwarePanel
            recordMode={recordMode}
            onRecordModeChange={setRecordMode}
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

function Footer({
  recordMode,
  takes,
  onOpenDrafting,
}: {
  recordMode: boolean;
  takes: PassageTake[];
  onOpenDrafting: () => void;
}) {
  const styles = useThemedStyles(t => ({
    footer: {
      backgroundColor: t.roles.bgDefault,
      paddingHorizontal: t.spacing.xl,
      paddingVertical: t.spacing.md,
    },
  }));
  if (!recordMode || takes.length === 0) return null;
  return (
    <View style={styles.footer}>
      <Takes takes={takes} onPress={onOpenDrafting} />
    </View>
  );
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
}: {
  reference: string;
  progress: SharedValue<number>;
  hidden: boolean;
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
        {STEPS.map(name => (
          <View key={name} style={styles.row}>
            <View style={styles.text}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.meta}>{reference}</Text>
            </View>
            <ProgressRing value={0} accessibilityLabel={`${name} listened`}>
              <RoundButton
                icon={ArrowRight}
                accessibilityLabel={`Play ${name}`}
                disabled
              />
            </ProgressRing>
          </View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}
