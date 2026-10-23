import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  interpolateColor,
  LayoutAnimationConfig,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { CheckBold } from '../../../../components/ui/icons';
import { NEXT_SPRING } from '../../../../components/ui/motion';
import { PageDots } from '../../../../components/ui/PageDots';
import {
  Waveform,
  type WaveformVerse,
} from '../../../../components/ui/Waveform';
import type { PassageVerse } from '../../../../hooks/usePassage';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';
import { STEPS, type Ready } from './steps';
import { fitBars } from './fitBars';

/** Figma Official toggle: 30pt circle. Also the row's height in both modes. */
const TOGGLE = 30;
/** Waveform's row height (Waveform ROW_HEIGHT). */
const WAVE_H = 52;
/** Waveform bar heights in pt. */
const BAR_MIN = 6;
const BAR_MAX = 52;
/** Color tweens: the record edge and turning official. */
const EDGE_MS = 150;
const OFFICIAL_MS = 220;
/** One Waveform bar and its gap (2 + space/4), and the verse chip before them. */
const BAR_SLOT = 6;
const WAVE_LEAD = 48;
/** A take's wave sweeping in when it comes to the front. */
const SWEEP_MS = 320;

export interface FrontTake {
  takeNumber: number;
  durationMs: number | null;
  /** 0–1 per 100ms sample; empty while there's nothing to draw. */
  levels: number[];
  /** 0–1 through the take while it plays. */
  progress: number;
  recording: boolean;
  official: boolean;
  /** Absent while recording or before the first take. */
  onToggleOfficial?: () => void;
}

export interface RecordStatus {
  /** Why recording is off here, or null. */
  blockedReason: string | null;
  take: FrontTake;
}

export function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Under the script, as in the Figma player: the waveform, then a row under
 * it. Listen shows the page and page dots; Record grows the take card up
 * from the row over both and crossfades the row, so the waveform never moves
 * between modes.
 */
export function Footer({
  passage,
  page,
  recordMode,
  record,
}: {
  passage: Ready;
  page: number;
  recordMode: boolean;
  record: RecordStatus;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const { take } = record;
  const { roles, spacing } = theme;

  const mode = useSharedValue(recordMode ? 1 : 0);
  const edge = useSharedValue(take.recording ? 1 : 0);
  const official = useSharedValue(take.official ? 1 : 0);
  const sweep = useSharedValue(1);
  const [waveWidth, setWaveWidth] = useState(0);

  useEffect(() => {
    const to = recordMode ? 1 : 0;
    mode.value = reduceMotion ? to : withSpring(to, NEXT_SPRING);
  }, [recordMode, reduceMotion, mode]);
  useEffect(() => {
    edge.value = withTiming(take.recording ? 1 : 0, {
      duration: reduceMotion ? 0 : EDGE_MS,
    });
  }, [take.recording, reduceMotion, edge]);
  useEffect(() => {
    official.value = withTiming(take.official ? 1 : 0, {
      duration: reduceMotion ? 0 : OFFICIAL_MS,
    });
  }, [take.official, reduceMotion, official]);
  // A take coming to the front sweeps its wave in, left to right. One that
  // just stopped keeps the wave it drew.
  const wasRecording = useRef(take.recording);
  useEffect(() => {
    const justStopped = wasRecording.current && !take.recording;
    wasRecording.current = take.recording;
    if (take.recording || justStopped || reduceMotion) {
      sweep.value = 1;
      return;
    }
    sweep.value = 0;
    sweep.value = withTiming(1, { duration: SWEEP_MS });
  }, [take.takeNumber, take.recording, recordMode, reduceMotion, sweep]);

  const styles = useThemedStyles(t => ({
    // Both modes use the take card's insets (Figma 2555-910: the card 16 in
    // from the screen, its wave 24 inside). Extra room under it lifts the
    // waveform and card clear of the keys.
    footer: {
      backgroundColor: t.roles.bgDefault,
      paddingHorizontal: t.spacing.lg + t.spacing.xl,
      paddingTop: t.spacing.lg,
      paddingBottom: t.spacing.xxl + t.spacing.lg,
      gap: t.spacing.lg,
    },
    card: {
      position: 'absolute',
      bottom: t.spacing.xxl,
      left: t.spacing.lg,
      right: t.spacing.lg,
      borderRadius: t.radius.sm,
      borderWidth: t.stroke[1],
    },
    layers: { height: WAVE_H },
    rowLayers: { minHeight: TOGGLE },
    layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    clip: { overflow: 'hidden', height: WAVE_H },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.spacing.md,
      minHeight: TOGGLE,
    },
    label: { ...t.type.label, color: t.roles.fgPrimary },
    grow: { flex: 1 },
    meta: { ...t.type.meta, color: t.roles.fgSecondary },
    onAccent: { color: t.roles.fgOnAccent },
    toggle: {
      width: TOGGLE,
      height: TOGGLE,
      borderRadius: t.radius.full,
      borderWidth: t.stroke[2],
      borderColor: t.roles.fgSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toggleOn: {
      borderColor: t.roles.fgOnAccent,
      backgroundColor: t.roles.fgOnAccent,
    },
  }));

  // The card grows up from just above the row to cover the waveform too.
  const cardRowTop = spacing.lg + WAVE_H + spacing.lg - spacing.sm;
  const cardStyle = useAnimatedStyle(() => {
    const rimOrOfficial = interpolateColor(
      official.value,
      [0, 1],
      [roles.borderRim, roles.accentPrimary],
    );
    return {
      opacity: interpolate(mode.value, [0, 0.35], [0, 1], 'clamp'),
      top: interpolate(mode.value, [0, 1], [cardRowTop, spacing.xs]),
      // Sunken, not surface/default: the waveform's unplayed bars are
      // fg/inactive, which matches surface/default in Canvas.
      backgroundColor: interpolateColor(
        official.value,
        [0, 1],
        [roles.surfaceSunken, roles.accentPrimary],
      ),
      borderColor: interpolateColor(
        edge.value,
        [0, 1],
        [rimOrOfficial, roles.accentRecord],
      ),
    };
  });
  const listenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(mode.value, [0, 0.5], [1, 0], 'clamp'),
    transform: [{ translateY: interpolate(mode.value, [0, 1], [0, -6]) }],
  }));
  const recordStyle = useAnimatedStyle(() => ({
    opacity: interpolate(mode.value, [0.4, 1], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(mode.value, [0, 1], [6, 0]) }],
  }));
  const sweepStyle = useAnimatedStyle(() =>
    waveWidth > 0 ? { width: waveWidth * sweep.value } : {},
  );

  const pages = 1 + STEPS.length;
  const name = page === 0 ? passage.reference : STEPS[page - 1];
  const takeLabel = `Take ${take.takeNumber}`;
  // Only as many bars as fit: the newest while recording, the whole take
  // squeezed to fit once it's saved. A bar per sample would grow without end.
  const maxBars =
    waveWidth > 0
      ? Math.max(1, Math.floor((waveWidth - WAVE_LEAD) / BAR_SLOT))
      : 60;
  const takeBars = useMemo(
    () => fitBars(take.levels, maxBars, take.recording).map(levelBar),
    [take.levels, maxBars, take.recording],
  );
  const firstVerse = passage.verses[0]?.verseNumber ?? 1;

  return (
    <LayoutAnimationConfig skipEntering>
      <View style={styles.footer}>
        <Animated.View
          style={[styles.card, cardStyle]}
          pointerEvents="none"
          testID="passage-take-card"
        />
        <View
          style={styles.layers}
          onLayout={e => setWaveWidth(Math.round(e.nativeEvent.layout.width))}
        >
          <Animated.View
            style={[styles.layer, listenStyle]}
            pointerEvents={recordMode ? 'none' : 'auto'}
            importantForAccessibility={
              recordMode ? 'no-hide-descendants' : 'auto'
            }
          >
            {/* Materials have no audio yet, so their waveform stays empty. */}
            <Waveform
              verses={page === 0 ? scriptBars(passage.verses) : []}
              progress={0}
              accessibilityLabel={`${name} playback`}
              testID="passage-waveform"
            />
          </Animated.View>
          <Animated.View
            style={[styles.layer, recordStyle]}
            pointerEvents={recordMode ? 'auto' : 'none'}
            importantForAccessibility={
              recordMode ? 'auto' : 'no-hide-descendants'
            }
          >
            <Animated.View style={[styles.clip, sweepStyle]}>
              <Waveform
                verses={
                  takeBars.length > 0
                    ? [{ verse: firstVerse, bars: takeBars }]
                    : []
                }
                progress={take.recording ? 1 : take.progress}
                accessibilityLabel={
                  take.recording
                    ? `${takeLabel}, recording, ${formatElapsed(
                        take.durationMs ?? 0,
                      )}`
                    : `${takeLabel} playback`
                }
                style={waveWidth > 0 ? { width: waveWidth } : undefined}
                testID="passage-take-wave"
              />
            </Animated.View>
          </Animated.View>
        </View>
        <View style={styles.rowLayers}>
          <Animated.View
            style={[styles.layer, styles.row, listenStyle]}
            pointerEvents={recordMode ? 'none' : 'auto'}
            importantForAccessibility={
              recordMode ? 'no-hide-descendants' : 'auto'
            }
          >
            <Text style={styles.label} numberOfLines={1}>
              {name}
            </Text>
            <PageDots
              count={pages}
              index={page}
              accessibilityLabel={`${name}, ${page + 1} of ${pages}`}
              testID="passage-pages"
            />
          </Animated.View>
          <Animated.View
            style={[styles.layer, styles.row, recordStyle]}
            pointerEvents={recordMode ? 'auto' : 'none'}
            importantForAccessibility={
              recordMode ? 'auto' : 'no-hide-descendants'
            }
          >
            {/* Keyed by take, so changing takes crossfades the label. */}
            <Animated.Text
              key={`label-${record.blockedReason ?? take.takeNumber}`}
              entering={FadeIn.duration(OFFICIAL_MS)}
              exiting={FadeOut.duration(EDGE_MS)}
              style={[
                styles.label,
                styles.grow,
                take.official && styles.onAccent,
              ]}
              numberOfLines={1}
            >
              {record.blockedReason ?? takeLabel}
            </Animated.Text>
            {take.durationMs !== null ? (
              <Animated.Text
                key={`duration-${take.takeNumber}`}
                entering={FadeIn.duration(OFFICIAL_MS)}
                style={[styles.meta, take.official && styles.onAccent]}
              >
                {formatElapsed(take.durationMs)}
              </Animated.Text>
            ) : null}
            {take.onToggleOfficial ? (
              <Pressable
                onPress={take.onToggleOfficial}
                // Marking official is one-way: another take can take it over,
                // but there's no un-marking, so it's a button, not a checkbox.
                disabled={take.official}
                accessibilityRole="button"
                accessibilityLabel={
                  take.official
                    ? `${takeLabel} is the official take`
                    : `Make ${takeLabel} official`
                }
                accessibilityState={{ disabled: take.official }}
                hitSlop={9}
                style={[styles.toggle, take.official && styles.toggleOn]}
                testID="passage-take-official"
              >
                {take.official ? (
                  <Animated.View entering={ZoomIn.springify()}>
                    <CheckBold
                      color={roles.accentPrimary}
                      size={theme.controlSizes.icon20}
                    />
                  </Animated.View>
                ) : null}
              </Pressable>
            ) : null}
          </Animated.View>
        </View>
      </View>
    </LayoutAnimationConfig>
  );
}

/** A 0–1 level as a Waveform bar height. */
function levelBar(level: number) {
  return BAR_MIN + level * (BAR_MAX - BAR_MIN);
}

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
