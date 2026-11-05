import React, { useEffect } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  interpolate,
  LayoutAnimationConfig,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { NEXT_SPRING } from '../../../../components/ui/motion';
import {
  Waveform,
  type WaveformVerse,
} from '../../../../components/ui/Waveform';
import type { PassageVerse } from '../../../../hooks/usePassage';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';
import { OFFICIAL_TOGGLE } from './OfficialToggle';
import { PassageNotices } from './PassageNotices';
import { type Ready } from './ready';
import type { RecordNotice } from './useRecorder';
import { BAR_MAX, BAR_MIN, TakeCard, WAVE_H, type FrontTake } from './TakeCard';

/**
 * What Listen warns about: the chapter's state. Why Record is off, and the
 * takes only classic drafting shows, wait for Record, so they don't read as
 * Listen being blocked.
 */
const LISTEN_NOTICES = new Set(['conflict', 'unuploadable', 'taken']);

/** Figma's scrim while a take is lifted: bg/default at 82% (Q25). */
const SCRIM = 0.82;

export interface RecordStatus {
  /** Why recording is off here, or what the take in progress waits on. */
  blockedReason: string | null;
  take: FrontTake;
  /** Where the take's verse chip starts: the passage's, or verse mode's verse. */
  firstVerse: number;
}

/**
 * Under the script, as in the Figma player: the waveform, then a row under
 * it. Listen shows the reference; Record brings the take card in over both,
 * so the waveform never moves between modes. There's one page, so no dots
 * (Q16).
 */
export interface ListenWave {
  /** 0–1 through the passage's stretch of the source chapter. */
  progress: number;
  /** Set when a duration is known, so a scrub can seek the passage. */
  onSeek?: (progress: number) => void;
  /** Off when the source can't say where each verse falls. */
  verseChips: boolean;
}

export function Footer({
  passage,
  recordMode,
  record,
  listen,
  notices,
  onOpenClassic,
  dimmed = false,
}: {
  passage: Ready;
  recordMode: boolean;
  record: RecordStatus;
  listen: ListenWave;
  /** Legacy's Record-tab banners, in both modes. */
  notices: RecordNotice[];
  onOpenClassic?: () => void;
  /** A take is lifted: dim everything above the keys but the fan. */
  dimmed?: boolean;
}) {
  const { motion } = useTheme();
  const reduceMotion = useReducedMotion();
  const { height: screenHeight } = useWindowDimensions();
  const dim = useSharedValue(dimmed ? 1 : 0);
  useEffect(() => {
    dim.value = withTiming(dimmed ? 1 : 0, {
      duration: reduceMotion ? 0 : motion.releaseMs,
    });
  }, [dimmed, reduceMotion, dim, motion.releaseMs]);
  const mode = useSharedValue(recordMode ? 1 : 0);
  useEffect(() => {
    const to = recordMode ? 1 : 0;
    mode.value = reduceMotion ? to : withSpring(to, NEXT_SPRING);
  }, [recordMode, reduceMotion, mode]);

  // Extra room under the row lifts the waveform and the take card clear of
  // the keys.
  const styles = useThemedStyles(t => ({
    footer: {
      backgroundColor: t.roles.bgDefault,
      paddingHorizontal: t.spacing.lg + t.spacing.xl,
      paddingTop: t.spacing.lg,
      paddingBottom: t.spacing.xxl + t.spacing.lg,
      gap: t.spacing.lg,
    },
    wave: { height: WAVE_H },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.spacing.md,
      minHeight: OFFICIAL_TOGGLE,
    },
    label: { ...t.type.label, color: t.roles.fgPrimary },
    scrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: t.roles.bgDefault,
    },
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: dim.value * SCRIM }));
  const listenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(mode.value, [0, 0.5], [1, 0], 'clamp'),
    transform: [{ translateY: interpolate(mode.value, [0, 1], [0, -6]) }],
  }));

  const name = passage.reference;
  const listenProps = {
    pointerEvents: recordMode ? ('none' as const) : ('auto' as const),
    importantForAccessibility: recordMode
      ? ('no-hide-descendants' as const)
      : ('auto' as const),
  };

  return (
    <LayoutAnimationConfig skipEntering>
      <View style={styles.footer}>
        <PassageNotices
          notices={
            recordMode
              ? notices.filter(n => n.message !== record.blockedReason)
              : notices.filter(n => LISTEN_NOTICES.has(n.id))
          }
          onOpenClassic={onOpenClassic}
          testID="player-notices"
        />
        <Animated.View style={[styles.wave, listenStyle]} {...listenProps}>
          <Waveform
            verses={scriptBars(passage.verses, listen.verseChips)}
            progress={listen.progress}
            onSeek={listen.onSeek}
            accessibilityLabel={`${name} playback`}
            testID="passage-waveform"
          />
        </Animated.View>
        <Animated.View style={[styles.row, listenStyle]} {...listenProps}>
          <Text style={styles.label} numberOfLines={1}>
            {name}
          </Text>
        </Animated.View>
        <TakeCard
          take={record.take}
          blockedReason={record.blockedReason}
          firstVerse={record.firstVerse}
          mode={mode}
          shown={recordMode}
        />
        {/* Covers the script and header too, up to the keys. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.scrim, { top: -screenHeight }, scrimStyle]}
        />
      </View>
    </LayoutAnimationConfig>
  );
}

/**
 * Stand-in levels for the source chapter: a bar per word, taller for longer
 * words, so each verse's chip and segment follow its length. Progress and
 * scrubbing come from the passage's stretch of the chapter file, not from
 * these heights.
 */
function scriptBars(verses: PassageVerse[], chips: boolean): WaveformVerse[] {
  const groups = verses
    .filter(v => v.text)
    .map(v => ({
      verse: v.verseNumber,
      bars: v.text
        .split(/\s+/)
        .filter(Boolean)
        .map(word => Math.min(BAR_MAX, BAR_MIN + word.length * 5)),
    }));
  return chips ? groups : groups.map(g => ({ verse: null, bars: g.bars }));
}
