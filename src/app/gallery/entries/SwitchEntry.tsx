import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Switch } from '../../../components/ui/Switch';
import { useThemedStyles } from '../../../theme/useTheme';

/** Single playback setting: flip it to feel the slide and the toggle haptic. */
export function SwitchEntry() {
  const [autoPlay, setAutoPlay] = useState(false);
  const styles = useThemedStyles(t => ({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.spacing.lg,
      paddingVertical: t.spacing.sm,
    },
    title: {
      flex: 1,
      color: t.roles.fgPrimary,
      fontSize: t.typography.sizes.md,
      includeFontPadding: false,
    },
  }));

  return (
    <View style={styles.row}>
      <Text style={styles.title}>Auto-play next verse</Text>
      <Switch
        value={autoPlay}
        onValueChange={setAutoPlay}
        accessibilityLabel="Auto-play next verse"
        testID="gallery-switch-autoplay"
      />
    </View>
  );
}
