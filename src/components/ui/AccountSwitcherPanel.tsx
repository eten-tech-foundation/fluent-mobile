import React, { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme, touchHitSlop } from '../../theme';
import { Check, UserPlus, X } from 'lucide-react-native';
import { RootStackParamList } from '../../types/navigation/types';
import { useDeviceAccounts } from '../../hooks/useDeviceAccounts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Nav = StackNavigationProp<RootStackParamList>;

interface AccountSwitcherPanelProps {
  visible: boolean;
  onClose: () => void;
}

export function AccountSwitcherPanel({
  visible,
  onClose,
}: AccountSwitcherPanelProps) {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { accounts, hasAccountLimit, loading } = useDeviceAccounts(visible);

  const handleOpenAddAccount = useCallback(() => {
    onClose();
    navigation.navigate('AddUser');
  }, [navigation, onClose]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + theme.spacing.lg },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Accounts on this device</Text>

            <TouchableOpacity
              onPress={onClose}
              hitSlop={touchHitSlop}
              accessibilityRole="button"
              accessibilityLabel="Close account switcher"
              style={styles.closeButton}
            >
              <X size={22} color={theme.colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={styles.list}>
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : (
              accounts.map(account => (
                <TouchableOpacity
                  key={account.userId}
                  style={[
                    styles.accountRow,
                    account.isActive && styles.accountRowActive,
                  ]}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${account.displayName}`}
                  accessibilityState={{ selected: account.isActive }}
                  testID={`account-switcher-row-${account.userId}`}
                >
                  <View
                    style={[
                      styles.avatar,
                      account.isActive && styles.avatarActive,
                    ]}
                  >
                    <Text style={styles.avatarText}>{account.initials}</Text>
                  </View>

                  <View style={styles.accountTextBlock}>
                    <Text style={styles.accountName} numberOfLines={1}>
                      {account.displayName}
                    </Text>
                    {account.email && account.email !== account.displayName ? (
                      <Text style={styles.accountEmail} numberOfLines={1}>
                        {account.email}
                      </Text>
                    ) : null}
                  </View>

                  {account.isActive ? (
                    <Check
                      size={24}
                      color={theme.colors.primary}
                      strokeWidth={2.5}
                      testID={`account-switcher-active-${account.userId}`}
                    />
                  ) : (
                    <View style={styles.trailingPlaceholder} />
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>

          <View style={styles.footer}>
            <View style={styles.divider} />
            {hasAccountLimit ? (
              <Text style={styles.limitText}>
                You&apos;ve reached the 3-account limit.
              </Text>
            ) : (
              <TouchableOpacity
                style={styles.addRow}
                onPress={() => {
                  void handleOpenAddAccount();
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Add Account"
                testID="account-switcher-add-account"
              >
                <View style={styles.addIconCircle}>
                  <UserPlus
                    size={22}
                    color={theme.colors.foreground}
                    strokeWidth={2}
                  />
                </View>
                <Text style={styles.addRowText}>Add Account</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(10, 18, 40, 0.44)',
  },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderColor: theme.colors.border,
    borderTopWidth: 1,
  },
  header: {
    minHeight: 72,
    paddingHorizontal: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
    paddingRight: theme.spacing.md,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingTop: theme.spacing.xs,
  },
  loadingRow: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountRow: {
    minHeight: 100,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  accountRowActive: {
    backgroundColor: '#F3F7FF',
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
    paddingLeft: theme.spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActive: {
    backgroundColor: '#2E5BD8',
  },
  avatarText: {
    color: theme.colors.primaryForeground,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0,
  },
  accountTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.foreground,
  },
  accountEmail: {
    marginTop: 4,
    fontSize: theme.typography.sizes.md,
    color: theme.colors.mutedForeground,
  },
  trailingPlaceholder: {
    width: 24,
    height: 24,
  },
  footer: {
    paddingTop: theme.spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  addRow: {
    minHeight: 86,
    paddingHorizontal: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  addIconCircle: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.full,
    backgroundColor: '#F1F4FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRowText: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
  limitText: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    fontSize: theme.typography.sizes.md,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
  },
});
