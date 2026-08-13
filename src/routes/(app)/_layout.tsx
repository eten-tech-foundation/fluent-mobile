import React from 'react';
import { useWindowDimensions } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { useAuthSession } from '../../navigation/AuthSessionProvider';
import { UserSettingsMenu } from '../../components/ui/UserSettingsMenu';
import { theme } from '../../theme';

function SettingsDrawerContent({
  navigation,
}: {
  navigation: { closeDrawer: () => void };
}) {
  const { signOut, notifyUserSwitched } = useAuthSession();
  return (
    <UserSettingsMenu
      onSignOut={signOut}
      onUserSwitched={notifyUserSwitched}
      onRequestClose={() => navigation.closeDrawer()}
    />
  );
}

export default function AppDrawerLayout() {
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(320, width * 0.82);

  return (
    <Drawer
      drawerContent={props => <SettingsDrawerContent {...props} />}
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
