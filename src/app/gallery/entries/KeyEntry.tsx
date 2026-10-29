import React, { useState } from 'react';
import { Text, View } from 'react-native';
import {
  PauseFill,
  PlayFill,
  SkipBackFill,
  SkipForwardFill,
} from '../../../components/ui/icons';
import { Key } from '../../../components/ui/Key';
import { KeyDeck } from '../../../components/ui/KeyDeck';
import { useThemedStyles } from '../../../theme/useTheme';

/** The script, then six listening materials. */
const PAGE_COUNT = 7;

/**
 * Transport demo in the Hardware panel's key deck (Play · Previous · Next):
 * Play latches while playing, and the page keys disable on the first / last
 * page, so every Key state shows up through real use.
 */
export function KeyEntry() {
  const [playing, setPlaying] = useState(false);
  const [page, setPage] = useState(1);
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
            icon={playing ? PauseFill : PlayFill}
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            announceLatched={false}
            active={playing}
            onPress={togglePlay}
            style={styles.transportKey}
            testID="gallery-key-play"
          />
          <Key
            icon={SkipBackFill}
            accessibilityLabel="Previous page"
            onPress={() => setPage(p => p - 1)}
            disabled={page === 1}
            style={styles.transportKey}
            testID="gallery-key-back"
          />
          <Key
            icon={SkipForwardFill}
            accessibilityLabel="Next page"
            onPress={() => setPage(p => p + 1)}
            disabled={page === PAGE_COUNT}
            style={styles.transportKey}
            testID="gallery-key-forward"
          />
        </KeyDeck>
        <Text style={styles.status}>
          Page {page} of {PAGE_COUNT} · {playing ? 'Playing' : 'Paused'}
        </Text>
      </View>

      <View style={styles.demo}>
        <Text style={styles.demoTitle}>Now playing (72 × 72)</Text>
        <Key
          icon={playing ? PauseFill : PlayFill}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          announceLatched={false}
          active={playing}
          onPress={togglePlay}
          style={styles.compactKey}
          testID="gallery-key-now-playing"
        />
      </View>
    </View>
  );
}
