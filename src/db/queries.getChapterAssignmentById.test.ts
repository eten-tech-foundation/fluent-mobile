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

import { getChapterAssignmentById } from './queries';

describe('getChapterAssignmentById', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('selects and maps peer_checker_id to peerCheckerId', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          id: 1,
          project_unit_id: 2,
          bible_id: 3,
          book_id: 4,
          chapter_number: 5,
          assigned_user_id: 10,
          peer_checker_id: 20,
          status: 'draft',
          submitted_time: null,
          updated_at: '2026-01-01T00:00:00.000Z',
          has_conflict: 1,
          book_code: 'MRK',
          book_name: 'Mark',
          bible_name: 'BSB',
          bible_abbreviation: 'BSB',
        },
      ],
    });

    const result = await getChapterAssignmentById(1);

    expect(mockExecute.mock.calls[0]?.[0]).toContain('ca.peer_checker_id');
    expect(mockExecute.mock.calls[0]?.[0]).toContain('ca.has_conflict');
    expect(result).toMatchObject({
      assignedUserId: 10,
      peerCheckerId: 20,
      hasConflict: true,
    });
  });

  it('returns null when no row matches', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    expect(await getChapterAssignmentById(999)).toBeNull();
  });

  it('returns null and logs when the query throws', async () => {
    mockExecute.mockRejectedValue(new Error('db unavailable'));
    expect(await getChapterAssignmentById(1)).toBeNull();
  });
});
