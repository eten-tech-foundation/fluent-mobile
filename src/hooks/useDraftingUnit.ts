import { useCallback, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
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
    () => getDraftingUnit(),
    () => getDraftingUnit(),
  );

  useFocusEffect(
    useCallback(() => {
      notifyDraftingUnitChanged();
    }, []),
  );

  const setUnit = useCallback((unit: DraftingUnit) => {
    setDraftingUnit(unit);
  }, []);

  return { draftingUnit, setDraftingUnit: setUnit };
}
