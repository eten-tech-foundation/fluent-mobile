import React from 'react';
import SettingsScreen from '../../../app/screens/SettingsScreen';
import { useAuthSession } from '../../../navigation/AuthSessionProvider';

export default function SettingsRoute() {
  const { signOut } = useAuthSession();
  return <SettingsScreen onSignOut={signOut} />;
}
