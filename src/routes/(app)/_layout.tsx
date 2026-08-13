import React from 'react';
import { useWindowDimensions } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { useAuthSession } from '../../navigation/AuthSessionProvider';
import { UserSettingsMenu } from '../../components/ui/UserSettingsMenu';
import { theme } from '../../theme';

function SettingsDrawerContent() {
  const { signOut, notifyUserSwitched } = useAuthSession();
  return (
    <UserSettingsMenu onSignOut={signOut} onUserSwitched={notifyUserSwitched} />
  );
}

export default function AppDrawerLayout() {
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(320, width * 0.82);

  return (
    <Drawer
      drawerContent={() => <SettingsDrawerContent />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        swipeEnabled: true,
        overlayColor: theme.colors.drawerOverlay,
        drawerStyle: {
          width: drawerWidth,
          backgroundColor: theme.colors.cardBackground,
        },
      }}
    >
      <Drawer.Screen name="(stack)" options={{ title: 'Home' }} />
    </Drawer>
  );
}
