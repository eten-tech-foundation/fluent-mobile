import React from 'react';
import { useWindowDimensions, type ColorValue } from 'react-native';
import { Drawer, type DrawerContentComponentProps } from 'expo-router/drawer';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useAuthSession } from '../../navigation/AuthSessionProvider';
import {
  DRAWER_MENU_ICON_SIZE,
  UserSettingsMenu,
  drawerMenuItemStyle,
  drawerMenuLabelStyle,
} from '../../components/ui/UserSettingsMenu';
import { theme } from '../../theme';

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
  const drawerWidth = Math.min(320, width * 0.82);

  return (
    <Drawer
      drawerContent={SettingsDrawerContent}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        swipeEnabled: true,
        // Drawer draws under the status bar; content pads via DrawerContentScrollView.
        overlayColor: theme.colors.drawerOverlay,
        drawerActiveTintColor: theme.colors.primary,
        drawerInactiveTintColor: theme.colors.foreground,
        drawerActiveBackgroundColor: 'transparent',
        drawerInactiveBackgroundColor: 'transparent',
        drawerItemStyle: drawerMenuItemStyle,
        drawerLabelStyle: drawerMenuLabelStyle,
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
