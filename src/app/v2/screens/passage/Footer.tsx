import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  interpolate,
  LayoutAnimationConfig,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { NEXT_SPRING } from '../../../../components/ui/motion';
import { PageDots } from '../../../../components/ui/PageDots';
import {
  Waveform,
  type WaveformVerse,
} from '../../../../components/ui/Waveform';
import type { PassageVerse } from '../../../../hooks/usePassage';
import { useThemedStyles } from '../../../../theme/useTheme';
import { OFFICIAL_TOGGLE } from './OfficialToggle';
import { STEPS, type Ready } from './steps';
import { BAR_MAX, BAR_MIN, TakeCard, WAVE_H, type FrontTake } from './TakeCard';

export interface RecordStatus {
  /** Why recording is off here, or null. */
  blockedReason: string | null;
  take: FrontTake;
}

/**
 * Under the script, as in the Figma player: the waveform, then a row under
 * it. Listen shows the page and page dots; Record brings the take card in
 * over both, so the waveform never moves between modes.
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
  const reduceMotion = useReducedMotion();
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
  }));
  const listenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(mode.value, [0, 0.5], [1, 0], 'clamp'),
    transform: [{ translateY: interpolate(mode.value, [0, 1], [0, -6]) }],
  }));

  const pages = 1 + STEPS.length;
  const name = page === 0 ? passage.reference : STEPS[page - 1];
  const listenProps = {
    pointerEvents: recordMode ? ('none' as const) : ('auto' as const),
    importantForAccessibility: recordMode
      ? ('no-hide-descendants' as const)
      : ('auto' as const),
  };

  return (
    <LayoutAnimationConfig skipEntering>
      <View style={styles.footer}>
        <Animated.View style={[styles.wave, listenStyle]} {...listenProps}>
          {/* Materials have no audio yet, so their waveform stays empty. */}
          <Waveform
            verses={page === 0 ? scriptBars(passage.verses) : []}
            progress={0}
            accessibilityLabel={`${name} playback`}
            testID="passage-waveform"
          />
        </Animated.View>
        <Animated.View style={[styles.row, listenStyle]} {...listenProps}>
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
        <TakeCard
          take={record.take}
          blockedReason={record.blockedReason}
          firstVerse={passage.verses[0]?.verseNumber ?? 1}
          mode={mode}
          shown={recordMode}
        />
      </View>
    </LayoutAnimationConfig>
  );
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
