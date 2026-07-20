import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { UserPlus } from 'lucide-react-native';
import { appStyles } from '../../app/appStyles';
import { RootStackParamList } from '../../types/navigation/types';
import {
  getActiveUserId,
  getKnownUserIds,
  kvStorage,
  KV_KEYS,
  switchActiveUser,
} from '../../services/storage';
import { clearCredentials, getCredentials } from '../../services/keychain';
import { FluentAPI } from '../../services/api';
import { signOut } from '../../services/authSession';
import { authToken } from '../../services/authToken';
import { useDeviceAccounts } from '../../hooks/useDeviceAccounts';
import { logger } from '../../utils/logger';

const MENU_ICON_COLOR = '#333';
const MENU_ICON_ACTIVE = '#1a6ef5';

const log = logger.create('UserSettingsMenu');

type Nav = StackNavigationProp<RootStackParamList>;

interface UserSettingsMenuProps {
  visible: boolean;
  onClose: () => void;
  anchor: { top: number; left: number };
  onSignOut?: () => void;
  onUserSwitched?: () => void;
}

export function UserSettingsMenu({
  visible,
  onClose,
  anchor,
  onSignOut,
  onUserSwitched,
}: UserSettingsMenuProps) {
  const navigation = useNavigation<Nav>();
  const { accounts, hasAccountLimit, loading } = useDeviceAccounts(visible);
  const [switchingUserId, setSwitchingUserId] = useState<string | null>(null);

  const handleOpenSettings = () => {
    onClose();
    navigation.navigate('Settings');
  };

  const handleAddUser = () => {
    if (hasAccountLimit) return;
    onClose();
    navigation.navigate('AddUser');
  };

  const handleOpenPrivacy = () => {
    onClose();
    navigation.navigate('PrivacyPolicy');
  };

  const handleOpenTerms = () => {
    onClose();
    navigation.navigate('TermsOfUse');
  };

  const handleSwitchUser = async (userId: string) => {
    if (userId === getActiveUserId() || switchingUserId) {
      onClose();
      return;
    }

    setSwitchingUserId(userId);
    try {
      const creds = await getCredentials(userId);
      if (!creds?.token) {
        throw new Error('No usable stored session for this account');
      }

      authToken.set(creds.token);
      switchActiveUser(userId);
      onClose();
      onUserSwitched?.();
    } catch (error) {
      log.error('Account switch failed', { userId, error });
      onClose();
      Alert.alert(
        'Switch Failed',
        "Couldn't switch to that account. Its saved session may be corrupted — try adding it again.",
      );
    } finally {
      setSwitchingUserId(null);
    }
  };

  const handleSignOut = async () => {
    onClose();
    const currentUserId = getActiveUserId();

    try {
      await FluentAPI.signOut();
    } catch (e) {
      log.error('Server sign out failed', { error: e });
    }

    await clearCredentials(currentUserId);

    const remaining = getKnownUserIds().filter(id => id !== currentUserId);
    kvStorage.setItemSync(KV_KEYS.KNOWN_USER_IDS, remaining.join(','));
    log.info('User signed out', { userId: currentUserId });

    if (remaining.length > 0) {
      const nextUserId = remaining[0];
      const creds = await getCredentials(nextUserId);
      authToken.set(creds?.token ?? null);
      switchActiveUser(nextUserId);
      onUserSwitched?.();
    } else {
      signOut();
      onSignOut?.();
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={appStyles.modalOverlay} onPress={onClose}>
        <View
          style={[appStyles.dropdown, { top: anchor.top, left: anchor.left }]}
        >
          <TouchableOpacity
            style={appStyles.menuItem}
            onPress={handleOpenSettings}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Ionicons
              name="settings-outline"
              size={18}
              color={MENU_ICON_COLOR}
            />
            <Text style={appStyles.menuItemText}>More Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={appStyles.menuItem}
            onPress={handleOpenPrivacy}
            activeOpacity={0.7}
            accessibilityRole="button"
            testID="settings-menu-privacy-policy"
          >
            <Ionicons
              name="document-text-outline"
              size={18}
              color={MENU_ICON_COLOR}
            />
            <Text style={appStyles.menuItemText}>Privacy Policy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={appStyles.menuItem}
            onPress={handleOpenTerms}
            activeOpacity={0.7}
            accessibilityRole="button"
            testID="settings-menu-terms-of-use"
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={18}
              color={MENU_ICON_COLOR}
            />
            <Text style={appStyles.menuItemText}>Terms of Use</Text>
          </TouchableOpacity>

          <View style={appStyles.menuDivider} />
          <Text style={appStyles.menuSectionLabel}>Accounts</Text>

          {loading ? (
            <View
              style={styles.loadingRow}
              testID="settings-menu-accounts-loading"
            >
              <ActivityIndicator size="small" color={MENU_ICON_ACTIVE} />
            </View>
          ) : (
            accounts.map(account => (
              <TouchableOpacity
                key={account.userId}
                style={appStyles.menuItem}
                onPress={() => {
                  void handleSwitchUser(account.userId);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${account.displayName}`}
                accessibilityState={{ selected: account.isActive }}
                disabled={switchingUserId !== null}
                testID={`settings-menu-account-${account.userId}`}
              >
                <Ionicons
                  name={
                    account.isActive ? 'checkmark-circle' : 'person-outline'
                  }
                  size={18}
                  color={account.isActive ? MENU_ICON_ACTIVE : MENU_ICON_COLOR}
                  testID={
                    account.isActive
                      ? `settings-menu-active-${account.userId}`
                      : `settings-menu-inactive-${account.userId}`
                  }
                />
                <Text
                  style={[
                    appStyles.menuItemText,
                    account.isActive && appStyles.menuItemActive,
                  ]}
                  numberOfLines={1}
                >
                  {account.displayName}
                </Text>
              </TouchableOpacity>
            ))
          )}

          {hasAccountLimit ? (
            <Text style={styles.limitText} testID="settings-menu-account-limit">
              You&apos;ve reached the 3-account limit.
            </Text>
          ) : (
            <TouchableOpacity
              style={appStyles.menuItem}
              onPress={handleAddUser}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add User"
              testID="settings-menu-add-user"
            >
              <UserPlus size={18} color={MENU_ICON_COLOR} />
              <Text style={appStyles.menuItemText}>Add User</Text>
            </TouchableOpacity>
          )}

          <View style={appStyles.menuDivider} />
          <TouchableOpacity
            style={appStyles.menuItem}
            onPress={() => {
              void handleSignOut();
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Ionicons name="log-out-outline" size={18} color="#d32f2f" />
            <Text style={[appStyles.menuItemText, appStyles.menuItemDanger]}>
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  limitText: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
  },
});
