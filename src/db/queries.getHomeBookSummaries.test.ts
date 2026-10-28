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
  parseUserId: jest.fn(),
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

import { getHomeBookSummaries, getMyWorkChapters } from './queries';

const ME = 7;
const RAVI = 8;

function chapter(
  overrides: Partial<{
    id: number;
    status: string;
    assigned_user_id: number | null;
    peer_checker_id: number | null;
    book_id: number;
    book_name: string;
    project_unit_id: number;
    milestone_name: string;
  }>,
) {
  return {
    id: 1,
    status: 'not_started',
    assigned_user_id: null,
    peer_checker_id: null,
    book_id: 41,
    book_name: 'Mark',
    project_unit_id: 10,
    project_id: 1,
    project_name: 'Baka NT',
    milestone_name: 'Gospels',
    target_language_name: 'Baka',
    ...overrides,
  };
}

describe('getHomeBookSummaries', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('counts each book by whose turn its chapters are, mine first', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        chapter({
          id: 30,
          book_id: 1,
          book_name: 'Genesis',
          project_unit_id: 20,
        }),
        chapter({
          id: 31,
          book_id: 1,
          book_name: 'Genesis',
          project_unit_id: 20,
          status: 'complete',
        }),
        chapter({ id: 3, status: 'draft', assigned_user_id: ME }),
        chapter({
          status: 'peer_check',
          assigned_user_id: RAVI,
          peer_checker_id: ME,
        }),
        chapter({ status: 'draft', assigned_user_id: RAVI }),
        chapter({
          status: 'peer_check',
          assigned_user_id: ME,
          peer_checker_id: RAVI,
        }),
        chapter({ status: 'peer_check', assigned_user_id: ME }),
        chapter({ status: 'community_review', assigned_user_id: ME }),
        chapter({}),
        chapter({ project_unit_id: 11, milestone_name: 'Mark later' }),
      ],
    });

    const books = await getHomeBookSummaries(ME);

    expect(books.map(b => b.key)).toEqual(['10:41', '20:1', '11:41']);
    expect(books[0]).toMatchObject({
      bookName: 'Mark',
      projectId: 1,
      projectUnitId: 10,
      projectName: 'Baka NT',
      milestoneName: 'Gospels',
      targetLanguageName: 'Baka',
      firstChapterId: 3,
      mine: 2,
      withOthers: 4,
      open: 1,
      complete: 0,
      totalChapters: 7,
      recordedChapters: 4,
      checkedChapters: 1,
    });
    expect(books[1]).toMatchObject({
      bookName: 'Genesis',
      firstChapterId: 30,
      mine: 0,
      withOthers: 0,
      open: 1,
      complete: 1,
      totalChapters: 2,
      recordedChapters: 1,
      checkedChapters: 1,
    });
    expect(books[2]).toMatchObject({ milestoneName: 'Mark later', open: 1 });
  });

  it('reads every chapter in the milestones I belong to', async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    await getHomeBookSummaries(ME);

    const sql = String(mockExecute.mock.calls[0]?.[0]);
    expect(sql).toContain(
      'JOIN user_projects up ON up.project_id = pu.project_id',
    );
    expect(sql).toContain('up.user_id = ?');
    expect(sql).toContain('ORDER BY b.id, pu.id, ca.chapter_number');
    expect(mockExecute).toHaveBeenCalledWith(expect.any(String), [ME]);
  });

  it('returns nothing when the read fails', async () => {
    mockExecute.mockRejectedValue(new Error('disk I/O error'));

    await expect(getHomeBookSummaries(ME)).resolves.toEqual([]);
  });
});

describe('getMyWorkChapters', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("carries each chapter's project, unit and milestone", async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          id: 6,
          book_id: 42,
          chapter_number: 3,
          status: 'draft',
          book_name: 'Luke',
          project_id: 1,
          project_unit_id: 10,
          project_name: 'Baka NT',
          milestone_name: 'Gospels',
          target_language_name: 'Baka',
          assigned_user_id: ME,
          peer_checker_id: null,
          recording_count: 0,
          pending_count: 0,
          total_verses: 38,
          completed_verses: 0,
          downloaded_verses: 0,
          has_conflict: 0,
        },
      ],
    });

    const [mine] = await getMyWorkChapters(ME);

    const sql = String(mockExecute.mock.calls[0]?.[0]);
    const selected = sql.slice(0, sql.indexOf('FROM chapter_assignments'));
    expect(selected).toContain('pu.project_id');
    expect(selected).toContain('ca.project_unit_id');
    expect(selected).toContain('AS milestone_name');
    expect(mine).toMatchObject({
      projectId: 1,
      projectUnitId: 10,
      projectName: 'Baka NT',
      milestoneName: 'Gospels',
    });
  });
});
