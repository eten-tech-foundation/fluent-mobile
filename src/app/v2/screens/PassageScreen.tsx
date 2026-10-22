import React, { useCallback, useEffect, useState } from 'react';
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
/** The script shows this many reading lines before the player opens. */
const PREVIEW_LINES = 3;

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
  const [title, setTitle] = useState(0);
  const [actions, setActions] = useState(0);
  const [panel, setPanel] = useState(0);
  const progress = useSharedValue(0);

  const { spacing } = theme;
  const lineHeight = readingLineHeight(
    theme.type.reading.lineHeight,
    theme.fontScale.readingMax,
  );
  const headerBottom = insets.top + header;
  const scriptTop = headerBottom + title + spacing.lg;
  const preview = PREVIEW_LINES * lineHeight;
  const actionsTop = scriptTop + preview + spacing.lg;
  const collapsed = actionsTop + actions + spacing.xl;
  const measured = header > 0 && title > 0 && actions > 0 && container > 0;
  const range = Math.max(1, container - collapsed);
  const fullScript = Math.max(preview, container - headerBottom - panel);

  const settled = useCallback(() => haptics.press(), [haptics]);
  const animateTo = useCallback(
    (open: boolean, velocity = 0) => {
      setExpanded(open);
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
    // Starts at the left edge, where the shrinking title lands, not after
    // the faded Back button.
    overlineSlot: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 56,
      justifyContent: 'center',
    },
    overline: { ...t.type.overline, color: t.roles.fgSecondary },
    // Shrinks from its top left into the overline slot. An array, since
    // Reanimated hands the string form to Android unparsed.
    titleLayer: { transformOrigin: [0, 0, 0] },
    title: { ...t.type.heading, color: t.roles.fgPrimary },
    reading: { ...t.type.reading, color: t.roles.fgPrimary },
    verseNumber: { ...t.type.label, color: t.roles.fgSecondary },
    note: { ...t.type.label, color: t.roles.fgSecondary },
    actions: { gap: t.spacing.lg },
    actionRow: { flexDirection: 'row', gap: t.spacing.xxl },
    bottom: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
    },
    key: { flex: 1 },
  }));

  // Overline sits centered in the header; the title shrinks to its size there.
  const overlineScale =
    theme.type.overline.fontSize / theme.type.heading.fontSize;
  const overlineY = insets.top + (header - theme.type.overline.lineHeight) / 2;

  const frameStyle = useAnimatedStyle(() =>
    measured
      ? { height: collapsed + range * Math.min(1, progress.value) }
      : { height: 0 },
  );
  const backStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.3], [1, 0], 'clamp'),
  }));
  const closeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.6, 1], [0, 1], 'clamp'),
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.55, 0.85], [1, 0], 'clamp'),
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0, 1],
          [0, overlineY - headerBottom],
          'clamp',
        ),
      },
      {
        scale: interpolate(progress.value, [0, 1], [1, overlineScale], 'clamp'),
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
  const actionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.25], [1, 0], 'clamp'),
    transform: [
      {
        translateY: interpolate(progress.value, [0, 0.4], [0, 24], 'clamp'),
      },
    ],
  }));
  const bottomStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0.5, 1],
          [panel || container, 0],
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
          <Animated.View
            style={[
              styles.layer,
              styles.titleLayer,
              { top: headerBottom },
              titleStyle,
            ]}
            onLayout={measure(setTitle)}
            importantForAccessibility={
              expanded ? 'no-hide-descendants' : 'auto'
            }
          >
            <Text
              style={styles.title}
              accessibilityRole="header"
              numberOfLines={2}
            >
              {heroTitle}
            </Text>
          </Animated.View>
          <Animated.ScrollView
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
                <Text
                  style={[styles.reading, { lineHeight }]}
                  maxFontSizeMultiplier={theme.fontScale.readingMax}
                >
                  {passage.verses.map(v => (
                    <Text key={`${v.chapterNumber}:${v.verseNumber}`}>
                      <Text style={[styles.verseNumber, { lineHeight }]}>
                        {v.verseNumber}{' '}
                      </Text>
                      {v.text}{' '}
                    </Text>
                  ))}
                </Text>
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
            <View style={styles.actionRow}>
              {passage.downloaded ? null : (
                <Action
                  icon={ArrowDown}
                  label={
                    downloadState === 'downloading' ? 'Downloading' : 'Download'
                  }
                  onPress={onDownload}
                  disabled={downloadState === 'downloading'}
                  testID="passage-download"
                />
              )}
              <Action
                icon={PlayFill}
                label="Listen"
                onPress={() => open(false)}
                testID="passage-listen"
              />
              <Action
                icon={RecordIcon}
                label={passage.takes.length > 0 ? 'Record a take' : 'Record'}
                onPress={() => open(true)}
                testID="passage-record"
              />
            </View>
            <Takes takes={passage.takes} onPress={() => open(true)} />
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
                style={[styles.overlineSlot, closeStyle]}
                pointerEvents="none"
              >
                <Text
                  style={styles.overline}
                  numberOfLines={1}
                  importantForAccessibility={expanded ? 'auto' : 'no'}
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
        <Materials reference={passage.reference} />
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
      gap: t.spacing.md,
    },
    note: { ...t.type.label, color: t.roles.fgSecondary },
  }));
  return (
    <View style={styles.footer}>
      {recordMode ? <Takes takes={takes} onPress={onOpenDrafting} /> : null}
      <Text style={styles.note}>
        Playback and recording are coming to this player. For now, the keys open
        drafting at this passage.
      </Text>
    </View>
  );
}

function RecordIcon({ size }: NextIconProps) {
  const theme = useTheme();
  return <RecordFill color={theme.roles.accentRecord} size={size} />;
}

/** A Flat round button with its label, for the dark hero. */
function Action({
  icon,
  label,
  onPress,
  disabled,
  testID,
}: {
  icon: React.ComponentType<NextIconProps>;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const styles = useThemedStyles(t => ({
    action: { alignItems: 'center', gap: t.spacing.xs },
    label: { ...t.type.label, color: t.roles.fgPrimary },
  }));
  return (
    <View style={styles.action}>
      <RoundButton
        variant="flat"
        icon={icon}
        accessibilityLabel={label}
        onPress={onPress}
        disabled={disabled}
        testID={testID}
      />
      <Text style={styles.label} importantForAccessibility="no">
        {label}
      </Text>
    </View>
  );
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
 * maxFontSizeMultiplier caps the glyphs but not lineHeight, which Android
 * scales by the full font scale (docs/guides/figma-to-component.md).
 */
function readingLineHeight(lineHeight: number, max: number) {
  const scale = PixelRatio.getFontScale();
  return (lineHeight * Math.min(scale, max)) / scale;
}

/** Figma's passage rows: title and reference, a Progress ring round button. */
function Materials({ reference }: { reference: string }) {
  const styles = useThemedStyles(t => ({
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
  );
}
