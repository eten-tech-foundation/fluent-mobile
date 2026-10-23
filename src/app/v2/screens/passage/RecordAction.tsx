import React from 'react';
import { View } from 'react-native';
import {
  RecordFill,
  type NextIconProps,
} from '../../../../components/ui/icons';
import { RoundButton } from '../../../../components/ui/RoundButton';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';

function RecordIcon({ size }: NextIconProps) {
  const theme = useTheme();
  return <RecordFill color={theme.roles.accentRecord} size={size} />;
}

/**
 * The hero's Record: a Flat Round button with a red dot, ringed in
 * accent/record like the Soft rim, beside the labelled Listen.
 */
export function RecordAction({
  accessibilityLabel,
  onPress,
  testID,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string;
}) {
  const styles = useThemedStyles(t => ({
    ring: {
      borderRadius: t.radius.full,
      borderWidth: t.stroke[2],
      borderColor: t.roles.accentRecord,
      padding: t.spacing.xxs,
    },
  }));
  return (
    <View style={styles.ring}>
      <RoundButton
        variant="flat"
        icon={RecordIcon}
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        testID={testID}
      />
    </View>
  );
}
