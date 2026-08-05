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
 * Deterministic mock resources for a drafting unit.
 *
 * Pattern (by verse number):
 * - `% 3 === 0` → empty (tab-wide empty state)
 * - `% 3 === 1` → Translation Notes only
 * - `% 3 === 2` → all three section stubs
 *
 * Sync / no loading gate — replace with local queries when #189+ / #192 land.
 * Do not call FluentAPI from this module (API has no resource content endpoints).
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
      passageTitle: 'Sample notes for this verse',
      sections: ['translationNotes'],
    };
  }

  return {
    referenceLabel: `${chapterName}:${verseNumber}`,
    passageTitle: 'Sample passage resources',
    sections: [...ALL_SECTIONS],
  };
}

export function unitHasAnyResources(resources: UnitResourcesMock): boolean {
  return resources.sections.length > 0;
}
