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
  getPendingUploadChapters,
  getPendingUploadCount,
  getUnuploadablePendingSummary,
} from './queries';

const UPLOADABLE_PREDICATES = [
  "IFNULL(r.granularity, 'verse') = 'verse'",
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
    expect(sql).not.toContain('project_unit_id');
  });

  it('getPendingUploadChapters only lists chapters with upload-eligible verse takes', async () => {
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

  it('getUnuploadablePendingSummary returns zeros when the query fails', async () => {
    mockExecute.mockRejectedValue(new Error('db'));

    await expect(getUnuploadablePendingSummary()).resolves.toEqual({
      orphanBibleText: 0,
      pericopeOnly: 0,
      other: 0,
      total: 0,
    });
  });
});
