import React from 'react';
import HomeScreen from '../../../app/screens/HomeScreen';
import { V2HomeRedirect } from '../../../navigation/V2HomeRedirect';
import { useUiVersion } from '../../../theme/useTheme';

export default function HomeRoute() {
  return useUiVersion() === 'next' ? <V2HomeRedirect /> : <HomeScreen />;
}
