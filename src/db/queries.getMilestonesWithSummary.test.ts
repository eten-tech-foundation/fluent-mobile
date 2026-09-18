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

import { getMilestoneChapters, getMilestonesWithSummary } from './queries';

describe('getMilestonesWithSummary', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('returns one row per unit across member projects with parent count', async () => {
    mockExecute.mockImplementation(async (sql: string) => {
      if (
        sql.includes('FROM project_units pu') &&
        sql.includes('milestone_count')
      ) {
        return {
          rows: [
            {
              id: 10,
              name: 'Mark',
              project_id: 1,
              project_name: 'Baka NT',
              target_language_name: 'Baka',
              milestone_count: 2,
              recording_count: 3,
              pending_count: 1,
            },
            {
              id: 11,
              name: 'Genesis',
              project_id: 1,
              project_name: 'Baka NT',
              target_language_name: 'Baka',
              milestone_count: 2,
              recording_count: 0,
              pending_count: 0,
            },
            {
              id: 20,
              name: 'Luke',
              project_id: 2,
              project_name: 'French NT',
              target_language_name: 'French',
              milestone_count: 1,
              recording_count: 4,
              pending_count: 0,
            },
          ],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await getMilestonesWithSummary(247);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      id: 10,
      name: 'Mark',
      projectId: 1,
      projectName: 'Baka NT',
      targetLanguageName: 'Baka',
      milestoneCount: 2,
      syncState: 'unsynced',
    });
    expect(result[1]).toMatchObject({
      id: 11,
      name: 'Genesis',
      projectId: 1,
      milestoneCount: 2,
      syncState: 'none',
    });
    expect(result[2]).toMatchObject({
      id: 20,
      name: 'Luke',
      projectId: 2,
      projectName: 'French NT',
      milestoneCount: 1,
      syncState: 'synced',
    });
  });

  it('scopes recording aggregates by project unit id', async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    await getMilestonesWithSummary(99);

    const sql = String(mockExecute.mock.calls[0]?.[0]);
    expect(sql).toContain('GROUP BY pu.id');
    expect(sql).toContain('user_projects');
  });
});

describe('getMilestoneChapters', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('filters chapter assignments by project unit id, not project id', async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    await getMilestoneChapters(10, 247);

    const sql = String(mockExecute.mock.calls[0]?.[0]);
    expect(sql).toContain('pu.id = ?');
    expect(sql).not.toContain('pu.project_id = ?');
    expect(mockExecute).toHaveBeenCalledWith(expect.any(String), [247, 10]);
  });
});
