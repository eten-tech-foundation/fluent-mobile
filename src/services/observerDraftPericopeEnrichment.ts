/**
 * #451: attach local pericope identity to Observer draft units.
 * Gate: published unit `coverage.granularity === 'pericope'` only — never invent
 * coverage. Resolve via project.pericope_set_id + getPericopeForVerse; fail
 * closed (null ids) when set/group missing.
 */

import type { ObserverDraftUnit } from '../app/tabs/ObserverDraftTab';
import { getPericopeForVerse } from '../db/queries';
import { getProjectPericopeSetId } from '../db/repository';

export type EnrichObserverDraftUnitsWithLocalPericopeInput = {
  units: readonly ObserverDraftUnit[];
  projectId: number;
  bookId: number;
  chapterNumber: number;
};

function withClearedPericope(unit: ObserverDraftUnit): ObserverDraftUnit {
  return {
    ...unit,
    pericopeNumber: null,
    pericopeSetId: null,
  };
}

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Enrich units that already carry pericope coverage from the local bundle.
 * Verse / missing coverage units stay verse-path (null pericope ids).
 */
export async function enrichObserverDraftUnitsWithLocalPericope(
  input: EnrichObserverDraftUnitsWithLocalPericopeInput,
): Promise<ObserverDraftUnit[]> {
  const { units, projectId, bookId, chapterNumber } = input;
  if (
    units.length === 0 ||
    !isPositiveInt(projectId) ||
    !isPositiveInt(bookId) ||
    !isPositiveInt(chapterNumber)
  ) {
    return units.map(withClearedPericope);
  }

  const needsLookup = units.some(
    unit => unit.coverage?.granularity === 'pericope',
  );
  if (!needsLookup) {
    return units.map(withClearedPericope);
  }

  const pericopeSetId = await getProjectPericopeSetId(projectId);
  if (pericopeSetId === null || !isPositiveInt(pericopeSetId)) {
    return units.map(withClearedPericope);
  }

  return Promise.all(
    units.map(async unit => {
      if (unit.coverage?.granularity !== 'pericope') {
        return withClearedPericope(unit);
      }
      if (!isPositiveInt(unit.verseNumber)) {
        return withClearedPericope(unit);
      }
      const group = await getPericopeForVerse(
        bookId,
        chapterNumber,
        unit.verseNumber,
        pericopeSetId,
      );
      if (
        group === null ||
        typeof group.pericopeNumber !== 'string' ||
        group.pericopeNumber.length === 0
      ) {
        return withClearedPericope(unit);
      }
      return {
        ...unit,
        pericopeNumber: group.pericopeNumber,
        pericopeSetId,
      };
    }),
  );
}
