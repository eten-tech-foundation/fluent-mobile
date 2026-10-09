import { logger } from './logger';

const log = logger.create('loadResourcesForVerseRange');

/** Scripture ref for a single fluent-api translation-resources call. */
export type ResourceVerseRef = {
  chapterNumber: number;
  verseNumber: number;
};

export function normalizeVerseRefs(
  refs: ResourceVerseRef[],
): ResourceVerseRef[] {
  const seen = new Set<string>();
  const out: ResourceVerseRef[] = [];
  for (const ref of refs) {
    if (ref.chapterNumber <= 0 || ref.verseNumber <= 0) {
      continue;
    }
    const key = `${ref.chapterNumber}:${ref.verseNumber}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(ref);
  }
  out.sort((a, b) =>
    a.chapterNumber !== b.chapterNumber
      ? a.chapterNumber - b.chapterNumber
      : a.verseNumber - b.verseNumber,
  );
  return out;
}

/** Stable cache / effect key for a verse-ref set. */
export function verseRefsKey(refs: ResourceVerseRef[]): string {
  return normalizeVerseRefs(refs)
    .map(r => `${r.chapterNumber}:${r.verseNumber}`)
    .join(',');
}

/** @deprecated Prefer verseRefsKey — kept for call sites still on verse lists. */
export function verseNumbersKey(verseNumbers: number[]): string {
  return [...new Set(verseNumbers.filter(v => v > 0))]
    .sort((a, b) => a - b)
    .join(',');
}

/**
 * Fan-out single-verse fluent-api resource loads across a pericope (#593).
 * Dedupes by `id`. Partial failures are skipped (with a warn); only throws when
 * every verse fails.
 */
export async function loadResourcesForVerseRange<T extends { id: string }>(
  refs: ResourceVerseRef[],
  loadOne: (ref: ResourceVerseRef) => Promise<T[]>,
): Promise<T[]> {
  const unique = normalizeVerseRefs(refs);
  if (unique.length === 0) {
    return [];
  }
  if (unique.length === 1) {
    return loadOne(unique[0]!);
  }

  const results = await Promise.allSettled(unique.map(ref => loadOne(ref)));
  const merged: T[] = [];
  const seen = new Set<string>();
  let anyFulfilled = false;
  let lastError: unknown;
  const failed: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const ref = unique[i]!;
    if (result.status === 'fulfilled') {
      anyFulfilled = true;
      for (const item of result.value) {
        if (seen.has(item.id)) {
          continue;
        }
        seen.add(item.id);
        merged.push(item);
      }
    } else {
      lastError = result.reason;
      failed.push(`${ref.chapterNumber}:${ref.verseNumber}`);
    }
  }

  if (failed.length > 0 && anyFulfilled) {
    log.warn('Partial resource fan-out failure', {
      failedVerses: failed.join(','),
      succeededCount: unique.length - failed.length,
    });
  }

  if (!anyFulfilled && lastError !== undefined) {
    throw lastError;
  }
  return merged;
}

/** Build refs from same-chapter verse numbers (or a single verse). */
export function verseRefsFromChapter(
  chapterNumber: number,
  verseNumber: number,
  verseNumbers?: number[],
): ResourceVerseRef[] {
  const verses =
    verseNumbers && verseNumbers.length > 0 ? verseNumbers : [verseNumber];
  return verses.map(v => ({ chapterNumber, verseNumber: v }));
}
