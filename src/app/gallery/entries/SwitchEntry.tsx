import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Switch } from '../../../components/ui/Switch';
import { useThemedStyles } from '../../../theme/useTheme';

/**
 * Playback options: "Loop this verse" is disabled while auto-play is on, so
 * Off, On and Disabled all show up through real use.
 */
export function SwitchEntry() {
  const [autoPlay, setAutoPlay] = useState(false);
  const [loop, setLoop] = useState(false);
  const styles = useThemedStyles(t => ({
    rows: { gap: t.spacing.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.spacing.lg,
      paddingVertical: t.spacing.sm,
    },
    label: { flex: 1, gap: t.spacing.xs },
    title: {
      color: t.roles.fgPrimary,
      fontSize: t.typography.sizes.md,
      includeFontPadding: false,
    },
    hint: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.sm,
      includeFontPadding: false,
    },
  }));

  const toggleAutoPlay = (on: boolean) => {
    setAutoPlay(on);
    if (on) {
      setLoop(false);
    }
  };

  return (
    <View style={styles.rows}>
      <View style={styles.row}>
        <Text style={[styles.label, styles.title]}>Auto-play next verse</Text>
        <Switch
          value={autoPlay}
          onValueChange={toggleAutoPlay}
          accessibilityLabel="Auto-play next verse"
          testID="gallery-switch-autoplay"
        />
      </View>
      <View style={styles.row}>
        <View style={styles.label}>
          <Text style={styles.title}>Loop this verse</Text>
          {autoPlay ? (
            <Text style={styles.hint}>Turn off auto-play to loop.</Text>
          ) : null}
        </View>
        <Switch
          value={loop}
          onValueChange={setLoop}
          accessibilityLabel="Loop this verse"
          disabled={autoPlay}
          testID="gallery-switch-loop"
        />
      </View>
    </View>
  );
}
