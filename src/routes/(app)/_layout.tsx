import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { resolveRecoveryHref } from '../../navigation/recoveryHref';
import { useWindowDimensions, type ColorValue } from 'react-native';
import { Drawer, type DrawerContentComponentProps } from 'expo-router/drawer';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useAuthSession } from '../../navigation/AuthSessionProvider';
import { isPausedTakeForeign } from '../../services/pausedTakeOwner';
import { useLaunchRecoveryPrompt } from '../../services/useLaunchRecoveryPrompt';
import {
  DRAWER_MENU_ICON_SIZE,
  UserSettingsMenu,
  drawerMenuItemStyle,
  useDrawerMenuLabelStyles,
} from '../../components/ui/UserSettingsMenu';
import { useTheme } from '../../theme/useTheme';
import { logger } from '../../utils/logger';
import { parseUserId } from '../../utils/parseUserId';
import { markStartup } from '../../utils/startupTrace';

const log = logger.create('AppDrawerLayout');

function SettingsDrawerContent(props: DrawerContentComponentProps) {
  const { signOut, notifyUserSwitched } = useAuthSession();
  return (
    <UserSettingsMenu
      {...props}
      onSignOut={signOut}
      onUserSwitched={notifyUserSwitched}
    />
  );
}

function drawerIcon(name: React.ComponentProps<typeof Ionicons>['name']) {
  return ({ color }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} size={DRAWER_MENU_ICON_SIZE} color={color} />
  );
}

export default function AppDrawerLayout() {
  // Signed-in app group only. A signed-out launch records this at the later
  // sign-in that first mounts the group, not at cold start (#971).
  useEffect(() => {
    markStartup('route_group_mounted');
  }, []);

  const { width } = useWindowDimensions();
  const theme = useTheme();
  const drawerLabelStyles = useDrawerMenuLabelStyles();
  const router = useRouter();

  useLaunchRecoveryPrompt({
    onResume: async marker => {
      const userId = parseUserId();
      if (isPausedTakeForeign(marker, userId)) return false;
      try {
        const result = await resolveRecoveryHref(
          marker,
          () => parseUserId() === userId,
        );
        if (result.status !== 'open') return false;
        if (
          parseUserId() !== userId ||
          isPausedTakeForeign(marker, parseUserId())
        ) {
          return false;
        }
        router.navigate(result.href);
        return true;
      } catch (error) {
        log.warn('Resume navigation failed', { error });
        return false;
      }
    },
  });
  const drawerWidth = Math.min(320, width * 0.82);

  return (
    <Drawer
      drawerContent={SettingsDrawerContent}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        // Next has no drawer edge swipe; accounts open from the avatar.
        // A take's leave guard stays on the screen that owns the capture.
        swipeEnabled: false,
        // Drawer draws under the status bar; content pads via DrawerContentScrollView.
        overlayColor: theme.colors.drawerOverlay,
        drawerActiveTintColor: theme.colors.primary,
        drawerInactiveTintColor: theme.colors.foreground,
        drawerActiveBackgroundColor: 'transparent',
        drawerInactiveBackgroundColor: 'transparent',
        drawerItemStyle: drawerMenuItemStyle,
        drawerLabelStyle: drawerLabelStyles.label,
        drawerStyle: {
          width: drawerWidth,
          backgroundColor: theme.colors.cardBackground,
        },
      }}
    >
      <Drawer.Screen
        name="(stack)"
        options={{
          drawerItemStyle: { display: 'none' },
          title: 'Home',
        }}
      />
      {/* Hidden from DrawerItemList — UserSettingsMenu renders these with a mid-list divider. */}
      <Drawer.Screen
        name="settings"
        options={{
          drawerLabel: 'More Settings',
          title: 'Settings',
          drawerIcon: drawerIcon('settings-outline'),
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="privacy-policy"
        options={{
          drawerLabel: 'Privacy Policy',
          title: 'Privacy Policy',
          drawerIcon: drawerIcon('document-text-outline'),
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="terms-of-use"
        options={{
          drawerLabel: 'Terms of Use',
          title: 'Terms of Use',
          drawerIcon: drawerIcon('shield-checkmark-outline'),
          drawerItemStyle: { display: 'none' },
        }}
      />
    </Drawer>
  );
}
