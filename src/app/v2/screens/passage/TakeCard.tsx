import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Waveform } from '../../../../components/ui/Waveform';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';
import { fitBars } from './fitBars';
import { OFFICIAL_TOGGLE, OfficialToggle } from './OfficialToggle';

/** Waveform's row height (Waveform ROW_HEIGHT). */
export const WAVE_H = 52;
/** Waveform bar heights in pt. */
export const BAR_MIN = 6;
export const BAR_MAX = 52;
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

export function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Figma's Take card (2555-910): the front take's wave, number, length and
 * official toggle. It lays over the footer's own waveform and row, so the
 * wave sits where the Listen one does, and grows up out of the row as Record
 * mode comes in (`mode` 0 → 1). Red-edged while recording, blue once official.
 */
export function TakeCard({
  take,
  blockedReason,
  firstVerse,
  mode,
  shown,
}: {
  take: FrontTake;
  /** Why recording is off here; shown in place of the take's name. */
  blockedReason: string | null;
  /** The verse its chip shows. */
  firstVerse: number;
  /** 0 in Listen, 1 in Record. */
  mode: SharedValue<number>;
  shown: boolean;
}) {
  const { roles, spacing } = useTheme();
  const reduceMotion = useReducedMotion();
  const edge = useSharedValue(take.recording ? 1 : 0);
  const official = useSharedValue(take.official ? 1 : 0);
  const sweep = useSharedValue(1);
  const [waveWidth, setWaveWidth] = useState(0);

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
  }, [take.takeNumber, take.recording, shown, reduceMotion, sweep]);

  // The same insets as the footer it lays over (Figma 2555-910: the card 16
  // in from the screen, its wave 24 inside).
  const styles = useThemedStyles(t => ({
    over: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: t.spacing.lg + t.spacing.xl,
      paddingTop: t.spacing.lg,
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
    clip: { overflow: 'hidden', height: WAVE_H },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.spacing.md,
      minHeight: OFFICIAL_TOGGLE,
    },
    label: { ...t.type.label, color: t.roles.fgPrimary, flex: 1 },
    meta: { ...t.type.meta, color: t.roles.fgSecondary },
    onAccent: { color: t.roles.fgOnAccent },
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
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(mode.value, [0.4, 1], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(mode.value, [0, 1], [6, 0]) }],
  }));
  const sweepStyle = useAnimatedStyle(() =>
    waveWidth > 0 ? { width: waveWidth * sweep.value } : {},
  );

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

  return (
    <View
      style={styles.over}
      pointerEvents={shown ? 'box-none' : 'none'}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
    >
      <Animated.View
        style={[styles.card, cardStyle]}
        pointerEvents="none"
        testID="passage-take-card"
      />
      <Animated.View
        style={contentStyle}
        onLayout={e => setWaveWidth(Math.round(e.nativeEvent.layout.width))}
      >
        <Animated.View style={[styles.clip, sweepStyle]}>
          <Waveform
            verses={
              takeBars.length > 0 ? [{ verse: firstVerse, bars: takeBars }] : []
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
      <Animated.View style={[styles.row, contentStyle]}>
        {/* Keyed by take, so changing takes crossfades the label. */}
        <Animated.Text
          key={`label-${blockedReason ?? take.takeNumber}`}
          entering={FadeIn.duration(OFFICIAL_MS)}
          exiting={FadeOut.duration(EDGE_MS)}
          style={[styles.label, take.official && styles.onAccent]}
          numberOfLines={1}
        >
          {blockedReason ?? takeLabel}
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
          <OfficialToggle
            official={take.official}
            takeLabel={takeLabel}
            onPress={take.onToggleOfficial}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

/** A 0–1 level as a Waveform bar height. */
function levelBar(level: number) {
  return BAR_MIN + level * (BAR_MAX - BAR_MIN);
}
