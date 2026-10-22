import { useCallback, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { getActiveUserId } from '../services/storage';
import {
  getDraftingUnit,
  notifyDraftingUnitChanged,
  setDraftingUnit,
  subscribeToDraftingUnit,
  type DraftingUnit,
} from '../services/draftingUnitPreference';
import { scheduleDisplayModePush } from '../services/displayModeSettingsSync';

export function useDraftingUnit() {
  const draftingUnit = useSyncExternalStore(
    subscribeToDraftingUnit,
    () => getDraftingUnit(getActiveUserId()),
    () => getDraftingUnit(getActiveUserId()),
  );

  useFocusEffect(
    useCallback(() => {
      notifyDraftingUnitChanged();
    }, []),
  );

  const setUnit = useCallback((unit: DraftingUnit) => {
    const userId = getActiveUserId();
    setDraftingUnit(unit, userId);
    void scheduleDisplayModePush(userId);
  }, []);

  return { draftingUnit, setDraftingUnit: setUnit };
}
