import React from 'react';
import ObserverDraftScreen from '../../../app/screens/ObserverDraftScreen';
import ObserverScreen from '../../../app/v2/screens/ObserverScreen';
import { useUiVersion } from '../../../theme/useTheme';

export default function ObserverDraftRoute() {
  return useUiVersion() === 'next' ? (
    <ObserverScreen />
  ) : (
    <ObserverDraftScreen />
  );
}
