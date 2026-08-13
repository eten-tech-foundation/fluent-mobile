/**
 * Deterministic Images & Maps fixtures for unit tests (#191).
 * Production loads Aquifer via `services/imagesMaps`.
 */
import { ImagesMapsItem } from '../../types/resources/imagesMaps';

export { setImagesMapsLoadFailureForTests as setMockImagesMapsLoadFailure } from '../../services/imagesMaps';

/**
 * Aligns with `getMockResourcesForUnit`: items only when verse % 3 === 2.
 */
export function getMockImagesMaps(
  chapterId: number,
  verseNumber: number,
): ImagesMapsItem[] {
  if (verseNumber % 3 !== 2) {
    return [];
  }

  return [
    {
      id: `img-${chapterId}-${verseNumber}-1`,
      title: 'Jerusalem region map',
      caption: 'Overview of surrounding towns',
      attribution: 'Aquifer / Bible Journey Maps',
      uri: `https://picsum.photos/seed/fluent-map-${chapterId}-${verseNumber}/800/500`,
    },
    {
      id: `img-${chapterId}-${verseNumber}-2`,
      title: 'Temple courtyard',
      caption: 'Reference illustration for this passage',
      attribution: 'Aquifer Images',
      uri: `https://picsum.photos/seed/fluent-img-${chapterId}-${verseNumber}/800/600`,
    },
    {
      id: `img-${chapterId}-${verseNumber}-3`,
      title: 'Unattributed sketch',
      uri: `https://picsum.photos/seed/fluent-plain-${chapterId}-${verseNumber}/640/480`,
    },
  ];
}
