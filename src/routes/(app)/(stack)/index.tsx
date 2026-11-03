import React from 'react';
import LegacyHomeScreen from '../../../app/screens/HomeScreen';
import HomeScreen from '../../../app/v2/screens/HomeScreen';
import { useUiVersion } from '../../../theme/useTheme';

export default function HomeRoute() {
  return useUiVersion() === 'next' ? <HomeScreen /> : <LegacyHomeScreen />;
}
