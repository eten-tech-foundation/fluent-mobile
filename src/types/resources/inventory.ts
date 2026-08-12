import { PrepareOfflineResourceKind } from '../prepareOffline/types';
import { ResourceSectionId } from './types';

/**
 * Availability payload for the Resources tab (#192).
 * Section visibility comes from Prepare Offline inventory — not verse mocks.
 */
export interface UnitResourcesAvailability {
  referenceLabel: string;
  passageTitle?: string;
  /** Sections with completed on-device inventory for this project. */
  sections: ResourceSectionId[];
}

/** Static gate: Resources section → Prepare Offline resource id. */
export interface ResourcesSectionInventoryGate {
  sectionId: ResourceSectionId;
  groupName: string;
  kind: PrepareOfflineResourceKind;
  resourceId: string;
}
