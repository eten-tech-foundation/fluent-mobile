import type { RecordingRow } from '../types/db/types';

type Row = RecordingRow;

let rows: Row[] = [];
let mockActiveUserId = '1';

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

async function mockExecute(
  sql: string,
  params: unknown[] = [],
): Promise<ExecuteResult> {
  const normalized = sql.replace(/\s+/g, ' ').trim();

  if (normalized.startsWith('UPDATE recordings SET is_latest = 0')) {
    const bibleTextId = params[1] as number;
    const updatedAt = params[0] as string;
    rows = rows.map(r =>
      r.bible_text_id === bibleTextId &&
      r.is_latest === 1 &&
      matchesOwner(r, normalized, params, 2)
        ? { ...r, is_latest: 0, updated_at: updatedAt }
        : r,
    );
    return { rows: [] };
  }

  if (normalized.startsWith('SELECT MAX(take_number)')) {
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
      is_latest: 1,
      sync_status: syncStatus,
      upload_error: null,
      created_at: createdAt,
      updated_at: updatedAt,
    });
    return { rows: [] };
  }

  if (
    normalized.includes(
      'SELECT * FROM recordings WHERE bible_text_id = ? AND is_latest = 1',
    )
  ) {
    const bibleTextId = params[0] as number;
    const match = rows.find(
      r =>
        r.bible_text_id === bibleTextId &&
        r.is_latest === 1 &&
        matchesOwner(r, normalized, params, 1),
    );
    return { rows: match ? [clone(match)] : [] };
  }

  if (
    normalized.includes('SELECT * FROM recordings WHERE bible_text_id = ?') &&
    normalized.includes('ORDER BY take_number ASC')
  ) {
    const bibleTextId = params[0] as number;
    return {
      rows: rows
        .filter(
          r =>
            r.bible_text_id === bibleTextId &&
            matchesOwner(r, normalized, params, 1),
        )
        .sort((a, b) => a.take_number - b.take_number)
        .map(clone),
    };
  }

  if (
    normalized.startsWith(
      'SELECT bible_text_id, recorded_by_user_id, is_latest FROM recordings WHERE id = ?',
    )
  ) {
    const id = params[0] as string;
    const match = rows.find(r => r.id === id);
    return {
      rows: match
        ? [
            {
              bible_text_id: match.bible_text_id,
              recorded_by_user_id: match.recorded_by_user_id,
              is_latest: match.is_latest,
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

  if (normalized.startsWith('UPDATE recordings SET is_latest = 1')) {
    const updatedAt = params[0] as string;
    const id = params[1] as string;
    rows = rows.map(r =>
      r.id === id ? { ...r, is_latest: 1, updated_at: updatedAt } : r,
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
} from './recordingsRepository';

describe('recordingsRepository multi-take', () => {
  beforeEach(() => {
    resetRecordingsDbMock();
  });

  it('bumps take_number and flips is_latest in one transaction', async () => {
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
    expect(takes.filter(t => t.isLatest)).toHaveLength(1);
    expect(takes.find(t => t.isLatest)?.id).toBe('take-2');
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

  it('keeps separate latest takes per user on the same verse', async () => {
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
        r => r.bible_text_id === 5 && r.is_latest === 1,
      ),
    ).toHaveLength(2);
  });

  it('keeps exactly one is_latest per bible_text_id for the active user', async () => {
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
    const latestCount = __getRecordingRows().filter(
      r =>
        r.bible_text_id === 1 &&
        r.recorded_by_user_id === 1 &&
        r.is_latest === 1,
    );
    expect(latestCount).toHaveLength(1);
  });

  it('promotes previous take when deleting the latest', async () => {
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
    expect(latest?.isLatest).toBe(true);
  });

  it('clears latest when deleting the only take', async () => {
    await addRecordingTake({
      bibleTextId: 3,
      localFilePath: 'file:///only.m4a',
      id: 'only',
    });
    await deleteRecordingTake('only');
    await expect(getLatestRecordingForVerse(3)).resolves.toBeNull();
    expect(await getTakesForVerse(3)).toEqual([]);
  });
});
