import { theme } from '../../theme';
import { touchHitSlop } from '../../theme/iconSpecs';
import { getAccountInitials } from '../../utils/accountDisplay';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

interface AccountInitialsButtonProps {
  firstName?: string;
  lastName?: string;
  email?: string;
  onPress: () => void;
}

export function AccountInitialsButton({
  firstName,
  lastName,
  email,
  onPress,
}: AccountInitialsButtonProps) {
  const initials = getAccountInitials({ firstName, lastName, email });

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
