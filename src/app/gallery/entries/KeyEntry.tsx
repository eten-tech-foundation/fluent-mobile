import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Key, type KeyIconProps } from '../../../components/ui/Key';
import { KeyDeck } from '../../../components/ui/KeyDeck';
import { useThemedStyles } from '../../../theme/useTheme';

/** Figma keys use filled Phosphor glyphs; fill the Lucide equivalents to match. */
function filled(Icon: LucideIcon) {
  return function FilledIcon({ color, size }: KeyIconProps) {
    return <Icon color={color} fill={color} size={size} />;
  };
}

const PlayIcon = filled(Play);
const PauseIcon = filled(Pause);
const SkipBackIcon = filled(SkipBack);
const SkipForwardIcon = filled(SkipForward);

const VERSE_COUNT = 5;

/**
 * Transport demo in the Hardware panel's key deck (Play · Previous · Next):
 * Play latches while playing, and the skip keys disable at the first / last
 * verse, so every Key state shows up through real use.
 */
export function KeyEntry() {
  const [playing, setPlaying] = useState(false);
  const [verse, setVerse] = useState(1);
  const styles = useThemedStyles(t => ({
    demos: { gap: t.spacing.lg },
    demo: { gap: t.spacing.sm },
    demoTitle: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.sm,
      fontWeight: t.typography.weights.semibold,
      includeFontPadding: false,
    },
    status: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.sm,
      includeFontPadding: false,
    },
    transportKey: { flex: 1 },
    compactKey: { width: 72, height: 72 },
  }));

  const togglePlay = () => setPlaying(p => !p);

  return (
    <View style={styles.demos}>
      <View style={styles.demo}>
        <Text style={styles.demoTitle}>Transport</Text>
        <KeyDeck>
          <Key
            icon={playing ? PauseIcon : PlayIcon}
            accessibilityLabel="Play"
            active={playing}
            onPress={togglePlay}
            style={styles.transportKey}
            testID="gallery-key-play"
          />
          <Key
            icon={SkipBackIcon}
            accessibilityLabel="Previous verse"
            onPress={() => setVerse(v => v - 1)}
            disabled={verse === 1}
            style={styles.transportKey}
            testID="gallery-key-back"
          />
          <Key
            icon={SkipForwardIcon}
            accessibilityLabel="Next verse"
            onPress={() => setVerse(v => v + 1)}
            disabled={verse === VERSE_COUNT}
            style={styles.transportKey}
            testID="gallery-key-forward"
          />
        </KeyDeck>
        <Text style={styles.status}>
          Verse {verse} of {VERSE_COUNT} · {playing ? 'Playing' : 'Paused'}
        </Text>
      </View>

      <View style={styles.demo}>
        <Text style={styles.demoTitle}>Now playing (72 × 72)</Text>
        <Key
          icon={playing ? PauseIcon : PlayIcon}
          accessibilityLabel="Play"
          active={playing}
          onPress={togglePlay}
          style={styles.compactKey}
          testID="gallery-key-now-playing"
        />
      </View>
    </View>
  );
}
