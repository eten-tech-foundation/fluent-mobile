import React from 'react';
import { useRouter } from 'expo-router';
import { resolveRecoveryHref } from '../../navigation/recoveryHref';
import { useWindowDimensions, type ColorValue } from 'react-native';
import { Drawer, type DrawerContentComponentProps } from 'expo-router/drawer';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useAuthSession } from '../../navigation/AuthSessionProvider';
import { useRecordCaptureGate } from '../../navigation/useRecordCaptureGate';
import { useLaunchRecoveryPrompt } from '../../services/useLaunchRecoveryPrompt';
import {
  DRAWER_MENU_ICON_SIZE,
  UserSettingsMenu,
  drawerMenuItemStyle,
  useDrawerMenuLabelStyles,
} from '../../components/ui/UserSettingsMenu';
import { useTheme, useUiVersion } from '../../theme/useTheme';
import { logger } from '../../utils/logger';

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
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const drawerLabelStyles = useDrawerMenuLabelStyles();
  const router = useRouter();

  const uiVersion = useUiVersion();

  useLaunchRecoveryPrompt({
    onResume: async marker => {
      try {
        const href = await resolveRecoveryHref(marker, uiVersion);
        if (!href) return false;
        router.navigate(href);
        return true;
      } catch (error) {
        log.warn('Resume navigation failed', { error });
        return false;
      }
    },
  });
  const drawerWidth = Math.min(320, width * 0.82);
  const recordCaptureActive = useRecordCaptureGate();

  return (
    <Drawer
      drawerContent={SettingsDrawerContent}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        // Disabled while a take is recording/paused so swipe cannot leave drafting (#568).
        // Next has no drawer button; its accounts sheet opens from the avatar.
        swipeEnabled: !recordCaptureActive && uiVersion !== 'next',
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
