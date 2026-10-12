import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useThemedStyles } from '../../theme/useTheme';

interface KeyDeckProps {
  /** `Key`s laid out in a row; give each `style={{ flex: 1 }}` to share the width. */
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Dark chassis the transport keys sit in, with 2pt seams between them
 * (Figma Hardware panel → Keys, node 2411:465).
 */
export function KeyDeck({ children, style, testID }: KeyDeckProps) {
  const styles = useThemedStyles(t => ({
    deck: {
      flexDirection: 'row',
      gap: t.spacing.xxs,
      padding: t.spacing.xxs,
      backgroundColor: t.roles.surfaceInverse,
    },
  }));

  return (
    <View style={[styles.deck, style]} testID={testID}>
      {children}
    </View>
  );
}
