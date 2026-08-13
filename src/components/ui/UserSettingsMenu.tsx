import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { UserPlus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme';
import { appStyles } from '../../app/appStyles';
import { hrefs } from '../../navigation/hrefs';
import { getActiveUserId } from '../../services/storage';
import {
  signOutCurrentDeviceAccount,
  switchToDeviceAccount,
} from '../../services/accountSession';
import { useDeviceAccounts } from '../../hooks/useDeviceAccounts';
import { logger } from '../../utils/logger';

const MENU_ICON_COLOR = '#333';
const MENU_ICON_ACTIVE = '#1a6ef5';

const log = logger.create('UserSettingsMenu');

interface UserSettingsMenuProps {
  onSignOut?: () => void;
  onUserSwitched?: () => void;
}

type DrawerNavigation = {
  closeDrawer: () => void;
};

/**
 * Authenticated settings / accounts panel rendered as Expo Router Drawer content.
 */
export function UserSettingsMenu({
  onSignOut,
  onUserSwitched,
}: UserSettingsMenuProps) {
  const router = useRouter();
  const navigation = useNavigation<DrawerNavigation>();
  const insets = useSafeAreaInsets();
  const { accounts, hasAccountLimit, loading } = useDeviceAccounts(true);
  const [switchingUserId, setSwitchingUserId] = useState<string | null>(null);

  const closeDrawer = () => {
    navigation.closeDrawer();
  };

  const handleOpenSettings = () => {
    closeDrawer();
    router.push(hrefs.settings);
  };

  const handleAddUser = () => {
    if (hasAccountLimit) return;
    closeDrawer();
    router.push(hrefs.addUser);
  };

  const handleOpenPrivacy = () => {
    closeDrawer();
    router.push(hrefs.privacyPolicyApp);
  };

  const handleOpenTerms = () => {
    closeDrawer();
    router.push(hrefs.termsOfUseApp);
  };

  const handleSwitchUser = async (userId: string) => {
    if (userId === getActiveUserId() || switchingUserId) {
      closeDrawer();
      return;
    }

    setSwitchingUserId(userId);
    try {
      await switchToDeviceAccount(userId);
      closeDrawer();
      onUserSwitched?.();
    } catch (error) {
      log.error('Account switch failed', { userId, error });
      closeDrawer();
      Alert.alert(
        'Switch Failed',
        "Couldn't switch to that account. Its saved session may be corrupted — try adding it again.",
      );
    } finally {
      setSwitchingUserId(null);
    }
  };

  const handleSignOut = async () => {
    closeDrawer();
    const result = await signOutCurrentDeviceAccount();
    if (result.kind === 'switched') {
      onUserSwitched?.();
      return;
    }
    onSignOut?.();
  };

  return (
    <View
      style={[
        styles.panel,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      testID="settings-drawer-content"
    >
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.panelContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={appStyles.menuItem}
          onPress={handleOpenSettings}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Ionicons name="settings-outline" size={18} color={MENU_ICON_COLOR} />
          <Text style={appStyles.menuItemText}>More Settings</Text>
        </TouchableOpacity>

        <View style={[appStyles.menuDivider, styles.panelDivider]} />

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

        <View style={[appStyles.menuDivider, styles.panelDivider]} />
        <Text style={appStyles.menuSectionLabel}>Accounts</Text>

        {loading ? (
          <View
            style={styles.loadingRow}
            testID="settings-menu-accounts-loading"
          >
            <ActivityIndicator size="small" color={MENU_ICON_ACTIVE} />
          </View>
        ) : (
          accounts.map(account => {
            const accountLabel = account.email || account.displayName;
            return (
              <TouchableOpacity
                key={account.userId}
                style={appStyles.menuItem}
                onPress={() => {
                  void handleSwitchUser(account.userId);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${accountLabel}`}
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
                  {accountLabel}
                </Text>
              </TouchableOpacity>
            );
          })
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

        <View style={[appStyles.menuDivider, styles.panelDivider]} />
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: theme.colors.cardBackground,
  },
  scrollArea: {
    flex: 1,
  },
  panelContent: {
    paddingTop: 24,
  },
  panelDivider: {
    backgroundColor: theme.colors.border,
  },
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
