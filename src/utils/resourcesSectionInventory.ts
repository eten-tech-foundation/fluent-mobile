import { PrepareOfflineResourceStatus } from '../types/prepareOffline/types';
import {
  ResourcesSectionInventoryGate,
  UnitResourcesAvailability,
} from '../types/resources/inventory';
import { ResourceSectionId } from '../types/resources/types';
import { manifestEntryToResourceId } from './prepareOfflineResourceId';

/**
 * Maps Resources tab sections to Prepare Offline inventory resource ids (#192).
 * Uses #51 mock catalog tier membership (TN tier 1; TQ tier 2; Images tier 3).
 * Aquifer manifest may place TN at tier 2 — align when #201 unifies sources.
 */
export const RESOURCES_SECTION_INVENTORY_GATES: ResourcesSectionInventoryGate[] =
  [
    {
      sectionId: 'translationNotes',
      groupName: 'Translation Notes',
      resourceId: manifestEntryToResourceId(1, 'Translation Notes', 'text'),
    },
    {
      sectionId: 'translationQuestions',
      groupName: 'Translation Questions',
      resourceId: manifestEntryToResourceId(2, 'Translation Questions', 'text'),
    },
    {
      sectionId: 'imagesMaps',
      groupName: 'Reference Images',
      resourceId: manifestEntryToResourceId(3, 'Reference Images', 'text'),
    },
  ];

export function isResourcesSectionInventoried(
  getStatus: (resourceId: string) => PrepareOfflineResourceStatus,
  sectionId: ResourceSectionId,
): boolean {
  const gate = RESOURCES_SECTION_INVENTORY_GATES.find(
    entry => entry.sectionId === sectionId,
  );
  if (!gate) {
    return false;
  }
  return getStatus(gate.resourceId) === 'completed';
}

export function getInventoriedResourceSections(
  getStatus: (resourceId: string) => PrepareOfflineResourceStatus,
): ResourceSectionId[] {
  return RESOURCES_SECTION_INVENTORY_GATES.filter(
    gate => getStatus(gate.resourceId) === 'completed',
  ).map(gate => gate.sectionId);
}

export function buildUnitResourcesAvailability(params: {
  chapterName: string;
  verseNumber: number;
  getStatus: (resourceId: string) => PrepareOfflineResourceStatus;
}): UnitResourcesAvailability {
  const sections = getInventoriedResourceSections(params.getStatus);
  return {
    referenceLabel: `${params.chapterName}:${params.verseNumber}`,
    passageTitle:
      sections.length > 0 ? 'Downloaded resources for this project' : undefined,
    sections,
  };
}
