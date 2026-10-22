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
import { PageDots } from '../../../components/ui/PageDots';
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

const TOTAL_BARS = VERSES.reduce((n, v) => n + v.bars.length, 0);
/** Where each verse starts, 0–1, for the skip keys. */
const VERSE_STARTS = VERSES.reduce<number[]>((starts, v, i) => {
  starts.push(
    i === 0 ? 0 : starts[i - 1] + VERSES[i - 1].bars.length / TOTAL_BARS,
  );
  return starts;
}, []);
const PAGES = 7;
/** 100ms matches the player's position updates (usePlaybackEngine). */
const TICK_MS = 100;
const DURATION_MS = 20000;

function verseAt(progress: number) {
  let v = 0;
  VERSE_STARTS.forEach((start, i) => {
    if (progress >= start) {
      v = i;
    }
  });
  return v;
}

/**
 * The Listen player: the waveform plays through Mark 14:22–25 under the page
 * dots, driven by the Hardware panel's Play · Previous · Next keys.
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

  const verse = verseAt(progress);
  const togglePlay = () => {
    if (!playing && progress >= 1) {
      setProgress(0);
    }
    setPlaying(p => !p);
  };
  // Previous restarts the verse, or goes back one if you're at its start.
  const previous = () => {
    const atStart = progress - VERSE_STARTS[verse] < 0.01;
    setProgress(VERSE_STARTS[atStart ? Math.max(0, verse - 1) : verse]);
  };
  const next = () =>
    setProgress(VERSE_STARTS[Math.min(verse + 1, VERSE_STARTS.length - 1)]);

  return (
    <View style={styles.demo}>
      {/* Follows the gallery's Mode switcher; the real player is Canvas. */}
      <Player progress={progress} />
      <ColorModeScope value="hardware">
        <KeyDeck>
          <Key
            icon={playing ? PauseFill : PlayFill}
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            announceLatched={false}
            active={playing}
            onPress={togglePlay}
            style={styles.keys}
            testID="gallery-waveform-play"
          />
          <Key
            icon={SkipBackFill}
            accessibilityLabel="Previous verse"
            disabled={progress === 0}
            onPress={previous}
            style={styles.keys}
            testID="gallery-waveform-previous"
          />
          <Key
            icon={SkipForwardFill}
            accessibilityLabel="Next verse"
            disabled={verse >= VERSES.length - 1}
            onPress={next}
            style={styles.keys}
            testID="gallery-waveform-next"
          />
        </KeyDeck>
      </ColorModeScope>
    </View>
  );
}

function Player({ progress }: { progress: number }) {
  const styles = useThemedStyles(t => ({
    player: {
      backgroundColor: t.roles.bgDefault,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.lg,
      gap: t.spacing.xxl,
    },
    reference: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.spacing.lg,
    },
    referenceText: {
      color: t.roles.fgPrimary,
      fontSize: t.typography.sizes.sm,
      fontWeight: t.typography.weights.semibold,
      includeFontPadding: false,
    },
  }));
  const page = Math.min(PAGES - 1, Math.floor(progress * PAGES));

  return (
    <View style={styles.player}>
      <Waveform
        verses={VERSES}
        progress={progress}
        accessibilityLabel="Mark 14:22–25 playback"
        testID="gallery-waveform"
      />
      <View style={styles.reference}>
        <Text style={styles.referenceText}>Mark 14:22–25</Text>
        <PageDots
          count={PAGES}
          index={page}
          accessibilityLabel={`Page ${page + 1} of ${PAGES}`}
          testID="gallery-page-dots"
        />
      </View>
    </View>
  );
}
