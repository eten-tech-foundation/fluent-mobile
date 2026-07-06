import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { theme } from '../../theme';
import { touchHitSlop } from '../../theme/iconSpecs';

interface AccountInitialsButtonProps {
  firstName?: string;
  lastName?: string;
  email?: string;
  onPress: () => void;
}

function firstCharacter(value?: string): string {
  return value?.trim().charAt(0).toUpperCase() ?? '';
}

function deriveInitials({
  firstName,
  lastName,
  email,
}: Pick<
  AccountInitialsButtonProps,
  'firstName' | 'lastName' | 'email'
>): string {
  const nameInitials = `${firstCharacter(firstName)}${firstCharacter(
    lastName,
  )}`;

  if (nameInitials.length > 0) return nameInitials;

  const emailName = email?.split('@')[0] ?? '';
  const emailParts = emailName.split(/[._\s-]+/).filter(Boolean);
  const emailInitials =
    emailParts.length > 1
      ? `${firstCharacter(emailParts[0])}${firstCharacter(emailParts[1])}`
      : emailName.trim().slice(0, 2).toUpperCase();

  return emailInitials || '?';
}

export function AccountInitialsButton({
  firstName,
  lastName,
  email,
  onPress,
}: AccountInitialsButtonProps) {
  const initials = deriveInitials({ firstName, lastName, email });

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.75}
      hitSlop={touchHitSlop}
      accessibilityRole="button"
      accessibilityLabel="Switch account"
      testID="drafting-account-initials"
    >
      <Text style={styles.initials} numberOfLines={1} adjustsFontSizeToFit>
        {initials}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  initials: {
    color: theme.colors.primaryForeground,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
  },
});
