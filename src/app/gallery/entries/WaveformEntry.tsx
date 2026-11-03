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

/** The script, then each listening material. */
const PAGES = [
  'Mark 14:22–25',
  'Hear & Heart',
  'Setting the Stage',
  'Defining the Scenes',
  'Embodying the Text',
  'Filling the Gaps',
  'Speaking the Word',
];
/** 100ms matches the player's position updates (usePlaybackEngine). */
const TICK_MS = 100;
const DURATION_MS = 20000;

/**
 * The Listen player: Play runs the waveform through Mark 14:22–25, and
 * Previous and Next turn the pages under it, as swiping does.
 */
export function WaveformEntry() {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [page, setPage] = useState(0);
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
  const first = page === 0;
  const last = page === PAGES.length - 1;

  return (
    <View style={styles.demo}>
      {/* Follows the gallery's Mode switcher; the real player is Canvas. */}
      <Player progress={progress} page={page} />
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
            accessibilityLabel={
              first ? 'Previous' : `Previous: ${PAGES[page - 1]}`
            }
            disabled={first}
            onPress={() => setPage(p => p - 1)}
            style={styles.keys}
            testID="gallery-waveform-previous"
          />
          <Key
            icon={SkipForwardFill}
            accessibilityLabel={last ? 'Next' : `Next: ${PAGES[page + 1]}`}
            disabled={last}
            onPress={() => setPage(p => p + 1)}
            style={styles.keys}
            testID="gallery-waveform-next"
          />
        </KeyDeck>
      </ColorModeScope>
      <TakeWave />
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

function Player({ progress, page }: { progress: number; page: number }) {
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
  const name = PAGES[page];

  return (
    <View style={styles.player}>
      <Waveform
        verses={VERSES}
        progress={progress}
        accessibilityLabel="Mark 14:22–25 playback"
        testID="gallery-waveform"
      />
      <View style={styles.reference}>
        <Text style={styles.referenceText}>{name}</Text>
        <PageDots
          count={PAGES.length}
          index={page}
          accessibilityLabel={`${name}, ${page + 1} of ${PAGES.length}`}
          testID="gallery-page-dots"
        />
      </View>
    </View>
  );
}
