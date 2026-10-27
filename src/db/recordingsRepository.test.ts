import type { RecordingGranularity, RecordingRow } from '../types/db/types';
import { rangeCoversVerse } from '../utils/recordingRange';

type Row = RecordingRow;

let rows: Row[] = [];
let mockActiveUserId = '1';

type DeletionRow = {
  id: string;
  project_unit_id: number;
  bible_text_id: number;
  server_take_id: number;
  recorded_by_user_id: number | null;
  created_at: string;
};
let deletions: DeletionRow[] = [];

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
  113: { bible_id: 1, book_id: 2, chapter_number: 1, verse_number: 3 },
  115: { bible_id: 1, book_id: 2, chapter_number: 1, verse_number: 5 },
  203: { bible_id: 2, book_id: 1, chapter_number: 1, verse_number: 3 },
  205: { bible_id: 2, book_id: 1, chapter_number: 1, verse_number: 5 },
};

function clone(row: Row): Row {
  return { ...row };
}

export function resetRecordingsDbMock(): void {
  rows = [];
  deletions = [];
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

/** Matches `[r.]project_unit_id IS NULL` / `= ?` write scoping (#613). */
function matchesWriteUnitScope(
  row: Row,
  sql: string,
  params: unknown[],
): boolean {
  if (/\b(r\.)?project_unit_id IS NULL\b/.test(sql)) {
    return row.project_unit_id === null || row.project_unit_id === undefined;
  }
  if (/\b(r\.)?project_unit_id = \?/.test(sql)) {
    return row.project_unit_id === (params[params.length - 1] as number);
  }
  return true;
}

/**
 * #701 SQL CASE emulators — selection/canonical changes flip an
 * already-uploaded take to 'pending'; losing canonical (or selection) reverts
 * a pending take whose bytes are on the server (blob_key set). Under the PM
 * rule the canonical take is what syncs as the selected take, so losing the
 * designation reverts the marker even when the take is still the draft.
 */
function designateRevertStatus(row: Row): Row['sync_status'] {
  return row.sync_status === 'uploaded' ? 'pending' : row.sync_status;
}

function deselectRevertStatus(row: Row): Row['sync_status'] {
  return row.sync_status === 'pending' &&
    row.blob_key !== null &&
    row.is_canonical === 0
    ? 'uploaded'
    : row.sync_status;
}

function canonicalDeselectRevertStatus(row: Row): Row['sync_status'] {
  // #701 PM rule: canonical is what syncs as the selected take, so losing
  // the designation reverts any pending marker (bytes on the server).
  return row.sync_status === 'pending' && row.blob_key !== null
    ? 'uploaded'
    : row.sync_status;
}

function matchesSameBibleBookSelection(
  row: Row,
  incomingBibleTextId: number,
  sql: string,
  params: unknown[],
): boolean {
  if (!sql.includes('anchor_bt.bible_id = incoming_bt.bible_id')) {
    return (
      row.is_selected === 1 &&
      matchesOwner(row, sql, params, 1) &&
      matchesWriteUnitScope(row, sql, params)
    );
  }
  return (
    row.is_selected === 1 &&
    sharesBibleBook(row.bible_text_id, incomingBibleTextId) &&
    matchesOwner(row, sql, params, 1) &&
    matchesWriteUnitScope(row, sql, params)
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
        r.id === id
          ? {
              ...r,
              is_selected: 0,
              sync_status: deselectRevertStatus(r),
              updated_at: updatedAt,
            }
          : r,
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
      projectUnitId,
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
      project_unit_id: projectUnitId,
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
    const unitFilter = normalized.includes('project_unit_id IS NULL');
    const unitId = unitFilter
      ? (params[params.length - 1] as number)
      : undefined;
    const sorted = rows
      .filter(
        r =>
          matchesOwner(r, normalized, params, 0) &&
          isVisibleAtVerse(r, parsed.bibleTextId, parsed.withView) &&
          (!unitFilter ||
            r.project_unit_id === null ||
            r.project_unit_id === undefined ||
            r.project_unit_id === unitId),
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
      'SELECT id FROM recordings WHERE bible_text_id = ? AND is_canonical = 1',
    )
  ) {
    const bibleTextId = params[0] as number;
    const match = rows.find(
      r =>
        r.bible_text_id === bibleTextId &&
        r.is_canonical === 1 &&
        matchesWriteUnitScope(r, normalized, params),
    );
    return { rows: match ? [{ id: match.id }] : [] };
  }

  if (
    normalized.startsWith(
      'SELECT id, bible_text_id, recorded_by_user_id, is_selected, blob_key, start_chapter',
    ) ||
    (normalized.startsWith(
      'SELECT bible_text_id, recorded_by_user_id, is_selected',
    ) &&
      normalized.includes('FROM recordings WHERE id = ?'))
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
              blob_key: match.blob_key ?? null,
              start_chapter: match.start_chapter,
              start_verse: match.start_verse,
              end_chapter: match.end_chapter,
              end_verse: match.end_verse,
              project_unit_id: match.project_unit_id ?? null,
              server_take_id: match.server_take_id ?? null,
            },
          ]
        : [],
    };
  }

  if (normalized.startsWith('INSERT OR REPLACE INTO recording_deletions')) {
    // Mock has no chapter_assignments, so only a capture unit resolves.
    const [id, bibleTextId, serverTakeId, recordedBy, createdAt, unit] =
      params as [string, number, number, number | null, string, number | null];
    if (unit !== null && unit > 0) {
      deletions = deletions.filter(d => d.id !== id);
      deletions.push({
        id,
        project_unit_id: unit,
        bible_text_id: bibleTextId,
        server_take_id: serverTakeId,
        recorded_by_user_id: recordedBy,
        created_at: createdAt,
      });
    }
    return { rows: [] };
  }

  if (normalized.startsWith('SELECT id, project_unit_id, bible_text_id')) {
    return {
      rows: [...deletions].sort((a, b) =>
        a.created_at === b.created_at
          ? a.id.localeCompare(b.id)
          : a.created_at.localeCompare(b.created_at),
      ),
    };
  }

  if (normalized.startsWith('DELETE FROM recording_deletions WHERE id = ?')) {
    deletions = deletions.filter(d => d.id !== params[0]);
    return { rows: [] };
  }

  if (
    normalized.startsWith('SELECT bible_text_id, project_unit_id, is_canonical')
  ) {
    const id = params[0] as string;
    const match = rows.find(r => r.id === id);
    return {
      rows: match
        ? [
            {
              bible_text_id: match.bible_text_id,
              project_unit_id: match.project_unit_id ?? null,
              is_canonical: match.is_canonical,
            },
          ]
        : [],
    };
  }

  if (normalized.startsWith('UPDATE recordings SET is_canonical = 0')) {
    const updatedAt = params[0] as string;
    const bibleTextId = params[1] as number;
    rows = rows.map(r =>
      r.bible_text_id === bibleTextId &&
      r.is_canonical === 1 &&
      matchesWriteUnitScope(r, normalized, params)
        ? {
            ...r,
            is_canonical: 0,
            sync_status: canonicalDeselectRevertStatus(r),
            updated_at: updatedAt,
          }
        : r,
    );
    return { rows: [] };
  }

  if (normalized.startsWith("UPDATE recordings SET sync_status = 'uploaded'")) {
    const updatedAt = params[0] as string;
    const bibleTextId = params[1] as number;
    rows = rows.map(r =>
      r.bible_text_id === bibleTextId &&
      r.is_canonical === 0 &&
      r.is_selected === 1 &&
      r.sync_status === 'pending' &&
      r.blob_key !== null &&
      matchesWriteUnitScope(r, normalized, params)
        ? { ...r, sync_status: 'uploaded' as const, updated_at: updatedAt }
        : r,
    );
    return { rows: [] };
  }

  if (normalized.startsWith('UPDATE recordings SET is_canonical = 1')) {
    const updatedAt = params[0] as string;
    const id = params[1] as string;
    rows = rows.map(r =>
      r.id === id
        ? {
            ...r,
            is_canonical: 1,
            sync_status: designateRevertStatus(r),
            updated_at: updatedAt,
          }
        : r,
    );
    return { rows: [] };
  }

  if (normalized.startsWith('DELETE FROM recordings WHERE id = ?')) {
    const id = params[0] as string;
    rows = rows.filter(r => r.id !== id);
    return { rows: [] };
  }

  if (
    normalized.includes('FROM recordings r') &&
    normalized.includes('INNER JOIN bible_texts anchor_bt') &&
    normalized.includes('INNER JOIN bible_texts deleted_bt') &&
    normalized.includes('r.take_number')
  ) {
    const deletedBibleTextId = params[0] as number;
    return {
      rows: rows
        .filter(
          r =>
            sharesBibleBook(r.bible_text_id, deletedBibleTextId) &&
            matchesOwner(r, normalized, params, 1) &&
            matchesWriteUnitScope(r, normalized, params),
        )
        .map(r => ({
          id: r.id,
          bible_text_id: r.bible_text_id,
          start_chapter: r.start_chapter,
          start_verse: r.start_verse,
          end_chapter: r.end_chapter,
          end_verse: r.end_verse,
          take_number: r.take_number,
          blob_key: r.blob_key ?? null,
        })),
    };
  }

  if (normalized.startsWith('UPDATE recordings SET is_selected = 1')) {
    // #701 PM rule: when canonical supersedes the selection, the write skips
    // the 'uploaded' → 'pending' flip (no CASE in the SQL).
    const flipsToPending = normalized.includes(
      "WHEN sync_status = 'uploaded' THEN 'pending'",
    );
    const updatedAt = params[0] as string;
    const id = params[1] as string;
    rows = rows.map(r =>
      r.id === id
        ? {
            ...r,
            is_selected: 1,
            sync_status: flipsToPending
              ? designateRevertStatus(r)
              : r.sync_status,
            updated_at: updatedAt,
          }
        : r,
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
  clearRecordingDeletion,
  deleteRecordingTake,
  getPendingRecordingDeletions,
  getLatestRecordingForVerse,
  getTakesForVerse,
  selectRecordingTake,
  setCanonicalTake,
} from './recordingsRepository';
import { getRecordingDataVersion } from '../services/recordingDataEvents';

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

  it('persists projectUnitId and filters takes by unit (#613)', async () => {
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///a.m4a',
      id: 'unit-473',
      projectUnitId: 473,
    });
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///b.m4a',
      id: 'unit-12',
      projectUnitId: 12,
    });
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///legacy.m4a',
      id: 'legacy-null',
      projectUnitId: null,
    });

    const for473 = await getTakesForVerse(10, undefined, undefined, 473);
    expect(for473.map(t => t.id).sort()).toEqual(['legacy-null', 'unit-473']);
    expect(for473.find(t => t.id === 'unit-473')?.projectUnitId).toBe(473);

    const for12 = await getTakesForVerse(10, undefined, undefined, 12);
    expect(for12.map(t => t.id).sort()).toEqual(['legacy-null', 'unit-12']);
  });

  it('keeps one selected take per project unit on the same bible text (#613)', async () => {
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///u473.m4a',
      id: 'unit-473',
      projectUnitId: 473,
    });
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///u12.m4a',
      id: 'unit-12',
      projectUnitId: 12,
    });

    const selected = (id: string) =>
      __getRecordingRows().find(r => r.id === id)?.is_selected;
    expect(selected('unit-473')).toBe(1);
    expect(selected('unit-12')).toBe(1);

    // A newer take in unit 473 replaces only unit 473's selection.
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///u473-b.m4a',
      id: 'unit-473-b',
      projectUnitId: 473,
    });
    expect(selected('unit-473')).toBe(0);
    expect(selected('unit-473-b')).toBe(1);
    expect(selected('unit-12')).toBe(1);
  });

  it('treats NULL project_unit_id as matching only other NULL rows (#613)', async () => {
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///legacy-a.m4a',
      id: 'legacy-a',
      projectUnitId: null,
    });
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///u12.m4a',
      id: 'unit-12',
      projectUnitId: 12,
    });
    // Unit take does not clear the legacy NULL take.
    expect(
      __getRecordingRows().find(r => r.id === 'legacy-a')?.is_selected,
    ).toBe(1);

    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///legacy-b.m4a',
      id: 'legacy-b',
      projectUnitId: null,
    });
    const rows = __getRecordingRows();
    expect(rows.find(r => r.id === 'legacy-a')?.is_selected).toBe(0);
    expect(rows.find(r => r.id === 'legacy-b')?.is_selected).toBe(1);
    expect(rows.find(r => r.id === 'unit-12')?.is_selected).toBe(1);
  });

  it('selecting a take only clears selection within its own unit (#613)', async () => {
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///a.m4a',
      id: 'u473-a',
      projectUnitId: 473,
    });
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///b.m4a',
      id: 'u473-b',
      projectUnitId: 473,
    });
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///c.m4a',
      id: 'u12',
      projectUnitId: 12,
    });

    await selectRecordingTake('u473-a');

    const rows = __getRecordingRows();
    expect(rows.find(r => r.id === 'u473-a')?.is_selected).toBe(1);
    expect(rows.find(r => r.id === 'u473-b')?.is_selected).toBe(0);
    expect(rows.find(r => r.id === 'u12')?.is_selected).toBe(1);
  });

  it('designating canonical only clears canonical within its own unit (#613)', async () => {
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///a.m4a',
      id: 'u473',
      projectUnitId: 473,
    });
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///b.m4a',
      id: 'u12',
      projectUnitId: 12,
    });
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///c.m4a',
      id: 'u12-b',
      projectUnitId: 12,
    });

    await setCanonicalTake('u473');
    await setCanonicalTake('u12');
    await setCanonicalTake('u12-b');

    const canonical = (id: string) =>
      __getRecordingRows().find(r => r.id === id)?.is_canonical;
    expect(canonical('u473')).toBe(1);
    expect(canonical('u12')).toBe(0);
    expect(canonical('u12-b')).toBe(1);
  });

  describe('selection change marks a pending sync (#701)', () => {
    const markUploaded = (id: string) => {
      rows = rows.map(r =>
        r.id === id
          ? {
              ...r,
              sync_status: 'uploaded' as const,
              blob_key: `unit-12/text-${r.bible_text_id}`,
              version_token: 3,
            }
          : r,
      );
    };
    const syncStatus = (id: string) =>
      __getRecordingRows().find(r => r.id === id)?.sync_status;

    it('selecting an already-uploaded take marks it pending (online or offline)', async () => {
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///a.m4a',
        id: 'sel-a',
      });
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///b.m4a',
        id: 'sel-b',
      });
      markUploaded('sel-a');
      markUploaded('sel-b');

      await selectRecordingTake('sel-a');

      expect(syncStatus('sel-a')).toBe('pending');
      // Deselected take whose bytes are on the server is not re-sent.
      expect(syncStatus('sel-b')).toBe('uploaded');
    });

    it('only the latest selection stays pending when the choice changes repeatedly', async () => {
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///a.m4a',
        id: 'multi-a',
      });
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///b.m4a',
        id: 'multi-b',
      });
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///c.m4a',
        id: 'multi-c',
      });
      markUploaded('multi-a');
      markUploaded('multi-b');
      markUploaded('multi-c');

      await selectRecordingTake('multi-a'); // a pending
      await selectRecordingTake('multi-b'); // b pending, a reverted
      await selectRecordingTake('multi-c'); // c pending, b reverted

      expect(syncStatus('multi-c')).toBe('pending');
      expect(syncStatus('multi-a')).toBe('uploaded');
      expect(syncStatus('multi-b')).toBe('uploaded');
    });

    it('keeps never-uploaded takes pending when they lose selection', async () => {
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///a.m4a',
        id: 'fresh-a',
      });
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///b.m4a',
        id: 'fresh-b',
      });

      await selectRecordingTake('fresh-a');

      expect(syncStatus('fresh-a')).toBe('pending');
      expect(syncStatus('fresh-b')).toBe('pending');
    });

    it('does not override conflicted or failed state on selection change', async () => {
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///a.m4a',
        id: 'state-a',
      });
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///b.m4a',
        id: 'state-b',
      });
      rows = rows.map(r =>
        r.id === 'state-a'
          ? { ...r, sync_status: 'conflicted' as const }
          : r.id === 'state-b'
          ? { ...r, sync_status: 'failed' as const }
          : r,
      );

      await selectRecordingTake('state-a');
      expect(syncStatus('state-a')).toBe('conflicted');

      await selectRecordingTake('state-b');
      expect(syncStatus('state-b')).toBe('failed');
    });
  });

  describe('canonical designation marks a pending sync (#701)', () => {
    const markUploaded = (id: string) => {
      rows = rows.map(r =>
        r.id === id
          ? {
              ...r,
              sync_status: 'uploaded' as const,
              blob_key: `unit-12/text-${r.bible_text_id}`,
              version_token: 3,
            }
          : r,
      );
    };
    const syncStatus = (id: string) =>
      __getRecordingRows().find(r => r.id === id)?.sync_status;

    it('designating an uploaded take marks it pending, even cross-account', async () => {
      __setMockActiveUserId('2');
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///peer.m4a',
        id: 'peer-take',
      });
      __setMockActiveUserId('1');
      markUploaded('peer-take');

      await setCanonicalTake('peer-take');

      expect(syncStatus('peer-take')).toBe('pending');
    });

    it('moving canonical reverts the prior take to uploaded', async () => {
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///a.m4a',
        id: 'canon-a',
      });
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///b.m4a',
        id: 'canon-b',
      });
      markUploaded('canon-a');
      markUploaded('canon-b');

      await setCanonicalTake('canon-a');
      await setCanonicalTake('canon-b');

      expect(syncStatus('canon-b')).toBe('pending');
      expect(syncStatus('canon-a')).toBe('uploaded');
    });

    it('reverts the prior canonical take to uploaded when designation moves, even while still selected (#701)', async () => {
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///a.m4a',
        id: 'staysel-a',
      });
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///b.m4a',
        id: 'staysel-b',
      });
      markUploaded('staysel-a');
      markUploaded('staysel-b');
      await selectRecordingTake('staysel-a'); // a is the active draft
      markUploaded('staysel-a'); // selection synced before designation

      await setCanonicalTake('staysel-a');
      await setCanonicalTake('staysel-b');

      // PM rule: canonical (b) is what syncs as the selected take. The
      // selection-sync marker on a is superseded — bytes are already on the
      // server, so a re-send would only push stale audio.
      expect(syncStatus('staysel-a')).toBe('uploaded');
      expect(syncStatus('staysel-b')).toBe('pending');
    });

    it('clears a superseded cross-account selection sync when canonical is designated (#701)', async () => {
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///a.m4a',
        id: 'sup-a',
      });
      __setMockActiveUserId('2');
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///peer-old.m4a',
        id: 'sup-peer',
      });
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///peer-new.m4a',
        id: 'sup-peer-new',
      });
      __setMockActiveUserId('1');
      markUploaded('sup-a');
      markUploaded('sup-peer');
      markUploaded('sup-peer-new');
      // Peer account selects its older take — selection change marks it pending.
      __setMockActiveUserId('2');
      await selectRecordingTake('sup-peer');
      __setMockActiveUserId('1');
      expect(syncStatus('sup-peer')).toBe('pending');

      // Canonical designation supersedes that pending selection sync.
      await setCanonicalTake('sup-a');

      expect(syncStatus('sup-peer')).toBe('uploaded');
      expect(syncStatus('sup-a')).toBe('pending');
    });

    it('clears a superseded same-account selection sync when designation lands (#701)', async () => {
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///a.m4a',
        id: 'defer-a',
      });
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///b.m4a',
        id: 'defer-b',
      });
      markUploaded('defer-a');
      markUploaded('defer-b');
      await selectRecordingTake('defer-b'); // b pending (selection change)

      await setCanonicalTake('defer-a');

      // Designation clears the superseded marker immediately (both on server).
      expect(syncStatus('defer-b')).toBe('uploaded');
      expect(syncStatus('defer-a')).toBe('pending');
    });

    it('does not mark a selection change pending while a canonical take exists (#701)', async () => {
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///a.m4a',
        id: 'canon-exists-a',
      });
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///b.m4a',
        id: 'canon-exists-b',
      });
      markUploaded('canon-exists-a');
      markUploaded('canon-exists-b');
      await setCanonicalTake('canon-exists-a');
      markUploaded('canon-exists-a'); // designation synced
      await selectRecordingTake('canon-exists-a'); // a is active draft
      markUploaded('canon-exists-a'); // selection synced

      await selectRecordingTake('canon-exists-b');

      // Canonical (a) is the take that syncs as selected — a selection flip
      // onto an already-uploaded take adds no sync work of its own.
      expect(
        __getRecordingRows().find(r => r.id === 'canon-exists-b')?.is_selected,
      ).toBe(1);
      expect(syncStatus('canon-exists-b')).toBe('uploaded');
    });

    it('still marks a never-uploaded selected take pending while canonical exists (#701)', async () => {
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///a.m4a',
        id: 'fresh-canon-a',
      });
      markUploaded('fresh-canon-a');
      await setCanonicalTake('fresh-canon-a');
      markUploaded('fresh-canon-a'); // designation synced

      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///new.m4a',
        id: 'fresh-canon-new',
      });

      // New audio must still upload (its bytes are only on the device).
      expect(syncStatus('fresh-canon-new')).toBe('pending');
    });

    it('does not override conflicted or failed state on designation', async () => {
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///a.m4a',
        id: 'canon-state-a',
      });
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///b.m4a',
        id: 'canon-state-b',
      });
      rows = rows.map(r =>
        r.id === 'canon-state-a'
          ? { ...r, sync_status: 'conflicted' as const }
          : r.id === 'canon-state-b'
          ? { ...r, sync_status: 'failed' as const }
          : r,
      );

      await setCanonicalTake('canon-state-a');
      expect(syncStatus('canon-state-a')).toBe('conflicted');

      await setCanonicalTake('canon-state-b');
      expect(syncStatus('canon-state-b')).toBe('failed');
    });

    it('bumps the recording data version on designation (#701)', async () => {
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///a.m4a',
        id: 'bump-a',
      });
      const versionBefore = getRecordingDataVersion();

      await setCanonicalTake('bump-a');
      expect(getRecordingDataVersion()).toBe(versionBefore + 1);

      await setCanonicalTake('bump-a'); // already canonical — no-op
      expect(getRecordingDataVersion()).toBe(versionBefore + 1);
    });
  });

  describe('deleting the selected take syncs the promotion (#701)', () => {
    const markUploaded = (id: string) => {
      rows = rows.map(r =>
        r.id === id
          ? {
              ...r,
              sync_status: 'uploaded' as const,
              blob_key: `unit-12/text-${r.bible_text_id}`,
              version_token: 3,
            }
          : r,
      );
    };
    const syncStatus = (id: string) =>
      __getRecordingRows().find(r => r.id === id)?.sync_status;

    it('marks the promoted take pending when its bytes are already on the server', async () => {
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///a.m4a',
        id: 'del-a',
      });
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///b.m4a',
        id: 'del-b',
      });
      markUploaded('del-a');
      markUploaded('del-b');

      await deleteRecordingTake('del-b'); // selected — a is promoted

      expect(
        __getRecordingRows().find(r => r.id === 'del-a')?.is_selected,
      ).toBe(1);
      // The server's active take still points at the deleted audio — the
      // promotion has to re-send so the server's selected take follows.
      expect(syncStatus('del-a')).toBe('pending');
    });

    it('does not mark the promoted take pending while a canonical take exists', async () => {
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///a.m4a',
        id: 'delcan-a',
      });
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///b.m4a',
        id: 'delcan-mid',
      });
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///c.m4a',
        id: 'delcan-sel',
      });
      markUploaded('delcan-a');
      markUploaded('delcan-mid');
      markUploaded('delcan-sel');
      await setCanonicalTake('delcan-a');
      markUploaded('delcan-a'); // designation synced

      await deleteRecordingTake('delcan-sel'); // mid is promoted

      // PM rule: canonical (a) is what syncs as the selected take — the
      // already-uploaded promotion adds no sync marker of its own.
      expect(
        __getRecordingRows().find(r => r.id === 'delcan-mid')?.is_selected,
      ).toBe(1);
      expect(syncStatus('delcan-mid')).toBe('uploaded');
      expect(syncStatus('delcan-a')).toBe('uploaded');
    });

    it('does not override conflicted or failed state on promotion', async () => {
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///a.m4a',
        id: 'delstate-a',
      });
      await addRecordingTake({
        bibleTextId: 10,
        localFilePath: 'file:///b.m4a',
        id: 'delstate-b',
      });
      rows = rows.map(r =>
        r.id === 'delstate-a' ? { ...r, sync_status: 'failed' as const } : r,
      );

      await deleteRecordingTake('delstate-b'); // a is promoted

      // 'failed' / 'conflicted' are left for their own retry flows.
      expect(syncStatus('delstate-a')).toBe('failed');
    });
  });

  it('deleting a selected take promotes only a take from the same unit (#613)', async () => {
    // take_number is per owner + bible text: 1 (473), 2-3 (12), 4 (473).
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///a.m4a',
      id: 'u473-old',
      projectUnitId: 473,
    });
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///b.m4a',
      id: 'u12-1',
      projectUnitId: 12,
    });
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///c.m4a',
      id: 'u12-2',
      projectUnitId: 12,
    });
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///d.m4a',
      id: 'u473-new',
      projectUnitId: 473,
    });

    await deleteRecordingTake('u473-new');

    const rows = __getRecordingRows();
    // Promote the highest remaining take in unit 473 — not unit 12's higher
    // take_number, which would leave u473-old unselected.
    expect(rows.find(r => r.id === 'u473-old')?.is_selected).toBe(1);
    expect(rows.find(r => r.id === 'u12-2')?.is_selected).toBe(1);
    expect(rows.find(r => r.id === 'u12-1')?.is_selected).toBe(0);
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

  it('promotes overlapping verse take when deleting selected pericope', async () => {
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

    await deleteRecordingTake('peri');

    expect(
      __getRecordingRows().find(r => r.id === 'verse-5')?.is_selected,
    ).toBe(1);
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

  it('does not clear selection on another book when selecting overlapping coordinates', async () => {
    await addRecordingTake({
      bibleTextId: 115,
      localFilePath: 'file:///other-book.m4a',
      id: 'other-book',
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

    await selectRecordingTake('other-book');

    expect(__getRecordingRows().find(r => r.id === 'home')?.is_selected).toBe(
      1,
    );
    expect(
      __getRecordingRows().find(r => r.id === 'other-book')?.is_selected,
    ).toBe(1);
  });

  it('does not list a pericope take across books with identical coordinates', async () => {
    await addRecordingTake({
      bibleTextId: 113,
      localFilePath: 'file:///other-book-p.m4a',
      id: 'other-book-peri',
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

  it('bumps the shared sync-status store when a take is saved or deleted', async () => {
    const versionBefore = getRecordingDataVersion();

    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///signal.m4a',
      id: 'signal-save',
    });
    expect(getRecordingDataVersion()).toBe(versionBefore + 1);

    await deleteRecordingTake('signal-save');
    expect(getRecordingDataVersion()).toBe(versionBefore + 2);
  });

  it('does not bump the store when a delete no-ops (missing or foreign take)', async () => {
    const versionBefore = getRecordingDataVersion();

    await deleteRecordingTake('missing-id');
    expect(getRecordingDataVersion()).toBe(versionBefore);

    __setMockActiveUserId('2');
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///foreign.m4a',
      id: 'foreign',
    });
    __setMockActiveUserId('1');
    await deleteRecordingTake('foreign');
    // Only the add bumped it; the guarded delete did not.
    expect(getRecordingDataVersion()).toBe(versionBefore + 1);
  });
  it('bumps the store when select changes the active take, not when it no-ops', async () => {
    await addRecordingTake({
      bibleTextId: 30,
      localFilePath: 'file:///s1.m4a',
      id: 's1',
    });
    await addRecordingTake({
      bibleTextId: 30,
      localFilePath: 'file:///s2.m4a',
      id: 's2',
    });
    const versionBefore = getRecordingDataVersion();

    await selectRecordingTake('s1'); // s2 is selected, so this applies
    expect(getRecordingDataVersion()).toBe(versionBefore + 1);

    await selectRecordingTake('s1'); // already selected
    await selectRecordingTake('missing-id'); // does not exist
    expect(getRecordingDataVersion()).toBe(versionBefore + 1);
  });

  it('does not bump the store when selecting a take owned by another user', async () => {
    __setMockActiveUserId('2');
    await addRecordingTake({
      bibleTextId: 31,
      localFilePath: 'file:///a.m4a',
      id: 'foreign-a',
    });
    await addRecordingTake({
      bibleTextId: 31,
      localFilePath: 'file:///b.m4a',
      id: 'foreign-b',
    });
    __setMockActiveUserId('1');
    const versionBefore = getRecordingDataVersion();

    await selectRecordingTake('foreign-a');
    expect(getRecordingDataVersion()).toBe(versionBefore);
  });
});

describe('server take delete queue (#716)', () => {
  beforeEach(() => {
    resetRecordingsDbMock();
  });

  const setServerTakeId = (id: string, serverTakeId: number) => {
    rows = rows.map(r =>
      r.id === id
        ? {
            ...r,
            sync_status: 'uploaded' as const,
            server_take_id: serverTakeId,
          }
        : r,
    );
  };

  it('queues a server delete for an uploaded take and clears it on demand', async () => {
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///a.m4a',
      id: 'q-a',
      projectUnitId: 12,
    });
    setServerTakeId('q-a', 55);

    await deleteRecordingTake('q-a');

    await expect(getPendingRecordingDeletions()).resolves.toEqual([
      {
        id: 'q-a',
        projectUnitId: 12,
        bibleTextId: 10,
        serverTakeId: 55,
        recordedByUserId: 1,
      },
    ]);

    await clearRecordingDeletion('q-a');
    await expect(getPendingRecordingDeletions()).resolves.toEqual([]);
  });

  it('does not queue a delete for a take the server never stored', async () => {
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///a.m4a',
      id: 'q-local',
      projectUnitId: 12,
    });

    await deleteRecordingTake('q-local');

    await expect(getPendingRecordingDeletions()).resolves.toEqual([]);
  });

  it('does not queue a delete for a take owned by another user', async () => {
    __setMockActiveUserId('2');
    await addRecordingTake({
      bibleTextId: 10,
      localFilePath: 'file:///a.m4a',
      id: 'q-foreign',
      projectUnitId: 12,
    });
    setServerTakeId('q-foreign', 56);
    __setMockActiveUserId('1');

    await deleteRecordingTake('q-foreign');

    await expect(getPendingRecordingDeletions()).resolves.toEqual([]);
    expect(__getRecordingRows().map(r => r.id)).toEqual(['q-foreign']);
  });
});
