const mockExecute = jest.fn();

jest.mock('./db', () => ({
  getDatabase: () => ({
    execute: mockExecute,
  }),
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

jest.mock('../utils/parseUserId', () => ({
  parseUserId: jest.fn(),
}));

import { getMyWorkChapters } from './queries';

describe('getMyWorkChapters', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('selects download-request id columns (regression for peer chip wiring)', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          id: 9,
          book_id: 41,
          chapter_number: 1,
          status: 'peer_check',
          updated_at: '2026-01-01T00:00:00.000Z',
          submitted_time: null,
          assigned_user_id: 3,
          peer_checker_id: 7,
          project_unit_id: 12,
          bible_id: 1,
          project_id: 100,
          book_code: 'MRK',
          book_name: 'Mark',
          project_name: 'Demo',
          target_language_name: 'Tok Pisin',
          recorded_verses: 0,
          downloaded_verses: 0,
          total_verses: 10,
          completed_verses: 0,
          has_conflict: 0,
        },
      ],
    });

    const chapters = await getMyWorkChapters(7);
    const sql = String(mockExecute.mock.calls[0]?.[0] ?? '');

    expect(sql).toContain('pu.project_id');
    expect(sql).toContain('b.code AS book_code');
    expect(sql).toContain('ca.project_unit_id');
    expect(sql).toContain('ca.bible_id');
    expect(sql).toContain('ca.book_id');
    expect(sql).toContain('ca.assigned_user_id');
    expect(sql).toContain('ca.peer_checker_id');

    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({
      id: 9,
      projectUnitId: 12,
      projectId: 100,
      bibleId: 1,
      bookId: 41,
      bookCode: 'MRK',
      assignedUserId: 3,
      peerCheckerId: 7,
    });
  });

  it('returns [] when the query throws', async () => {
    mockExecute.mockRejectedValue(new Error('db unavailable'));
    expect(await getMyWorkChapters(7)).toEqual([]);
  });
});
