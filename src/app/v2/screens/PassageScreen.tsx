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

/** Hero to full player. */
const SHEET_MS = 320;
/** How far the hero drags before a release opens or closes it. */
const SNAP_AT = 0.35;
const FLING = 500;
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

type Ready = Extract<Passage, { status: 'ready' }>;

/**
 * Next passage page: a dark hero with the script, Listen and Record, and the
 * takes, which grows into the full player; then the listening materials as
 * Figma's passage rows. Until the player is wired, its keys open Legacy
 * drafting at this passage.
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

  // One per detector: the collapsed hero drags open, the player header drags
  // closed, and the player's script keeps its own scrolling.
  const makeDrag = () =>
    Gesture.Pan()
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
            headerDrag={makeDrag()}
            heroDrag={makeDrag()}
            onMeasure={setCollapsedHeight}
            onMeasureHeader={setHeaderHeight}
            onBack={() => router.back()}
            onClose={() => animateTo(false)}
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
      <Materials reference={passage.reference} />
    </View>
  );
}

function Hero({
  passage,
  expanded,
  progress,
  topInset,
  headerDrag,
  heroDrag,
  onMeasure,
  onMeasureHeader,
  onBack,
  onClose,
  onListen,
  onRecord,
  onDownload,
  downloadState,
}: {
  passage: Ready;
  expanded: boolean;
  progress: SharedValue<number>;
  topInset: number;
  headerDrag: ReturnType<typeof Gesture.Pan>;
  heroDrag: ReturnType<typeof Gesture.Pan>;
  onMeasure: (height: number) => void;
  onMeasureHeader: (height: number) => void;
  onBack: () => void;
  onClose: () => void;
  onListen: () => void;
  onRecord: () => void;
  onDownload: () => void;
  downloadState: ReturnType<typeof usePassage>['downloadState'];
}) {
  const styles = useThemedStyles(t => ({
    hero: {
      backgroundColor: t.roles.bgDefault,
      paddingHorizontal: t.spacing.xl,
    },
    // Figma player header: the passage in overline, Flat round button.
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      paddingTop: t.spacing.md,
      paddingBottom: t.spacing.md,
    },
    overline: { ...t.type.overline, color: t.roles.fgSecondary, flex: 1 },
    collapsed: { gap: t.spacing.lg, paddingBottom: t.spacing.xl },
    title: { ...t.type.heading, color: t.roles.fgPrimary },
    script: { ...t.type.body, color: t.roles.fgPrimary },
    // Keeps the line's height, or Android squeezes the lines together.
    verseNumber: {
      ...t.type.label,
      lineHeight: t.type.body.lineHeight,
      color: t.roles.fgSecondary,
    },
    note: { ...t.type.label, color: t.roles.fgSecondary },
    actions: { flexDirection: 'row', gap: t.spacing.xxl },
  }));
  const collapsedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.3], [1, 0], 'clamp'),
  }));

  return (
    <View
      style={[styles.hero, { paddingTop: topInset }]}
      onLayout={e => onMeasure(Math.round(e.nativeEvent.layout.height))}
    >
      <GestureDetector gesture={headerDrag}>
        <View
          style={styles.header}
          onLayout={e =>
            onMeasureHeader(
              Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height),
            )
          }
        >
          {expanded ? null : (
            <RoundButton
              variant="flat"
              icon={ArrowLeft}
              accessibilityLabel="Back"
              onPress={onBack}
              testID="passage-back"
            />
          )}
          <Text style={styles.overline} numberOfLines={1}>
            {expanded
              ? passage.title ?? passage.reference
              : passage.title
              ? passage.reference
              : ''}
          </Text>
          {expanded ? (
            <RoundButton
              variant="flat"
              icon={ArrowDown}
              accessibilityLabel="Close the player"
              onPress={onClose}
              testID="passage-close"
            />
          ) : null}
        </View>
      </GestureDetector>
      <GestureDetector gesture={heroDrag}>
        <Animated.View
          style={[styles.collapsed, collapsedStyle]}
          pointerEvents={expanded ? 'none' : 'auto'}
          importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'}
        >
          <Text
            style={styles.title}
            accessibilityRole="header"
            numberOfLines={2}
          >
            {passage.title ?? passage.reference}
          </Text>
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
            <Text style={styles.note}>
              {downloadState === 'failed'
                ? "The text didn't download. Check your connection and try again."
                : 'The text for this passage isn’t on this phone yet.'}
            </Text>
          )}
          <View style={styles.actions}>
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
              onPress={onListen}
              testID="passage-listen"
            />
            <Action
              icon={RecordIcon}
              label={passage.takes.length > 0 ? 'Record a take' : 'Record'}
              onPress={onRecord}
              testID="passage-record"
            />
          </View>
          <Takes takes={passage.takes} onPress={onRecord} />
        </Animated.View>
      </GestureDetector>
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
  /** Under the player header, which stays put. */
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
    footer: {
      paddingHorizontal: t.spacing.xl,
      paddingVertical: t.spacing.md,
      gap: t.spacing.md,
    },
    note: { ...t.type.label, color: t.roles.fgSecondary },
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
          {passage.verses.map(v => (
            <Text key={`${v.chapterNumber}:${v.verseNumber}`}>
              <Text style={[styles.verseNumber, { lineHeight }]}>
                {v.verseNumber}{' '}
              </Text>
              {v.text}{' '}
            </Text>
          ))}
        </Text>
      </ScrollView>
      <View style={styles.footer}>
        {recordMode ? (
          <Takes takes={passage.takes} onPress={onOpenDrafting} />
        ) : null}
        <Text style={styles.note}>
          Playback and recording are coming to this player. For now, the keys
          open drafting at this passage.
        </Text>
      </View>
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
