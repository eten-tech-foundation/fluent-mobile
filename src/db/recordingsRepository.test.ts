import type { RecordingGranularity, RecordingRow } from '../types/db/types';
import { rangeCoversVerse } from '../utils/recordingRange';

type Row = RecordingRow;

let rows: Row[] = [];
let mockActiveUserId = '1';

type BibleTextRef = {
  bible_id: number;
  book_id: number;
  chapter_number: number;
  verse_number: number;
};

const bibleTexts: Record<number, BibleTextRef> = {
  103: { bible_id: 1, book_id: 1, chapter_number: 1, verse_number: 3 },
  105: { bible_id: 1, book_id: 1, chapter_number: 1, verse_number: 5 },
  108: { bible_id: 1, book_id: 1, chapter_number: 1, verse_number: 8 },
  203: { bible_id: 2, book_id: 1, chapter_number: 1, verse_number: 3 },
  205: { bible_id: 2, book_id: 1, chapter_number: 1, verse_number: 5 },
};

function clone(row: Row): Row {
  return { ...row };
}

export function resetRecordingsDbMock(): void {
  rows = [];
  mockActiveUserId = '1';
}

export function __setMockActiveUserId(userId: string): void {
  mockActiveUserId = userId;
}

export function __getRecordingRows(): Row[] {
  return rows.map(clone);
}

type ExecuteResult = { rows: unknown[] };

function matchesOwner(
  row: Row,
  sql: string,
  params: unknown[],
  ownerParamIndex: number,
): boolean {
  if (sql.includes('recorded_by_user_id IS NULL')) {
    return row.recorded_by_user_id === null;
  }
  if (sql.includes('recorded_by_user_id = ?')) {
    return row.recorded_by_user_id === (params[ownerParamIndex] as number);
  }
  return true;
}

function sharesBibleBook(anchorId: number, viewId: number): boolean {
  const anchor = bibleTexts[anchorId];
  const view = bibleTexts[viewId];
  if (!anchor || !view) {
    return anchorId === viewId;
  }
  return anchor.bible_id === view.bible_id && anchor.book_id === view.book_id;
}

function isVisibleAtVerse(
  row: Row,
  bibleTextId: number,
  withView: boolean,
): boolean {
  if (row.bible_text_id === bibleTextId) {
    return true;
  }
  if (!withView || row.granularity !== 'pericope') {
    return false;
  }
  if (!sharesBibleBook(row.bible_text_id, bibleTextId)) {
    return false;
  }
  const view = bibleTexts[bibleTextId];
  if (!view) {
    return false;
  }
  return rangeCoversVerse(
    {
      startChapter: row.start_chapter,
      startVerse: row.start_verse,
      endChapter: row.end_chapter,
      endVerse: row.end_verse,
    },
    view.chapter_number,
    view.verse_number,
  );
}

function parseViewBibleTextId(
  sql: string,
  params: unknown[],
  bibleTextIdIndex: number,
): { bibleTextId: number; withView: boolean } {
  const bibleTextId = params[bibleTextIdIndex] as number;
  const withView = sql.includes("granularity = 'pericope'");
  return { bibleTextId, withView };
}

function matchesSameBibleBookSelection(
  row: Row,
  incomingBibleTextId: number,
  sql: string,
  params: unknown[],
): boolean {
  if (!sql.includes('anchor_bt.bible_id = incoming_bt.bible_id')) {
    return row.is_selected === 1 && matchesOwner(row, sql, params, 1);
  }
  return (
    row.is_selected === 1 &&
    sharesBibleBook(row.bible_text_id, incomingBibleTextId) &&
    matchesOwner(row, sql, params, 1)
  );
}

async function mockExecute(
  sql: string,
  params: unknown[] = [],
): Promise<ExecuteResult> {
  const normalized = sql.replace(/\s+/g, ' ').trim();

  if (
    normalized.startsWith(
      'SELECT r.id, r.bible_text_id, r.start_chapter, r.start_verse, r.end_chapter, r.end_verse FROM recordings r',
    )
  ) {
    const incomingBibleTextId = params[0] as number;
    return {
      rows: rows
        .filter(r =>
          matchesSameBibleBookSelection(
            r,
            incomingBibleTextId,
            normalized,
            params,
          ),
        )
        .map(r => ({
          id: r.id,
          bible_text_id: r.bible_text_id,
          start_chapter: r.start_chapter,
          start_verse: r.start_verse,
          end_chapter: r.end_chapter,
          end_verse: r.end_verse,
        })),
    };
  }

  if (normalized.startsWith('UPDATE recordings SET is_selected = 0')) {
    const updatedAt = params[0] as string;
    if (normalized.includes('WHERE id = ?')) {
      const id = params[1] as string;
      rows = rows.map(r =>
        r.id === id ? { ...r, is_selected: 0, updated_at: updatedAt } : r,
      );
      return { rows: [] };
    }
    const bibleTextId = params[1] as number;
    rows = rows.map(r =>
      r.bible_text_id === bibleTextId &&
      r.is_selected === 1 &&
      matchesOwner(r, normalized, params, 2)
        ? { ...r, is_selected: 0, updated_at: updatedAt }
        : r,
    );
    return { rows: [] };
  }

  if (normalized.startsWith('SELECT MAX(take_number)')) {
    if (normalized.includes("granularity = 'pericope'")) {
      const viewBibleTextId = params[1] as number;
      const max = rows
        .filter(
          r =>
            matchesOwner(r, normalized, params, 0) &&
            isVisibleAtVerse(r, viewBibleTextId, true),
        )
        .reduce((m, r) => Math.max(m, r.take_number), 0);
      return { rows: [{ max_take: max || null }] };
    }
    const bibleTextId = params[0] as number;
    const max = rows
      .filter(
        r =>
          r.bible_text_id === bibleTextId &&
          matchesOwner(r, normalized, params, 1),
      )
      .reduce((m, r) => Math.max(m, r.take_number), 0);
    return { rows: [{ max_take: max || null }] };
  }

  if (normalized.startsWith('INSERT INTO recordings')) {
    const [
      id,
      bibleTextId,
      recordedByUserId,
      localFilePath,
      durationMs,
      fileSizeBytes,
      takeNumber,
      syncStatus,
      createdAt,
      updatedAt,
      granularity,
      startChapter,
      startVerse,
      endChapter,
      endVerse,
    ] = params as [
      string,
      number,
      number | null,
      string,
      number | null,
      number | null,
      number,
      Row['sync_status'],
      string,
      string,
      RecordingGranularity | undefined,
      number | undefined,
      number | undefined,
      number | undefined,
      number | undefined,
    ];
    rows.push({
      id,
      bible_text_id: bibleTextId,
      recorded_by_user_id: recordedByUserId,
      local_file_path: localFilePath,
      blob_key: null,
      duration_ms: durationMs,
      file_size_bytes: fileSizeBytes,
      take_number: takeNumber,
      is_selected: 1,
      is_canonical: 0,
      sync_status: syncStatus,
      version_token: null,
      upload_error: null,
      created_at: createdAt,
      updated_at: updatedAt,
      granularity: granularity ?? 'verse',
      start_chapter: startChapter ?? 0,
      start_verse: startVerse ?? 0,
      end_chapter: endChapter ?? 0,
      end_verse: endVerse ?? 0,
    });
    return { rows: [] };
  }

  if (
    normalized.includes(
      'SELECT * FROM recordings WHERE bible_text_id = ? AND is_selected = 1',
    )
  ) {
    const bibleTextId = params[0] as number;
    const match = rows.find(
      r =>
        r.bible_text_id === bibleTextId &&
        r.is_selected === 1 &&
        matchesOwner(r, normalized, params, 1),
    );
    return { rows: match ? [clone(match)] : [] };
  }

  if (
    normalized.startsWith('SELECT * FROM recordings') &&
    (normalized.includes('ORDER BY take_number ASC') ||
      normalized.includes('ORDER BY created_at ASC'))
  ) {
    const ownerFirst = normalized.includes('WHERE recorded_by_user_id');
    const parsed = parseViewBibleTextId(normalized, params, ownerFirst ? 1 : 0);
    const sorted = rows
      .filter(
        r =>
          matchesOwner(r, normalized, params, 0) &&
          isVisibleAtVerse(r, parsed.bibleTextId, parsed.withView),
      )
      .sort((a, b) =>
        normalized.includes('ORDER BY created_at ASC')
          ? a.created_at.localeCompare(b.created_at)
          : a.take_number - b.take_number,
      );
    return {
      rows: sorted.map(clone),
    };
  }

  if (
    normalized.startsWith(
      'SELECT id, bible_text_id, recorded_by_user_id, is_selected, start_chapter',
    ) ||
    normalized.startsWith(
      'SELECT bible_text_id, recorded_by_user_id, is_selected FROM recordings WHERE id = ?',
    )
  ) {
    const id = params[0] as string;
    const match = rows.find(r => r.id === id);
    return {
      rows: match
        ? [
            {
              id: match.id,
              bible_text_id: match.bible_text_id,
              recorded_by_user_id: match.recorded_by_user_id,
              is_selected: match.is_selected,
              start_chapter: match.start_chapter,
              start_verse: match.start_verse,
              end_chapter: match.end_chapter,
              end_verse: match.end_verse,
            },
          ]
        : [],
    };
  }

  if (normalized.startsWith('DELETE FROM recordings WHERE id = ?')) {
    const id = params[0] as string;
    rows = rows.filter(r => r.id !== id);
    return { rows: [] };
  }

  if (
    normalized.includes('SELECT id FROM recordings WHERE bible_text_id = ?') &&
    normalized.includes('ORDER BY take_number DESC LIMIT 1')
  ) {
    const bibleTextId = params[0] as number;
    const match = rows
      .filter(
        r =>
          r.bible_text_id === bibleTextId &&
          matchesOwner(r, normalized, params, 1),
      )
      .sort((a, b) => b.take_number - a.take_number)[0];
    return { rows: match ? [{ id: match.id }] : [] };
  }

  if (normalized.startsWith('UPDATE recordings SET is_selected = 1')) {
    const updatedAt = params[0] as string;
    const id = params[1] as string;
    rows = rows.map(r =>
      r.id === id ? { ...r, is_selected: 1, updated_at: updatedAt } : r,
    );
    return { rows: [] };
  }

  throw new Error(`Unhandled SQL in recordings mock: ${normalized}`);
}

jest.mock('./db', () => ({
  getDatabase: () => ({
    execute: mockExecute,
    transaction: async (
      fn: (tx: { execute: typeof mockExecute }) => Promise<void>,
    ) => {
      await fn({ execute: mockExecute });
    },
  }),
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: () => mockActiveUserId,
}));

import {
  addRecordingTake,
  deleteRecordingTake,
  getLatestRecordingForVerse,
  getTakesForVerse,
  selectRecordingTake,
} from './recordingsRepository';

describe('recordingsRepository multi-take', () => {
  beforeEach(() => {
    resetRecordingsDbMock();
  });

  it('bumps take_number and flips is_selected in one transaction', async () => {
    const id1 = await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///a.m4a',
      id: 'take-1',
    });
    const id2 = await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///b.m4a',
      id: 'take-2',
    });

    expect(id1).toBe('take-1');
    expect(id2).toBe('take-2');

    const takes = await getTakesForVerse(10);
    expect(takes).toHaveLength(2);
    expect(takes.map(t => t.takeNumber)).toEqual([1, 2]);
    expect(takes.filter(t => t.isSelected)).toHaveLength(1);
    expect(takes.find(t => t.isSelected)?.id).toBe('take-2');
    expect(takes.every(t => t.recordedByUserId === 1)).toBe(true);

    const latest = await getLatestRecordingForVerse(10);
    expect(latest?.id).toBe('take-2');
    expect(latest?.takeNumber).toBe(2);
    expect(latest?.recordedByUserId).toBe(1);
  });

  it('attributes new takes to the active user', async () => {
    __setMockActiveUserId('42');
    await addRecordingTake({
      bibleTextId: 1,
      localFilePath: 'file:///a.m4a',
      id: 'owned',
    });
    expect(__getRecordingRows()[0].recorded_by_user_id).toBe(42);
  });

  it('keeps separate selected takes per user on the same verse', async () => {
    __setMockActiveUserId('1');
    await addRecordingTake({
      bibleTextId: 5,
      localFilePath: 'file:///u1.m4a',
      id: 'u1',
    });
    __setMockActiveUserId('2');
    await addRecordingTake({
      bibleTextId: 5,
      localFilePath: 'file:///u2.m4a',
      id: 'u2',
    });

    const latestUser1 = await getLatestRecordingForVerse(5, 1);
    const latestUser2 = await getLatestRecordingForVerse(5, 2);
    expect(latestUser1?.id).toBe('u1');
    expect(latestUser2?.id).toBe('u2');
    expect(
      __getRecordingRows().filter(
        r => r.bible_text_id === 5 && r.is_selected === 1,
      ),
    ).toHaveLength(2);
  });

  it('keeps exactly one is_selected per bible_text_id for the active user', async () => {
    await addRecordingTake({
      bibleTextId: 1,
      localFilePath: 'file:///1.m4a',
      id: 'a',
    });
    await addRecordingTake({
      bibleTextId: 1,
      localFilePath: 'file:///2.m4a',
      id: 'b',
    });
    await addRecordingTake({
      bibleTextId: 1,
      localFilePath: 'file:///3.m4a',
      id: 'c',
    });
    const selectedCount = __getRecordingRows().filter(
      r =>
        r.bible_text_id === 1 &&
        r.recorded_by_user_id === 1 &&
        r.is_selected === 1,
    );
    expect(selectedCount).toHaveLength(1);
  });

  it('promotes previous take when deleting the selected take', async () => {
    await addRecordingTake({
      bibleTextId: 7,
      localFilePath: 'file:///x.m4a',
      id: 'old',
    });
    await addRecordingTake({
      bibleTextId: 7,
      localFilePath: 'file:///y.m4a',
      id: 'new',
    });

    await deleteRecordingTake('new');
    const latest = await getLatestRecordingForVerse(7);
    expect(latest?.id).toBe('old');
    expect(latest?.isSelected).toBe(true);
  });

  it('clears selection when deleting the only take', async () => {
    await addRecordingTake({
      bibleTextId: 3,
      localFilePath: 'file:///only.m4a',
      id: 'only',
    });
    await deleteRecordingTake('only');
    await expect(getLatestRecordingForVerse(3)).resolves.toBeNull();
    expect(await getTakesForVerse(3)).toEqual([]);
  });

  it('selects a non-selected take and clears the previous selection', async () => {
    await addRecordingTake({
      bibleTextId: 20,
      localFilePath: 'file:///t1.m4a',
      id: 't1',
    });
    await addRecordingTake({
      bibleTextId: 20,
      localFilePath: 'file:///t2.m4a',
      id: 't2',
    });
    // t2 is selected after the second insert; select t1 instead.
    await selectRecordingTake('t1');

    const takes = await getTakesForVerse(20);
    expect(takes.find(t => t.id === 't1')?.isSelected).toBe(true);
    expect(takes.find(t => t.id === 't2')?.isSelected).toBe(false);
  });

  it('selecting the already-selected take is a no-op', async () => {
    await addRecordingTake({
      bibleTextId: 21,
      localFilePath: 'file:///only.m4a',
      id: 'only',
    });
    await selectRecordingTake('only');
    const takes = await getTakesForVerse(21);
    expect(takes.find(t => t.id === 'only')?.isSelected).toBe(true);
  });

  it('lists a pericope take on every spanned verse view', async () => {
    await addRecordingTake({
      bibleTextId: 103,
      localFilePath: 'file:///v3.m4a',
      id: 'verse-3',
      granularity: 'verse',
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 3,
    });
    await addRecordingTake({
      bibleTextId: 103,
      localFilePath: 'file:///p.m4a',
      id: 'peri',
      granularity: 'pericope',
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 7,
    });
    await addRecordingTake({
      bibleTextId: 105,
      localFilePath: 'file:///v5.m4a',
      id: 'verse-5',
      granularity: 'verse',
      startChapter: 1,
      startVerse: 5,
      endChapter: 1,
      endVerse: 5,
    });

    const atFive = await getTakesForVerse(105, undefined, {
      chapterNumber: 1,
      verseNumber: 5,
    });
    expect(atFive.map(t => t.id).sort()).toEqual(['peri', 'verse-5']);

    const atEight = await getTakesForVerse(108, undefined, {
      chapterNumber: 1,
      verseNumber: 8,
    });
    expect(atEight.map(t => t.id)).toEqual([]);
  });

  it('counts a shared pericope take toward each spanned verse visible cap', async () => {
    for (let n = 1; n <= 4; n++) {
      await addRecordingTake({
        bibleTextId: 105,
        localFilePath: `file:///v5-${n}.m4a`,
        id: `verse-5-${n}`,
        granularity: 'verse',
        startChapter: 1,
        startVerse: 5,
        endChapter: 1,
        endVerse: 5,
      });
    }
    await addRecordingTake({
      bibleTextId: 103,
      localFilePath: 'file:///p.m4a',
      id: 'peri',
      granularity: 'pericope',
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 7,
    });

    const atFive = await getTakesForVerse(105, undefined, {
      chapterNumber: 1,
      verseNumber: 5,
    });
    expect(atFive).toHaveLength(5);
    expect(atFive.some(t => t.id === 'peri')).toBe(true);

    const atThree = await getTakesForVerse(103, undefined, {
      chapterNumber: 1,
      verseNumber: 3,
    });
    expect(atThree.map(t => t.id)).toEqual(['peri']);
  });

  it('clears verse-take selection on a spanned verse when selecting a pericope take', async () => {
    await addRecordingTake({
      bibleTextId: 105,
      localFilePath: 'file:///v5.m4a',
      id: 'verse-5',
      granularity: 'verse',
      startChapter: 1,
      startVerse: 5,
      endChapter: 1,
      endVerse: 5,
    });
    await addRecordingTake({
      bibleTextId: 103,
      localFilePath: 'file:///p.m4a',
      id: 'peri',
      granularity: 'pericope',
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 7,
    });

    expect(
      __getRecordingRows().find(r => r.id === 'verse-5')?.is_selected,
    ).toBe(0);
    expect(__getRecordingRows().find(r => r.id === 'peri')?.is_selected).toBe(
      1,
    );
  });

  it('numbers and orders a verse take after visible pericope takes at the view', async () => {
    for (let n = 1; n <= 3; n++) {
      await addRecordingTake({
        bibleTextId: 103,
        viewBibleTextId: 105,
        localFilePath: `file:///p${n}.m4a`,
        id: `peri-${n}`,
        granularity: 'pericope',
        startChapter: 1,
        startVerse: 3,
        endChapter: 1,
        endVerse: 7,
      });
    }
    await addRecordingTake({
      bibleTextId: 105,
      viewBibleTextId: 105,
      localFilePath: 'file:///v.m4a',
      id: 'verse',
      granularity: 'verse',
      startChapter: 1,
      startVerse: 5,
      endChapter: 1,
      endVerse: 5,
    });

    const atFive = await getTakesForVerse(105, undefined, {
      chapterNumber: 1,
      verseNumber: 5,
    });
    expect(atFive.map(t => t.id)).toEqual([
      'peri-1',
      'peri-2',
      'peri-3',
      'verse',
    ]);
    expect(atFive.map(t => t.takeNumber)).toEqual([1, 2, 3, 4]);
  });

  it('does not clear selection on another bible when selecting overlapping coordinates', async () => {
    await addRecordingTake({
      bibleTextId: 205,
      localFilePath: 'file:///other-bible.m4a',
      id: 'other-bible',
      granularity: 'pericope',
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 7,
    });
    await addRecordingTake({
      bibleTextId: 105,
      localFilePath: 'file:///home.m4a',
      id: 'home',
      granularity: 'verse',
      startChapter: 1,
      startVerse: 5,
      endChapter: 1,
      endVerse: 5,
    });

    await selectRecordingTake('other-bible');

    expect(__getRecordingRows().find(r => r.id === 'home')?.is_selected).toBe(
      1,
    );
    expect(
      __getRecordingRows().find(r => r.id === 'other-bible')?.is_selected,
    ).toBe(1);
  });

  it('does not list a pericope take across bibles with identical coordinates', async () => {
    await addRecordingTake({
      bibleTextId: 203,
      localFilePath: 'file:///other-bible-p.m4a',
      id: 'other-bible-peri',
      granularity: 'pericope',
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 7,
    });

    const atFive = await getTakesForVerse(105, undefined, {
      chapterNumber: 1,
      verseNumber: 5,
    });
    expect(atFive).toEqual([]);
  });

  it('deleting a pericope take removes it from every spanned verse view', async () => {
    await addRecordingTake({
      bibleTextId: 103,
      localFilePath: 'file:///p.m4a',
      id: 'peri',
      granularity: 'pericope',
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 7,
    });
    await deleteRecordingTake('peri');
    const atFive = await getTakesForVerse(105, undefined, {
      chapterNumber: 1,
      verseNumber: 5,
    });
    expect(atFive).toEqual([]);
  });
});
