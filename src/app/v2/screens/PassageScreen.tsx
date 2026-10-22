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
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { HardwarePanel } from '../../../components/ui/HardwarePanel';
import {
  ArrowDown,
  ArrowLeft,
  EjectFill,
  PlayFill,
  RecordFill,
  SkipBackFill,
  SkipForwardFill,
} from '../../../components/ui/icons';
import { Key } from '../../../components/ui/Key';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import {
  usePassage,
  type PassageTake,
  type PassageVerse,
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

/** Hero to full player. */
const SHEET_MS = 320;
/** How far the hero drags before a release opens or closes it. */
const SNAP_AT = 0.35;
const PREVIEW_LINES = 4;

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

type Ready = Extract<
  ReturnType<typeof usePassage>['passage'],
  { status: 'ready' }
>;

/**
 * Next passage page: the script and its two actions in a dark hero that
 * grows into the full player, then the passage's listening materials. Until
 * the player is wired, its keys open Legacy drafting at this passage.
 */
export default function PassageScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
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

  const [expanded, setExpanded] = useState(false);
  const [recordMode, setRecordMode] = useState(false);
  const [containerHeight, setContainerHeight] = useState(0);
  const [collapsedHeight, setCollapsedHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const progress = useSharedValue(0);

  const animateTo = useCallback(
    (open: boolean) => {
      setExpanded(open);
      progress.value = withTiming(open ? 1 : 0, {
        duration: reduceMotion ? 0 : SHEET_MS,
        easing: Easing.bezier(0.2, 0, 0, 1),
      });
    },
    [progress, reduceMotion],
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

  const styles = useThemedStyles(t => ({
    screen: { flex: 1, backgroundColor: t.roles.bgDefault },
    heroFrame: { overflow: 'hidden' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    message: { ...t.type.body, color: t.roles.fgPrimary },
  }));

  const range = Math.max(1, containerHeight - collapsedHeight);
  const heroStyle = useAnimatedStyle(() =>
    collapsedHeight > 0 && containerHeight > 0
      ? { height: collapsedHeight + range * progress.value }
      : {},
  );

  const drag = Gesture.Pan()
    .onUpdate(e => {
      const start = expanded ? 1 : 0;
      progress.value = Math.min(1, Math.max(0, start - e.translationY / range));
    })
    .onEnd(e => {
      const shouldOpen = expanded
        ? progress.value > 1 - SNAP_AT && e.velocityY < 500
        : progress.value > SNAP_AT || e.velocityY < -500;
      scheduleOnRN(animateTo, shouldOpen);
    });

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
    <View
      style={styles.screen}
      onLayout={(e: LayoutChangeEvent) =>
        setContainerHeight(Math.round(e.nativeEvent.layout.height))
      }
    >
      <ColorModeScope value="canvas">
        <Animated.View style={[styles.heroFrame, heroStyle]}>
          <Hero
            passage={passage}
            expanded={expanded}
            progress={progress}
            topInset={insets.top}
            drag={drag}
            onMeasure={setCollapsedHeight}
            onMeasureHeader={setHeaderHeight}
            onBack={() => (expanded ? animateTo(false) : router.back())}
            onListen={() => open(false)}
            onRecord={() => open(true)}
            onDownload={download}
            downloadState={downloadState}
          />
          <Player
            passage={passage}
            top={headerHeight}
            height={Math.max(0, containerHeight - headerHeight)}
            progress={progress}
            expanded={expanded}
            recordMode={recordMode}
            onRecordModeChange={setRecordMode}
            onOpenDrafting={openDrafting}
          />
        </Animated.View>
      </ColorModeScope>
      <Materials />
    </View>
  );
}

function Hero({
  passage,
  expanded,
  progress,
  topInset,
  drag,
  onMeasure,
  onMeasureHeader,
  onBack,
  onListen,
  onRecord,
  onDownload,
  downloadState,
}: {
  passage: Ready;
  expanded: boolean;
  progress: SharedValue<number>;
  topInset: number;
  drag: ReturnType<typeof Gesture.Pan>;
  onMeasure: (height: number) => void;
  onMeasureHeader: (height: number) => void;
  onBack: () => void;
  onListen: () => void;
  onRecord: () => void;
  onDownload: () => void;
  downloadState: ReturnType<typeof usePassage>['downloadState'];
}) {
  const theme = useTheme();
  const styles = useThemedStyles(t => ({
    hero: {
      backgroundColor: t.roles.bgDefault,
      paddingHorizontal: t.spacing.xl,
    },
    back: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -t.spacing.md,
    },
    reference: {
      ...t.type.meta,
      color: t.roles.fgSecondary,
      paddingTop: t.spacing.sm,
    },
    title: {
      ...t.type.heading,
      color: t.roles.fgPrimary,
      paddingTop: t.spacing.xxs,
    },
    collapsed: { paddingTop: t.spacing.lg, gap: t.spacing.lg },
    script: { ...t.type.body, color: t.roles.fgPrimary },
    // Keeps the line's height, or Android squeezes the lines together.
    verseNumber: {
      ...t.type.label,
      lineHeight: t.type.body.lineHeight,
      color: t.roles.fgSecondary,
    },
    note: { ...t.type.label, color: t.roles.fgSecondary },
    download: { gap: t.spacing.sm },
    actions: { flexDirection: 'row', gap: t.spacing.md },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
    handle: {
      alignItems: 'center',
      paddingTop: t.spacing.md,
      paddingBottom: t.spacing.lg,
      gap: t.spacing.xs,
    },
    grip: {
      width: 36,
      height: 4,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.fgSecondary,
    },
  }));
  const collapsedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.3], [1, 0], 'clamp'),
  }));
  const title = passage.title ?? passage.reference;

  return (
    <View
      style={[styles.hero, { paddingTop: topInset }]}
      onLayout={e => onMeasure(Math.round(e.nativeEvent.layout.height))}
    >
      <View
        onLayout={e =>
          onMeasureHeader(
            Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height),
          )
        }
      >
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Close the player' : 'Back'}
          style={styles.back}
          testID="passage-back"
        >
          {expanded ? (
            <ArrowDown
              color={theme.roles.fgPrimary}
              size={theme.controlSizes.icon24}
            />
          ) : (
            <ArrowLeft
              color={theme.roles.fgPrimary}
              size={theme.controlSizes.icon24}
            />
          )}
        </Pressable>
        {passage.title ? (
          <Text style={styles.reference}>{passage.reference}</Text>
        ) : null}
        <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
      </View>
      <Animated.View
        style={[styles.collapsed, collapsedStyle]}
        pointerEvents={expanded ? 'none' : 'auto'}
        importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'}
      >
        {passage.downloaded ? (
          <Pressable
            onPress={onListen}
            accessibilityRole="button"
            accessibilityLabel="Open the script in the player"
            testID="passage-script"
          >
            <Text style={styles.script} numberOfLines={PREVIEW_LINES}>
              {passage.verses.map(v => (
                <Text key={`${v.chapterNumber}:${v.verseNumber}`}>
                  <Text style={styles.verseNumber}>{v.verseNumber} </Text>
                  {v.text}{' '}
                </Text>
              ))}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.download}>
            <Text style={styles.note}>
              {downloadState === 'failed'
                ? "The text didn't download. Check your connection and try again."
                : 'The text for this passage isn’t on this phone yet.'}
            </Text>
            <Pill
              label={
                downloadState === 'downloading'
                  ? 'Downloading…'
                  : 'Download text'
              }
              onPress={onDownload}
              disabled={downloadState === 'downloading'}
              testID="passage-download"
            />
          </View>
        )}
        <View style={styles.actions}>
          <Pill
            label="Listen"
            icon="play"
            onPress={onListen}
            testID="passage-listen"
          />
          <Pill
            label="Record take"
            icon="record"
            record
            onPress={onRecord}
            testID="passage-record"
          />
        </View>
        {passage.takes.length > 0 ? (
          <View style={styles.chips}>
            {[...passage.takes].reverse().map(take => (
              <TakeChip key={take.id} take={take} onPress={onRecord} />
            ))}
          </View>
        ) : null}
        <GestureDetector gesture={drag}>
          <Pressable
            onPress={onListen}
            accessibilityRole="button"
            accessibilityLabel="Open the full player"
            style={styles.handle}
            testID="passage-handle"
          >
            <View style={styles.grip} />
            <Text style={styles.note}>Pull up for the full player</Text>
          </Pressable>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

function Pill({
  label,
  icon,
  record = false,
  disabled = false,
  onPress,
  testID,
}: {
  label: string;
  icon?: 'play' | 'record';
  record?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(t => ({
    pill: {
      flex: 1,
      height: 48,
      borderRadius: t.radius.full,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing.sm,
      borderWidth: t.stroke[2],
      borderColor: t.roles.fgSecondary,
    },
    record: {
      backgroundColor: t.roles.accentRecord,
      borderColor: t.roles.accentRecord,
    },
    pressed: { backgroundColor: t.roles.surfaceDefault },
    label: { ...t.type.title, color: t.roles.fgPrimary },
    recordLabel: { color: t.roles.fgOnAccent },
  }));
  const color = record ? theme.roles.fgOnAccent : theme.roles.fgPrimary;
  const Icon =
    icon === 'record' ? RecordFill : icon === 'play' ? PlayFill : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.pill,
        record && styles.record,
        pressed && !record && styles.pressed,
      ]}
      testID={testID}
    >
      {Icon ? <Icon color={color} size={theme.controlSizes.icon20} /> : null}
      <Text style={[styles.label, record && styles.recordLabel]}>{label}</Text>
    </Pressable>
  );
}

function TakeChip({
  take,
  onPress,
}: {
  take: PassageTake;
  onPress: () => void;
}) {
  const styles = useThemedStyles(t => ({
    chip: {
      borderRadius: t.radius.full,
      borderWidth: t.stroke[1],
      borderColor: t.roles.fgSecondary,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.xs,
    },
    quiet: { borderColor: t.roles.borderRim },
    label: { ...t.type.label, color: t.roles.fgPrimary },
    quietLabel: { color: t.roles.fgSecondary },
  }));
  const label = `Take ${take.takeNumber}${take.selected ? ' · selected' : ''}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.chip, !take.selected && styles.quiet]}
      testID={`passage-take-${take.takeNumber}`}
    >
      <Text style={[styles.label, !take.selected && styles.quietLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Player({
  passage,
  top,
  height,
  progress,
  expanded,
  recordMode,
  onRecordModeChange,
  onOpenDrafting,
}: {
  passage: Ready;
  /** Under the hero's back button and title, which stay put. */
  top: number;
  /** Full size from the start, so the growing hero reveals it. */
  height: number;
  progress: SharedValue<number>;
  expanded: boolean;
  recordMode: boolean;
  onRecordModeChange: (record: boolean) => void;
  onOpenDrafting: () => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(t => ({
    player: {
      position: 'absolute',
      left: 0,
      right: 0,
      backgroundColor: t.roles.bgDefault,
    },
    script: { paddingHorizontal: t.spacing.xl, paddingBottom: t.spacing.xxl },
    reading: { ...t.type.reading, color: t.roles.fgPrimary },
    verseNumber: { ...t.type.label, color: t.roles.fgSecondary },
    note: {
      ...t.type.label,
      color: t.roles.fgSecondary,
      paddingHorizontal: t.spacing.xl,
      paddingVertical: t.spacing.md,
    },
    key: { flex: 1 },
  }));
  // Shared by the verse numbers too, or Android squeezes the lines together.
  const lineHeight = readingLineHeight(
    theme.type.reading.lineHeight,
    theme.fontScale.readingMax,
  );
  const playerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.15, 0.5], [0, 1], 'clamp'),
  }));

  return (
    <Animated.View
      style={[styles.player, playerStyle, { top, height }]}
      pointerEvents={expanded ? 'auto' : 'none'}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      testID="passage-player"
    >
      <ScrollView contentContainerStyle={styles.script}>
        <Text
          style={[styles.reading, { lineHeight }]}
          maxFontSizeMultiplier={theme.fontScale.readingMax}
        >
          {passage.verses.map((v: PassageVerse) => (
            <Text key={`${v.chapterNumber}:${v.verseNumber}`}>
              <Text style={[styles.verseNumber, { lineHeight }]}>
                {v.verseNumber}{' '}
              </Text>
              {v.text}{' '}
            </Text>
          ))}
        </Text>
      </ScrollView>
      <Text style={styles.note}>
        Playback and recording are coming to this player. For now, the keys open
        drafting at this passage.
      </Text>
      <ColorModeScope value="hardware">
        <HardwarePanel
          recordMode={recordMode}
          onRecordModeChange={onRecordModeChange}
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

function Materials() {
  const styles = useThemedStyles(t => ({
    list: { paddingBottom: t.spacing.xxl },
    head: {
      paddingHorizontal: t.spacing.xl,
      paddingTop: t.spacing.xl,
      paddingBottom: t.spacing.sm,
      gap: t.spacing.xxs,
    },
    heading: { ...t.type.title, color: t.roles.fgPrimary },
    meta: { ...t.type.meta, color: t.roles.fgSecondary },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      paddingHorizontal: t.spacing.xl,
      gap: t.spacing.lg,
      borderTopWidth: t.stroke[1],
      borderTopColor: t.roles.borderRim,
    },
    number: { ...t.type.meta, color: t.roles.fgSecondary, width: 20 },
    name: { ...t.type.body, color: t.roles.fgSecondary, flex: 1 },
  }));
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={styles.head}>
        <Text style={styles.heading} accessibilityRole="header">
          Listening materials
        </Text>
        <Text style={styles.meta}>Step audio isn't connected yet</Text>
      </View>
      {STEPS.map((name, i) => (
        <View key={name} style={styles.row}>
          <Text style={styles.number}>{i + 1}</Text>
          <Text style={styles.name}>{name}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
