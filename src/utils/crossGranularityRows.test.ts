import type { Recording } from '../types/db/types';
import {
  buildCrossGranularityRows,
  uniqueTakesById,
  type StitchedTakeRow,
} from './crossGranularityRows';

function makeTake(overrides: Partial<Recording> = {}): Recording {
  return {
    id: 'rec_1',
    bibleTextId: 42,
    localFilePath: 'file:///rec_1.m4a',
    durationMs: 1000,
    takeNumber: 1,
    isSelected: false,
    isCanonical: false,
    syncStatus: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    granularity: 'verse',
    startChapter: 14,
    startVerse: 3,
    endChapter: 14,
    endVerse: 3,
    ...overrides,
  };
}

const pericope = [
  { chapterNumber: 14, verseNumber: 3 },
  { chapterNumber: 14, verseNumber: 4 },
  { chapterNumber: 14, verseNumber: 5 },
];

function stitchedRow(rows: ReturnType<typeof buildCrossGranularityRows>) {
  const row = rows.find(candidate => candidate.kind === 'stitched');
  return row as StitchedTakeRow | undefined;
}

describe('buildCrossGranularityRows — verse view', () => {
  it('passes takes through in order', () => {
    const takes = [makeTake({ id: 'a' }), makeTake({ id: 'b' })];
    const rows = buildCrossGranularityRows({
      draftingUnit: 'verse',
      pericopeVerses: pericope,
      takes,
    });
    expect(rows).toEqual([
      { kind: 'real', take: takes[0] },
      { kind: 'real', take: takes[1] },
    ]);
  });
});

describe('buildCrossGranularityRows — pericope view', () => {
  it('collapses verse takes into one stitched row and hides the verse rows', () => {
    const rows = buildCrossGranularityRows({
      draftingUnit: 'pericope',
      pericopeVerses: pericope,
      takes: [
        makeTake({ id: 'v4', startVerse: 4, endVerse: 4 }),
        makeTake({ id: 'v3', startVerse: 3, endVerse: 3 }),
      ],
    });

    expect(rows).toHaveLength(1);
    const stitched = stitchedRow(rows);
    expect(stitched?.segments.map(segment => segment.takeId)).toEqual([
      'v3',
      'v4',
    ]);
    expect(stitched?.startVerse).toBe(3);
    expect(stitched?.endVerse).toBe(4);
  });

  it('keeps a coverage gap as a single span', () => {
    const stitched = stitchedRow(
      buildCrossGranularityRows({
        draftingUnit: 'pericope',
        pericopeVerses: pericope,
        takes: [
          makeTake({ id: 'v3', startVerse: 3, endVerse: 3 }),
          makeTake({ id: 'v5', startVerse: 5, endVerse: 5 }),
        ],
      }),
    );

    expect(stitched?.segments).toHaveLength(2);
    expect(stitched?.startVerse).toBe(3);
    expect(stitched?.endVerse).toBe(5);
  });

  it('prefers the selected take over the highest take number', () => {
    const stitched = stitchedRow(
      buildCrossGranularityRows({
        draftingUnit: 'pericope',
        pericopeVerses: pericope,
        takes: [
          makeTake({ id: 'v3-t1', takeNumber: 1, isSelected: true }),
          makeTake({ id: 'v3-t2', takeNumber: 2 }),
        ],
      }),
    );

    expect(stitched?.segments.map(segment => segment.takeId)).toEqual([
      'v3-t1',
    ]);
  });

  it('falls back to the highest take number when nothing is selected', () => {
    const stitched = stitchedRow(
      buildCrossGranularityRows({
        draftingUnit: 'pericope',
        pericopeVerses: pericope,
        takes: [
          makeTake({ id: 'v3-t1', takeNumber: 1 }),
          makeTake({ id: 'v3-t3', takeNumber: 3 }),
          makeTake({ id: 'v3-t2', takeNumber: 2 }),
        ],
      }),
    );

    expect(stitched?.segments.map(segment => segment.takeId)).toEqual([
      'v3-t3',
    ]);
  });

  it('keeps a native pericope take as a real row alongside the stitched row', () => {
    const rows = buildCrossGranularityRows({
      draftingUnit: 'pericope',
      pericopeVerses: pericope,
      takes: [
        makeTake({
          id: 'pericope-take',
          granularity: 'pericope',
          startVerse: 3,
          endVerse: 5,
        }),
        makeTake({ id: 'v3', startVerse: 3, endVerse: 3 }),
      ],
    });

    expect(rows.map(row => row.kind)).toEqual(['real', 'stitched']);
  });

  it('ignores verse takes outside the pericope', () => {
    const rows = buildCrossGranularityRows({
      draftingUnit: 'pericope',
      pericopeVerses: pericope,
      takes: [makeTake({ id: 'v9', startVerse: 9, endVerse: 9 })],
    });

    expect(rows).toEqual([]);
  });

  it('sums segment durations, and reports null when one is unknown', () => {
    const args = {
      draftingUnit: 'pericope' as const,
      pericopeVerses: pericope,
      takes: [
        makeTake({ id: 'v3', startVerse: 3, endVerse: 3, durationMs: 1500 }),
        makeTake({ id: 'v4', startVerse: 4, endVerse: 4, durationMs: 2500 }),
      ],
    };
    expect(stitchedRow(buildCrossGranularityRows(args))?.durationMs).toBe(4000);

    const withUnknown = buildCrossGranularityRows({
      ...args,
      takes: [
        args.takes[0],
        makeTake({ id: 'v4', startVerse: 4, endVerse: 4, durationMs: null }),
      ],
    });
    expect(stitchedRow(withUnknown)?.durationMs).toBeNull();
  });

  it('numbers the row from its first segment and keys it by span', () => {
    const stitched = stitchedRow(
      buildCrossGranularityRows({
        draftingUnit: 'pericope',
        pericopeVerses: pericope,
        takes: [
          makeTake({ id: 'v3', startVerse: 3, endVerse: 3, takeNumber: 2 }),
          makeTake({ id: 'v4', startVerse: 4, endVerse: 4, takeNumber: 7 }),
        ],
      }),
    );

    expect(stitched?.takeNumber).toBe(2);
    expect(stitched?.id).toBe('stitched:14:3-14:4');
  });
});

describe('uniqueTakesById', () => {
  it('drops repeats from the per-verse fan-out, keeping first-seen order', () => {
    const pericopeTake = makeTake({
      id: 'shared',
      granularity: 'pericope',
      startVerse: 3,
      endVerse: 5,
    });
    const verseTake = makeTake({ id: 'v4', startVerse: 4, endVerse: 4 });

    expect(
      uniqueTakesById([
        [pericopeTake],
        [pericopeTake, verseTake],
        [pericopeTake],
      ]),
    ).toEqual([pericopeTake, verseTake]);
  });

  it('handles empty groups', () => {
    expect(uniqueTakesById([])).toEqual([]);
    expect(uniqueTakesById([[], []])).toEqual([]);
  });
});
