import { useMemo } from 'react';
import { useResourcesInventory } from './useResourcesInventory';
import { buildUnitResourcesAvailability } from '../utils/resourcesSectionInventory';
import { UnitResourcesAvailability } from '../types/resources/inventory';

/**
 * Unit-facing Resources availability from Prepare Offline inventory (#192).
 * Empty inventory → empty sections (tab empty state). No network.
 */
export function useUnitResourcesAvailability(params: {
  projectId: number | null;
  chapterName: string;
  verseNumber: number;
}): UnitResourcesAvailability {
  const { getResourceStatus, inventoryVersion } = useResourcesInventory(
    params.projectId,
  );

  return useMemo(
    () =>
      buildUnitResourcesAvailability({
        chapterName: params.chapterName,
        verseNumber: params.verseNumber,
        getStatus: getResourceStatus,
      }),
    // inventoryVersion invalidates when Prepare Offline inventory changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      params.chapterName,
      params.verseNumber,
      getResourceStatus,
      inventoryVersion,
    ],
  );
}
