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
    setDraftingUnit(unit, getActiveUserId());
  }, []);

  return { draftingUnit, setDraftingUnit: setUnit };
}
