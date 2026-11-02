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

  function mockMilestoneQueries(options: {
    bases: Array<{
      id: number;
      name: string;
      project_id: number;
      project_name: string;
      target_language_name: string;
      milestone_count: number;
    }>;
    recordings: Array<{
      id: number;
      recording_count: number;
      pending_count: number;
    }>;
  }) {
    mockExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('AS milestone_count')) {
        return { rows: options.bases };
      }
      if (sql.includes('FROM recordings r')) {
        return { rows: options.recordings };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
  }

  it('merges one row per unit with parent count and recording sync state', async () => {
    mockMilestoneQueries({
      bases: [
        {
          id: 10,
          name: 'Mark',
          project_id: 1,
          project_name: 'Baka NT',
          target_language_name: 'Baka',
          milestone_count: 2,
        },
        {
          id: 11,
          name: 'Genesis',
          project_id: 1,
          project_name: 'Baka NT',
          target_language_name: 'Baka',
          milestone_count: 2,
        },
        {
          id: 20,
          name: 'Luke',
          project_id: 2,
          project_name: 'French NT',
          target_language_name: 'French',
          milestone_count: 1,
        },
      ],
      recordings: [
        { id: 10, recording_count: 3, pending_count: 1 },
        { id: 20, recording_count: 4, pending_count: 0 },
      ],
    });

    const result = await getMilestonesWithSummary(247);

    expect(mockExecute).toHaveBeenCalledTimes(2);
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

  it('defaults recording counts when a unit has no rows', async () => {
    mockMilestoneQueries({
      bases: [
        {
          id: 11,
          name: 'Genesis',
          project_id: 1,
          project_name: 'Baka NT',
          target_language_name: 'Baka',
          milestone_count: 2,
        },
      ],
      recordings: [],
    });

    const result = await getMilestonesWithSummary(247);

    expect(result[0]).toMatchObject({
      id: 11,
      milestoneCount: 2,
      syncState: 'none',
    });
  });

  it('recording query starts from recordings and groups by unit id', async () => {
    mockMilestoneQueries({ bases: [], recordings: [] });

    await getMilestonesWithSummary(99);

    const baseSql = mockExecute.mock.calls.find(([sql]) =>
      String(sql).includes('AS milestone_count'),
    )?.[0] as string;
    expect(baseSql).toContain('FROM project_units pu');
    expect(baseSql).toContain('user_projects');
    expect(baseSql).not.toContain('bible_texts');
    expect(baseSql).not.toContain('recordings');

    const recordingSql = mockExecute.mock.calls.find(([sql]) =>
      String(sql).includes('FROM recordings r'),
    )?.[0] as string;
    expect(recordingSql).toContain('GROUP BY pu.id');
    expect(recordingSql).toContain('INNER JOIN bible_texts bt_r');
    expect(recordingSql).not.toContain('LEFT JOIN bible_texts');
  });

  it('returns [] on error', async () => {
    mockExecute.mockRejectedValue(new Error('disk I/O error'));

    await expect(getMilestonesWithSummary(1)).resolves.toEqual([]);
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
    expect(sql).toContain(
      'JOIN user_projects up ON up.project_id = pu.project_id',
    );
    expect(sql).toContain('pu.id = ?');
    expect(sql).toContain('up.user_id = ?');
    expect(sql).not.toContain('pu.project_id = ?');
    expect(mockExecute).toHaveBeenCalledWith(
      expect.any(String),
      [247, 10, 247],
    );
  });
});
