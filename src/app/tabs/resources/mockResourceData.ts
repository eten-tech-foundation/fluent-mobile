import {
  ResourceSectionId,
  UnitResourcesMock,
} from '../../../types/resources/types';

const ALL_SECTIONS: ResourceSectionId[] = [
  'translationNotes',
  'translationQuestions',
  'imagesMaps',
];

/**
 * Deterministic mock shell for Resources tab stubs (#188 / #190 / #191).
 *
 * Pattern (by verse number):
 * - `% 3 === 0` → no stub sections (TN may still appear from live Aquifer #189)
 * - `% 3 === 1` → Translation Notes slot only (live Aquifer fills body)
 * - `% 3 === 2` → all three section stubs (TQ / Images until #190 / #191)
 *
 * Translation Notes visibility is driven by Aquifer load state in ResourcesTab,
 * not by this mock alone.
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

export function unitHasAnyResources(resources: UnitResourcesMock): boolean {
  return resources.sections.length > 0;
}
