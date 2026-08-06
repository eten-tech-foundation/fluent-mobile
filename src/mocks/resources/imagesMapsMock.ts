import { ImagesMapsItem } from '../../types/resources/imagesMaps';

/**
 * Deterministic mock Images & Maps payloads (#191).
 * Aquifer / fluent-api proxy not available yet — replace in #192.
 *
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

/** Test-only failure injection for section-scoped error/retry. */
let mockLoadShouldFail = false;

export function setMockImagesMapsLoadFailure(shouldFail: boolean) {
  mockLoadShouldFail = shouldFail;
}

/**
 * Async loader for Images & Maps. No network API — mock metadata only until
 * Aquifer/fluent-api exists. Image URIs themselves may still resolve remotely
 * until #192 enforces local-only inventory reads.
 */
export async function loadImagesMapsForUnit(
  chapterId: number,
  verseNumber: number,
): Promise<ImagesMapsItem[]> {
  await Promise.resolve();
  if (mockLoadShouldFail) {
    throw new Error('Failed to load Images & Maps');
  }
  return getMockImagesMaps(chapterId, verseNumber);
}
