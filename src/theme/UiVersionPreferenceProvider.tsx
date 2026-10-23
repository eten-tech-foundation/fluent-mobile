import React, { useSyncExternalStore } from 'react';
import {
  getUserPreferenceValue,
  subscribeToUserPreferences,
} from '../services/userPreferences';
import { UiVersionOverride } from './useTheme';

/** Native preference bridge, mounted once above every application route. */
export function UiVersionPreferenceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const version = useSyncExternalStore(
    subscribeToUserPreferences,
    () => getUserPreferenceValue('uiVersion'),
    () => getUserPreferenceValue('uiVersion'),
  );
  return <UiVersionOverride value={version}>{children}</UiVersionOverride>;
}
