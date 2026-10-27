const mockExecute = jest.fn();

jest.mock('./db', () => ({
  getDatabase: () => ({
    execute: mockExecute,
  }),
}));

jest.mock('./repository', () => ({
  ensureUserProjectMembership: jest.fn(async () => undefined),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: jest.fn(() => 7),
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: jest.fn(),
  getUserIdSync: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import {
  chapterHasUnuploadableSelectedTakes,
  getPendingUploadChapters,
  getPendingUploadCount,
  getUnsyncedRecordingCount,
  getUnuploadablePendingSummary,
} from './queries';

const UPLOADABLE_PREDICATES = [
  "IFNULL(r.granularity, 'verse') IN ('verse', 'pericope')",
  'r.bible_text_id > 0',
];

describe('pending upload queries (#545)', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('getPendingUploadCount uses the same verse + bible_text_id rules as getPendingRecordings', async () => {
    mockExecute.mockResolvedValue({ rows: [{ count: 2 }] });

    await expect(getPendingUploadCount()).resolves.toBe(2);

    const sql = String(mockExecute.mock.calls[0]?.[0]);
    for (const fragment of UPLOADABLE_PREDICATES) {
      expect(sql).toContain(fragment);
    }
    expect(sql).toContain('JOIN bible_texts');
    // project_unit_id appears only in the #701 canonical-deferral subquery —
    // never for assignment resolution in this count.
    expect(sql.match(/project_unit_id/g)).toHaveLength(2);
    expect(sql).toContain('c.project_unit_id IS r.project_unit_id');
  });

  it('uploadable pending queries include canonical rows regardless of owner (#701)', async () => {
    mockExecute.mockResolvedValue({ rows: [{ count: 1 }] });
    await getPendingUploadCount();
    const countSql = String(mockExecute.mock.calls[0]?.[0]);
    expect(countSql).toContain('r.is_canonical = 1');

    mockExecute.mockReset();
    mockExecute.mockResolvedValue({ rows: [] });
    await getPendingUploadChapters();
    const chaptersSql = String(mockExecute.mock.calls[0]?.[0]);
    expect(chaptersSql).toContain('r.is_canonical = 1');
  });

  it('uploadable pending queries defer selected takes while the verse has a canonical take (#701)', async () => {
    mockExecute.mockResolvedValue({ rows: [{ count: 1 }] });
    await getPendingUploadCount();
    const countSql = String(mockExecute.mock.calls[0]?.[0]);
    // PM rule: canonical is the take sent as the selected take. Selected-only
    // rows on a verse with a canonical take (same text + unit) are excluded.
    expect(countSql).toMatch(/NOT \(\s*r\.is_selected = 1\s*AND EXISTS/);
    expect(countSql).toContain('c.bible_text_id = r.bible_text_id');
    expect(countSql).toContain('c.is_canonical = 1');

    mockExecute.mockReset();
    mockExecute.mockResolvedValue({ rows: [] });
    await getPendingUploadChapters();
    const chaptersSql = String(mockExecute.mock.calls[0]?.[0]);
    expect(chaptersSql).toMatch(/NOT \(\s*r\.is_selected = 1\s*AND EXISTS/);
    expect(chaptersSql).toContain('c.is_canonical = 1');
  });

  it('uploadable pending queries count non-selected takes (#716)', async () => {
    mockExecute.mockResolvedValue({ rows: [{ count: 1 }] });
    await getPendingUploadCount();
    const countSql = String(mockExecute.mock.calls[0]?.[0]);
    expect(countSql).not.toMatch(/OR \(\s*r\.is_selected = 1 AND/);
  });

  it('getUnsyncedRecordingCount includes pericope takes not yet on the server', async () => {
    mockExecute.mockResolvedValue({ rows: [{ count: 1 }] });

    await expect(getUnsyncedRecordingCount()).resolves.toBe(1);

    const sql = String(mockExecute.mock.calls[0]?.[0]);
    expect(sql).toContain("sync_status NOT IN ('uploaded', 'conflicted')");
    expect(sql).not.toContain('granularity');
    expect(sql).not.toContain('bible_texts');
  });

  it('getUnsyncedRecordingCount does not treat a query failure as zero', async () => {
    const failure = new Error('db');
    mockExecute.mockRejectedValue(failure);

    await expect(getUnsyncedRecordingCount()).rejects.toBe(failure);
  });

  it('pending upload count and chapters include queued take deletions (#716)', async () => {
    mockExecute.mockResolvedValue({ rows: [{ count: 1 }] });
    await getPendingUploadCount();
    const countSql = String(mockExecute.mock.calls[0]?.[0]);
    expect(countSql).toContain('FROM recording_deletions d');
    expect(countSql).toContain(
      'JOIN bible_texts bt ON bt.id = d.bible_text_id',
    );
    expect(countSql).toContain('d.recorded_by_user_id = ?');
    expect(mockExecute.mock.calls[0]?.[1]).toEqual([7, 7]);

    mockExecute.mockReset();
    mockExecute.mockResolvedValue({
      rows: [
        { book_id: 1, chapter_number: 2 },
        { book_id: 1, chapter_number: 3 },
      ],
    });
    await expect(getPendingUploadChapters()).resolves.toEqual([
      { bookId: 1, chapterNumber: 2 },
      { bookId: 1, chapterNumber: 3 },
    ]);
    const chaptersSql = String(mockExecute.mock.calls[0]?.[0]);
    expect(chaptersSql).toContain('UNION');
    expect(chaptersSql).toContain('FROM recording_deletions d');
    expect(chaptersSql).toContain(
      'JOIN bible_texts bt ON bt.id = d.bible_text_id',
    );
    expect(chaptersSql).toContain('d.recorded_by_user_id = ?');
    expect(mockExecute.mock.calls[0]?.[1]).toEqual([7, 7]);
  });

  it('getPendingUploadChapters only lists chapters with upload-eligible verse or pericope takes', async () => {
    mockExecute.mockResolvedValue({
      rows: [{ book_id: 1, chapter_number: 3 }],
    });

    await expect(getPendingUploadChapters()).resolves.toEqual([
      { bookId: 1, chapterNumber: 3 },
    ]);

    const sql = String(mockExecute.mock.calls[0]?.[0]);
    for (const fragment of UPLOADABLE_PREDICATES) {
      expect(sql).toContain(fragment);
    }
    expect(sql).toContain('JOIN bible_texts');
  });

  it('getUnuploadablePendingSummary buckets orphan and pericope rows, not missing assignment', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          orphan_bible_text: 1,
          pericope_only: 2,
          other: 0,
        },
      ],
    });

    await expect(getUnuploadablePendingSummary()).resolves.toEqual({
      orphanBibleText: 1,
      pericopeOnly: 2,
      other: 0,
      total: 3,
    });

    const sql = String(mockExecute.mock.calls[0]?.[0]);
    expect(sql).toContain('orphan_bible_text');
    expect(sql).toContain('pericope_only');
    expect(sql).not.toContain('project_unit');
    expect(sql).not.toContain('missing_assignment');
  });

  it('getPendingUploadCount rejects when the query fails', async () => {
    mockExecute.mockRejectedValue(new Error('db'));

    await expect(getPendingUploadCount()).rejects.toThrow('db');
  });

  it('getUnuploadablePendingSummary rejects when the query fails', async () => {
    mockExecute.mockRejectedValue(new Error('db'));

    await expect(getUnuploadablePendingSummary()).rejects.toThrow('db');
  });

  it('chapterHasUnuploadableSelectedTakes is true when the chapter has non-verse pending (#585)', async () => {
    mockExecute.mockResolvedValue({ rows: [{ count: 2 }] });

    await expect(chapterHasUnuploadableSelectedTakes(9, 40, 1)).resolves.toBe(
      true,
    );

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('bt.book_id = ?'),
      [9, 40, 7, 1, 1, 1],
    );
    const sql = String(mockExecute.mock.calls[0]?.[0]);
    expect(sql).toContain('bt.bible_id = ?');
    expect(sql).toContain("IFNULL(r.granularity, 'verse') = 'verse'");
    expect(sql).toContain('NOT (');
  });

  it('chapterHasUnuploadableSelectedTakes detects a take anchored in ch.1 spanning into ch.2 (#585)', async () => {
    mockExecute.mockResolvedValue({ rows: [{ count: 1 }] });

    await expect(chapterHasUnuploadableSelectedTakes(9, 40, 2)).resolves.toBe(
      true,
    );

    const [sql, params] = mockExecute.mock.calls[0] as [string, number[]];
    expect(sql).toContain('bt.chapter_number = ?');
    expect(sql).toContain('r.start_chapter > 0');
    expect(sql).toContain('r.start_chapter <= ?');
    expect(sql).toContain('r.end_chapter >= ?');
    // bible, book, user, then chapter for anchor + start<=ch + end>=ch.
    expect(params).toEqual([9, 40, 7, 2, 2, 2]);
  });

  it('chapterHasUnuploadableSelectedTakes is false when count is zero', async () => {
    mockExecute.mockResolvedValue({ rows: [{ count: 0 }] });

    await expect(chapterHasUnuploadableSelectedTakes(9, 40, 1)).resolves.toBe(
      false,
    );
  });

  it('chapterHasUnuploadableSelectedTakes fails closed when the query errors', async () => {
    mockExecute.mockRejectedValue(new Error('db'));

    await expect(chapterHasUnuploadableSelectedTakes(9, 40, 1)).resolves.toBe(
      true,
    );
  });
});
