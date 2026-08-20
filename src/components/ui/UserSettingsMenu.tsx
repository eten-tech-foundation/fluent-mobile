import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Alert,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  DrawerContentScrollView,
  DrawerItem,
  useDrawerStatus,
  type DrawerContentComponentProps,
} from 'expo-router/drawer';
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

const log = logger.create('UserSettingsMenu');

/** Match legacy `appStyles.menuItem` icon size (not DrawerItem’s default 24). */
export const DRAWER_MENU_ICON_SIZE = 18;

/** Drawer route names rendered manually (hidden from DrawerItemList). */
const DRAWER_ROUTE_SETTINGS = 'settings';
const DRAWER_ROUTE_PRIVACY = 'privacy-policy';
const DRAWER_ROUTE_TERMS = 'terms-of-use';

/**
 * Outer DrawerItem container: kill default pill radius / horizontal margins so
 * rows match the old flat `appStyles.menuItem` look. Inner padding stays on
 * DrawerItem’s wrapper (16 / 11).
 */
export const drawerMenuItemStyle: ViewStyle = {
  marginHorizontal: 0,
  marginVertical: 0,
  borderRadius: 0,
};

/**
 * Account rows: compact margins, but leave `borderRadius` unset so DrawerItem’s
 * default pill (56) applies with the focused primary wash.
 */
export const drawerAccountItemStyle: ViewStyle = {
  marginHorizontal: 0,
  marginVertical: 0,
};

export const drawerMenuLabelStyle: TextStyle = {
  fontSize: 14,
  fontWeight: theme.typography.weights.regular,
  lineHeight: theme.typography.lineHeights.tight,
};

export const drawerMenuActiveLabelStyle: TextStyle = {
  fontWeight: theme.typography.weights.semibold,
};

interface UserSettingsMenuProps extends DrawerContentComponentProps {
  onSignOut?: () => void;
  onUserSwitched?: () => void;
}

/**
 * Expo Router drawer content: More Settings, then a separator, then Privacy /
 * Terms as manual `DrawerItem`s (so we can insert a mid-list divider). Account
 * actions are not file routes. Compact legacy menu look; Sign Out stays pinned
 * above the bottom safe-area inset.
 */
export function UserSettingsMenu({
  onSignOut,
  onUserSwitched,
  ...drawerProps
}: UserSettingsMenuProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const drawerStatus = useDrawerStatus();
  const { accounts, hasAccountLimit, loading, reload } =
    useDeviceAccounts(true);
  const [switchingUserId, setSwitchingUserId] = useState<string | null>(null);
  const focusedRouteName =
    drawerProps.state.routes[drawerProps.state.index]?.name;

  useEffect(() => {
    if (drawerStatus === 'open') {
      void reload();
    }
  }, [drawerStatus, reload]);

  const closeDrawer = () => {
    drawerProps.navigation.closeDrawer();
  };

  const navigateDrawerRoute = (routeName: string) => {
    drawerProps.navigation.navigate(routeName as never);
  };

  const handleAddUser = () => {
    if (hasAccountLimit) return;
    closeDrawer();
    router.push(hrefs.addUser);
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
    try {
      const result = await signOutCurrentDeviceAccount();
      if (result.kind === 'switched') {
        onUserSwitched?.();
        return;
      }
      onSignOut?.();
    } catch (error) {
      log.error('Sign out failed', { error });
      Alert.alert(
        'Sign Out Failed',
        "Couldn't sign out of this account. Please try again.",
      );
    }
  };

  return (
    <>
      {drawerStatus === 'open' ? (
        <StatusBar
          barStyle="dark-content"
          backgroundColor={theme.colors.cardBackground}
        />
      ) : null}
      <View style={styles.root} testID="settings-drawer-content">
        <DrawerContentScrollView
          {...drawerProps}
          style={styles.scroll}
          // Override default bottom inset — Sign Out footer owns safe-area padding.
          contentContainerStyle={styles.scrollContent}
        >
          <DrawerItem
            label="More Settings"
            focused={focusedRouteName === DRAWER_ROUTE_SETTINGS}
            activeTintColor={theme.colors.primary}
            inactiveTintColor={theme.colors.foreground}
            activeBackgroundColor="transparent"
            inactiveBackgroundColor="transparent"
            style={drawerMenuItemStyle}
            labelStyle={[
              drawerMenuLabelStyle,
              focusedRouteName === DRAWER_ROUTE_SETTINGS &&
                drawerMenuActiveLabelStyle,
            ]}
            onPress={() => {
              navigateDrawerRoute(DRAWER_ROUTE_SETTINGS);
            }}
            icon={({ color }) => (
              <Ionicons
                name="settings-outline"
                size={DRAWER_MENU_ICON_SIZE}
                color={color}
              />
            )}
            accessibilityLabel="More Settings"
            testID="settings-menu-more-settings"
          />

          <View
            style={[appStyles.menuDivider, styles.panelDivider]}
            testID="settings-menu-legal-divider"
          />

          <DrawerItem
            label="Privacy Policy"
            focused={focusedRouteName === DRAWER_ROUTE_PRIVACY}
            activeTintColor={theme.colors.primary}
            inactiveTintColor={theme.colors.foreground}
            activeBackgroundColor="transparent"
            inactiveBackgroundColor="transparent"
            style={drawerMenuItemStyle}
            labelStyle={[
              drawerMenuLabelStyle,
              focusedRouteName === DRAWER_ROUTE_PRIVACY &&
                drawerMenuActiveLabelStyle,
            ]}
            onPress={() => {
              navigateDrawerRoute(DRAWER_ROUTE_PRIVACY);
            }}
            icon={({ color }) => (
              <Ionicons
                name="document-text-outline"
                size={DRAWER_MENU_ICON_SIZE}
                color={color}
              />
            )}
            accessibilityLabel="Privacy Policy"
            testID="settings-menu-privacy-policy"
          />

          <DrawerItem
            label="Terms of Use"
            focused={focusedRouteName === DRAWER_ROUTE_TERMS}
            activeTintColor={theme.colors.primary}
            inactiveTintColor={theme.colors.foreground}
            activeBackgroundColor="transparent"
            inactiveBackgroundColor="transparent"
            style={drawerMenuItemStyle}
            labelStyle={[
              drawerMenuLabelStyle,
              focusedRouteName === DRAWER_ROUTE_TERMS &&
                drawerMenuActiveLabelStyle,
            ]}
            onPress={() => {
              navigateDrawerRoute(DRAWER_ROUTE_TERMS);
            }}
            icon={({ color }) => (
              <Ionicons
                name="shield-checkmark-outline"
                size={DRAWER_MENU_ICON_SIZE}
                color={color}
              />
            )}
            accessibilityLabel="Terms of Use"
            testID="settings-menu-terms-of-use"
          />

          <View style={[appStyles.menuDivider, styles.panelDivider]} />
          <Text style={appStyles.menuSectionLabel}>Accounts</Text>

          {loading ? (
            <View
              style={styles.loadingRow}
              testID="settings-menu-accounts-loading"
            >
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : (
            accounts.map(account => {
              const accountLabel = account.email || account.displayName;
              return (
                <DrawerItem
                  key={account.userId}
                  label={accountLabel}
                  focused={account.isActive}
                  activeTintColor={theme.colors.primary}
                  inactiveTintColor={theme.colors.foreground}
                  // Omit activeBackgroundColor → DrawerItem default
                  // Color(activeTintColor).alpha(0.12) pill wash when focused.
                  inactiveBackgroundColor="transparent"
                  style={drawerAccountItemStyle}
                  labelStyle={[
                    drawerMenuLabelStyle,
                    account.isActive && drawerMenuActiveLabelStyle,
                  ]}
                  onPress={() => {
                    void handleSwitchUser(account.userId);
                  }}
                  icon={({ color }) => (
                    <Ionicons
                      name={
                        account.isActive ? 'checkmark-circle' : 'person-outline'
                      }
                      size={DRAWER_MENU_ICON_SIZE}
                      color={color}
                      testID={
                        account.isActive
                          ? `settings-menu-active-${account.userId}`
                          : `settings-menu-inactive-${account.userId}`
                      }
                    />
                  )}
                  accessibilityLabel={`Switch to ${accountLabel}`}
                  testID={`settings-menu-account-${account.userId}`}
                />
              );
            })
          )}

          {hasAccountLimit ? (
            <Text style={styles.limitText} testID="settings-menu-account-limit">
              You&apos;ve reached the 3-account limit.
            </Text>
          ) : (
            <DrawerItem
              label="Add User"
              inactiveTintColor={theme.colors.foreground}
              activeBackgroundColor="transparent"
              inactiveBackgroundColor="transparent"
              style={drawerMenuItemStyle}
              labelStyle={drawerMenuLabelStyle}
              onPress={handleAddUser}
              icon={({ color }) => (
                <UserPlus size={DRAWER_MENU_ICON_SIZE} color={color} />
              )}
              accessibilityLabel="Add User"
              testID="settings-menu-add-user"
            />
          )}
        </DrawerContentScrollView>

        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, theme.spacing.xs) },
          ]}
        >
          <View style={[appStyles.menuDivider, styles.panelDivider]} />
          <DrawerItem
            label="Sign Out"
            inactiveTintColor={theme.colors.destructive}
            activeBackgroundColor="transparent"
            inactiveBackgroundColor="transparent"
            style={drawerMenuItemStyle}
            labelStyle={[drawerMenuLabelStyle, appStyles.menuItemDanger]}
            onPress={() => {
              void handleSignOut();
            }}
            icon={({ color }) => (
              <Ionicons
                name="log-out-outline"
                size={DRAWER_MENU_ICON_SIZE}
                color={color}
              />
            )}
            accessibilityLabel="Sign Out"
            testID="settings-menu-sign-out"
          />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.cardBackground,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing.sm,
  },
  footer: {
    backgroundColor: theme.colors.cardBackground,
  },
  panelDivider: {
    backgroundColor: theme.colors.border,
  },
  loadingRow: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
  },
  limitText: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + theme.spacing.xs,
    fontSize: 13,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
  },
});
