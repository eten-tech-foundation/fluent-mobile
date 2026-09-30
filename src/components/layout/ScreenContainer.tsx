import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '../../theme/useTheme';

interface ScreenContainerProps {
  children: React.ReactNode;
  /** Top inset only — bottom chrome is padded on scroll/footer content for edge-to-edge. */
  edges?: 'top'[];
}

export function ScreenContainer({
  children,
  edges = [],
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(theme => ({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
  }));
  const paddingTop = edges.includes('top') ? insets.top : 0;

  return <View style={[styles.container, { paddingTop }]}>{children}</View>;
}
