import React from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from '../../../../theme/useTheme';

/** A listening material in the player. Its audio has no source yet (Q11). */
export function MaterialPage({
  name,
  width,
  hidden,
}: {
  name: string;
  width: number;
  hidden: boolean;
}) {
  const styles = useThemedStyles(t => ({
    page: { gap: t.spacing.md },
    name: { ...t.type.heading, color: t.roles.fgPrimary },
    note: { ...t.type.label, color: t.roles.fgSecondary },
  }));
  return (
    <View
      style={[styles.page, { width }]}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.note}>This step's audio isn't connected yet.</Text>
    </View>
  );
}
