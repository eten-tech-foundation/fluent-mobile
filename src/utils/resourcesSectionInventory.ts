import { PrepareOfflineResourceStatus } from '../types/prepareOffline/types';
import {
  ResourcesSectionInventoryGate,
  UnitResourcesAvailability,
} from '../types/resources/inventory';
import { ResourceSectionId } from '../types/resources/types';
import { manifestEntryToResourceId } from './prepareOfflineResourceId';

/** All Resources tab sections (online fluent-api path). */
export const ALL_RESOURCE_SECTION_IDS: ResourceSectionId[] = [
  'translationNotes',
  'translationQuestions',
  'imagesMaps',
];

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
      kind: 'text',
      resourceId: manifestEntryToResourceId(1, 'Translation Notes', 'text'),
    },
    {
      sectionId: 'translationQuestions',
      groupName: 'Translation Questions',
      kind: 'text',
      resourceId: manifestEntryToResourceId(2, 'Translation Questions', 'text'),
    },
    {
      sectionId: 'imagesMaps',
      groupName: 'Reference Images',
      kind: 'image',
      resourceId: manifestEntryToResourceId(3, 'Reference Images', 'image'),
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

/**
 * Sections on device: prepare-offline status plus any sections whose
 * `download_queue` rows are already persisted as completed (#201).
 */
export function getInventoriedResourceSections(
  getStatus: (resourceId: string) => PrepareOfflineResourceStatus,
  downloadedSections: ResourceSectionId[] = [],
): ResourceSectionId[] {
  return RESOURCES_SECTION_INVENTORY_GATES.filter(
    gate =>
      getStatus(gate.resourceId) === 'completed' ||
      downloadedSections.includes(gate.sectionId),
  ).map(gate => gate.sectionId);
}

/**
 * Which section slots ResourcesTab should render.
 * Online + project → stream via fluent-api (all sections).
 * Offline → Prepare Offline inventory only (#192).
 */
export function getVisibleResourceSections(params: {
  isOnline: boolean;
  projectId: number | null;
  inventoriedSections: ResourceSectionId[];
}): ResourceSectionId[] {
  if (params.projectId === null) {
    return [];
  }
  if (params.isOnline) {
    return ALL_RESOURCE_SECTION_IDS;
  }
  return params.inventoriedSections;
}

export function buildUnitResourcesAvailability(params: {
  chapterName: string;
  verseNumber: number;
  getStatus: (resourceId: string) => PrepareOfflineResourceStatus;
  downloadedSections?: ResourceSectionId[];
}): UnitResourcesAvailability {
  const sections = getInventoriedResourceSections(
    params.getStatus,
    params.downloadedSections,
  );
  return {
    referenceLabel: `${params.chapterName}:${params.verseNumber}`,
    passageTitle:
      sections.length > 0 ? 'Downloaded resources for this project' : undefined,
    sections,
  };
}
