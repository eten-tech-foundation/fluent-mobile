import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ArrowDown, ArrowRight, Waveform } from '../../../components/ui/icons';
import { ProgressRing } from '../../../components/ui/ProgressRing';
import { RoundButton } from '../../../components/ui/RoundButton';
import { ColorModeScope, useThemedStyles } from '../../../theme/useTheme';

/**
 * Listening progress in whole steps, so a track lands exactly on complete.
 * 100ms matches the player's position updates (usePlaybackEngine).
 */
const STEPS = 50;
const STEP_MS = 100;
const REFERENCE = 'Mark 14:22–25';

/** The Last Supper's tracks, as on the Figma pericope screen. */
const TRACKS = [
  { id: 'source', title: 'Source Text', listened: STEPS },
  { id: 'hear', title: 'Hear & Heart', listened: STEPS },
  { id: 'stage', title: 'Setting the Stage', listened: STEPS / 2 },
  { id: 'scenes', title: 'Defining the Scenes', listened: 0 },
  { id: 'embody', title: 'Embodying the Text', listened: 0 },
];

/**
 * Passage rows: the ring shows how far through each track of the pericope
 * you've listened. Tap a row's button to play it (it advances while playing,
 * tap again to pause; starting another track pauses this one).
 */
function PassageRows() {
  const [listened, setListened] = useState<Record<string, number>>(() =>
    Object.fromEntries(TRACKS.map(t => [t.id, t.listened])),
  );
  const [playing, setPlaying] = useState<string | null>(null);
  const styles = useThemedStyles(t => ({
    rows: { gap: t.spacing.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.lg,
      paddingVertical: t.spacing.xs,
    },
    text: { flex: 1, gap: t.spacing.xs },
    title: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.lg,
      includeFontPadding: false,
    },
    titlePlaying: { color: t.roles.fgPrimary },
    reference: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.sm,
      textTransform: 'uppercase',
      includeFontPadding: false,
    },
  }));

  const playingSteps = playing ? listened[playing] : 0;

  useEffect(() => {
    if (!playing) {
      return;
    }
    if (playingSteps >= STEPS) {
      setPlaying(null);
      return;
    }
    const timer = setTimeout(
      () => setListened(l => ({ ...l, [playing]: l[playing] + 1 })),
      STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [playing, playingSteps]);

  const play = (id: string) => {
    if (playing === id) {
      setPlaying(null);
      return;
    }
    if (listened[id] >= STEPS) {
      setListened(l => ({ ...l, [id]: 0 }));
    }
    setPlaying(id);
  };

  return (
    <View style={styles.rows}>
      {TRACKS.map(track => {
        const isPlaying = playing === track.id;
        return (
          <View key={track.id} style={styles.row}>
            <View style={styles.text}>
              <Text style={[styles.title, isPlaying && styles.titlePlaying]}>
                {track.title}
              </Text>
              <Text style={styles.reference}>{REFERENCE}</Text>
            </View>
            <ProgressRing
              value={listened[track.id] / STEPS}
              accessibilityLabel={`${track.title} listened`}
            >
              <RoundButton
                icon={isPlaying ? Waveform : ArrowRight}
                accessibilityLabel={
                  isPlaying ? `Pause ${track.title}` : `Play ${track.title}`
                }
                onPress={() => play(track.id)}
                testID={`gallery-passage-${track.id}`}
              />
            </ProgressRing>
          </View>
        );
      })}
    </View>
  );
}

/** Flat lives in the dark player header: the minimize arrow (Canvas). */
function PlayerHeader() {
  const [minimized, setMinimized] = useState(false);
  const styles = useThemedStyles(t => ({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.lg,
      padding: t.spacing.lg,
      borderRadius: t.radius.sm,
      backgroundColor: t.roles.bgDefault,
    },
    text: { flex: 1, gap: t.spacing.xs },
    title: {
      color: t.roles.fgPrimary,
      fontSize: t.typography.sizes.lg,
      includeFontPadding: false,
    },
    hint: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.sm,
      includeFontPadding: false,
    },
  }));

  return (
    <View style={styles.header}>
      <RoundButton
        variant="flat"
        icon={ArrowDown}
        accessibilityLabel="Minimize player"
        onPress={() => setMinimized(m => !m)}
        testID="gallery-player-minimize"
      />
      <View style={styles.text}>
        <Text style={styles.title}>The Last Supper</Text>
        <Text style={styles.hint}>
          {minimized ? 'Minimized to the Now playing bar' : 'Full player'}
        </Text>
      </View>
    </View>
  );
}

export function RoundButtonEntry() {
  const styles = useThemedStyles(t => ({
    demos: { gap: t.spacing.xxl },
    demo: { gap: t.spacing.sm },
    demoTitle: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.sm,
      fontWeight: t.typography.weights.semibold,
      includeFontPadding: false,
    },
  }));

  return (
    <View style={styles.demos}>
      <View style={styles.demo}>
        <Text style={styles.demoTitle}>Passages · The Last Supper (Soft)</Text>
        <PassageRows />
      </View>
      <View style={styles.demo}>
        <Text style={styles.demoTitle}>Player header (Flat)</Text>
        <ColorModeScope value="canvas">
          <PlayerHeader />
        </ColorModeScope>
      </View>
    </View>
  );
}
