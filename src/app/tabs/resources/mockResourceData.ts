import {
  ResourceSectionId,
  UnitResourcesMock,
} from '../../../types/resources/types';

/**
 * @deprecated Prefer `useUnitResourcesAvailability` (#192 inventory gating).
 * Kept only for transitional content mocks until #189–#191 land real payloads.
 *
 * Deterministic mock content helpers — do not use for section visibility.
 */
const ALL_SECTIONS: ResourceSectionId[] = [
  'translationNotes',
  'translationQuestions',
  'imagesMaps',
];

/**
 * @deprecated Use Prepare Offline inventory scenarios instead of verse % 3.
 */
export function getMockResourcesForUnit(
  _chapterId: number,
  verseNumber: number,
  chapterName: string,
): UnitResourcesMock {
  const pattern = verseNumber % 3;

  if (pattern === 0) {
    return {
      referenceLabel: `${chapterName}:${verseNumber}`,
      sections: [],
    };
  }

  if (pattern === 1) {
    return {
      referenceLabel: `${chapterName}:${verseNumber}`,
      sections: ['translationNotes'],
    };
  }

  return {
    referenceLabel: `${chapterName}:${verseNumber}`,
    sections: [...ALL_SECTIONS],
  };
}

/** @deprecated Prefer `availability.sections.length > 0`. */
export function unitHasAnyResources(resources: UnitResourcesMock): boolean {
  return resources.sections.length > 0;
}
