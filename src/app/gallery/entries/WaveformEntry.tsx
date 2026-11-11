import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import {
  PauseFill,
  PlayFill,
  SkipBackFill,
  SkipForwardFill,
} from '../../../components/ui/icons';
import { Key } from '../../../components/ui/Key';
import { KeyDeck } from '../../../components/ui/KeyDeck';
import { Waveform, type WaveformVerse } from '../../../components/ui/Waveform';
import { ColorModeScope, useThemedStyles } from '../../../theme/useTheme';

/** Bar heights from the Listen player frame (Figma 2440:30858). */
const VERSES: WaveformVerse[] = [
  {
    verse: 22,
    bars: [
      10, 24, 52, 8, 26, 10, 38, 28, 44, 22, 22, 12, 12, 6, 30, 30, 12, 12, 8,
      8,
    ],
  },
  {
    verse: 23,
    bars: [
      8, 8, 8, 18, 18, 8, 26, 22, 32, 18, 10, 24, 52, 8, 26, 10, 38, 28, 44, 22,
    ],
  },
  {
    verse: 24,
    bars: [22, 12, 12, 6, 16, 22, 26, 38, 26, 12, 30, 12, 30, 12, 30, 12, 12],
  },
  {
    verse: 25,
    bars: [
      8, 8, 8, 18, 18, 8, 26, 22, 32, 18, 10, 24, 52, 8, 26, 10, 38, 28, 44, 22,
    ],
  },
];

/** Verse mode when the source has no verse timings: the same bars, no chips. */
const CHIPLESS: WaveformVerse[] = VERSES.map(v => ({ ...v, verse: null }));

/** Where each verse starts, 0–1 through the passage, from its bars. */
const TOTAL_BARS = VERSES.reduce((n, v) => n + v.bars.length, 0);
const VERSE_STARTS = VERSES.map(
  (_, i) =>
    VERSES.slice(0, i).reduce((n, v) => n + v.bars.length, 0) / TOTAL_BARS,
);
const REFERENCE = 'Mark 14:22–25';
/** 100ms matches the player's position updates (usePlaybackEngine). */
const TICK_MS = 100;
const DURATION_MS = 20000;

/**
 * The Listen player: Play runs the waveform through Mark 14:22–25, and in
 * verse mode Previous and Next step verses, as the player's keys do. Below,
 * a take's wave to scrub, and verse mode's chipless wave for a source with
 * no verse timings.
 */
export function WaveformEntry() {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.lg },
    keys: { flex: 1 },
  }));

  useEffect(() => {
    if (!playing) {
      return;
    }
    if (progress >= 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => setProgress(p => Math.min(1, p + TICK_MS / DURATION_MS)),
      TICK_MS,
    );
    return () => clearTimeout(timer);
  }, [playing, progress]);

  const togglePlay = () => {
    if (!playing && progress >= 1) {
      setProgress(0);
    }
    setPlaying(p => !p);
  };
  // The verse playing: the last one that starts at or before the playhead.
  const at = VERSE_STARTS.reduce(
    (v, start, i) => (progress >= start ? i : v),
    0,
  );
  const previous = VERSES[at - 1]?.verse ?? null;
  const next = VERSES[at + 1]?.verse ?? null;
  const step = (to: number) => setProgress(VERSE_STARTS[to]);

  return (
    <View style={styles.demo}>
      {/* Pinned to Canvas, like the player; the keys are Hardware. */}
      <ColorModeScope value="canvas">
        <Player progress={progress} />
      </ColorModeScope>
      <ColorModeScope value="hardware">
        <KeyDeck>
          <Key
            icon={playing ? PauseFill : PlayFill}
            accessibilityLabel={
              playing ? 'Pause source audio' : 'Play source audio'
            }
            announceLatched={false}
            active={playing}
            onPress={togglePlay}
            style={styles.keys}
            testID="gallery-waveform-play"
          />
          <Key
            icon={SkipBackFill}
            accessibilityLabel={
              previous ? `Previous: verse ${previous}` : 'Previous'
            }
            disabled={previous === null}
            onPress={() => step(at - 1)}
            style={styles.keys}
            testID="gallery-waveform-previous"
          />
          <Key
            icon={SkipForwardFill}
            accessibilityLabel={next ? `Next: verse ${next}` : 'Next'}
            disabled={next === null}
            onPress={() => step(at + 1)}
            style={styles.keys}
            testID="gallery-waveform-next"
          />
        </KeyDeck>
      </ColorModeScope>
      <ColorModeScope value="canvas">
        <TakeWave />
        <ChiplessWave progress={progress} />
      </ColorModeScope>
    </View>
  );
}

/** A take's wave on the take card: drag it or tap a bar to scrub. */
function TakeWave() {
  const [progress, setProgress] = useState(0);
  const styles = useThemedStyles(t => ({
    take: {
      backgroundColor: t.roles.bgDefault,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.lg,
      gap: t.spacing.sm,
    },
    label: {
      ...t.type.meta,
      color: t.roles.fgSecondary,
      paddingHorizontal: t.spacing.lg,
    },
  }));

  return (
    <View style={styles.take}>
      <Text style={styles.label}>
        Take 2 · scrubbed to {Math.round(progress * 100)}%
      </Text>
      <Waveform
        verses={VERSES}
        progress={progress}
        accessibilityLabel="Take 2 playback"
        onSeek={setProgress}
        testID="gallery-waveform-take"
      />
    </View>
  );
}

/** The player in verse mode without verse timings: Play runs it too. */
function ChiplessWave({ progress }: { progress: number }) {
  const styles = useThemedStyles(t => ({
    take: {
      backgroundColor: t.roles.bgDefault,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.lg,
      gap: t.spacing.sm,
    },
    label: {
      ...t.type.meta,
      color: t.roles.fgSecondary,
      paddingHorizontal: t.spacing.lg,
    },
  }));

  return (
    <View style={styles.take}>
      <Text style={styles.label}>Verse mode · no verse timings, no chips</Text>
      <Waveform
        verses={CHIPLESS}
        progress={progress}
        accessibilityLabel="Mark 14:22–25 playback, verse mode"
        testID="gallery-waveform-chipless"
      />
    </View>
  );
}

function Player({ progress }: { progress: number }) {
  const styles = useThemedStyles(t => ({
    player: {
      backgroundColor: t.roles.bgDefault,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.lg,
      gap: t.spacing.lg,
    },
    reference: {
      ...t.type.label,
      color: t.roles.fgPrimary,
      paddingHorizontal: t.spacing.lg,
    },
  }));

  return (
    <View style={styles.player}>
      <Waveform
        verses={VERSES}
        progress={progress}
        accessibilityLabel={`${REFERENCE} playback`}
        testID="gallery-waveform"
      />
      <Text style={styles.reference} numberOfLines={1}>
        {REFERENCE}
      </Text>
    </View>
  );
}
