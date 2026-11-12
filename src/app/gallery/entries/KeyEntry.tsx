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

/** Mark 14:22–25, stepped through in verse mode. */
const VERSES = [22, 23, 24, 25];

/**
 * Listen's keys in verse mode (Play · Previous · Next): Play latches while
 * playing, and Previous and Next step verses, off at the first and last, so
 * every Key state shows up through real use.
 */
export function KeyEntry() {
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(1);
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
  }));
  const previous = VERSES[at - 1];
  const next = VERSES[at + 1];

  const togglePlay = () => setPlaying(p => !p);

  return (
    <View style={styles.demos}>
      <View style={styles.demo}>
        <Text style={styles.demoTitle}>Transport</Text>
        <KeyDeck>
          <Key
            icon={playing ? PauseFill : PlayFill}
            accessibilityLabel={
              playing ? 'Pause source audio' : 'Play source audio'
            }
            announceLatched={false}
            active={playing}
            onPress={togglePlay}
            style={styles.transportKey}
            testID="gallery-key-play"
          />
          <Key
            icon={SkipBackFill}
            accessibilityLabel={
              previous === undefined
                ? 'Previous'
                : `Previous: verse ${previous}`
            }
            onPress={() => setAt(a => a - 1)}
            disabled={previous === undefined}
            style={styles.transportKey}
            testID="gallery-key-back"
          />
          <Key
            icon={SkipForwardFill}
            accessibilityLabel={
              next === undefined ? 'Next' : `Next: verse ${next}`
            }
            onPress={() => setAt(a => a + 1)}
            disabled={next === undefined}
            style={styles.transportKey}
            testID="gallery-key-forward"
          />
        </KeyDeck>
        <Text style={styles.status}>
          Mark 14:{VERSES[at]} · {playing ? 'Playing' : 'Paused'}
        </Text>
      </View>
    </View>
  );
}
