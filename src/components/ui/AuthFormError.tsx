import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { theme } from '../../theme';
import { authFormStyles as styles } from '../../app/tabs/authFormStyles';

interface AuthFormErrorProps {
  text?: string;
  testID?: string;
}

export function AuthFormError({ text, testID }: AuthFormErrorProps) {
  if (!text) {
    return null;
  }

  return (
    <View
      style={styles.errorRow}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <Ionicons
        name="alert-circle"
        size={16}
        color={theme.colors.destructive}
      />
      <Text style={styles.errorText}>{text}</Text>
    </View>
  );
}
