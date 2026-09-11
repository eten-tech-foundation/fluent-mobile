const mockExecute = jest.fn();

jest.mock('./db', () => ({
  getDatabase: () => ({
    execute: mockExecute,
  }),
}));

jest.mock('./repository', () => ({
  ensureUserProjectMembership: jest.fn(async () => undefined),
}));

// queries.ts imports parseUserId → storage → native op-sqlite; mock the chain.
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

import { getProjectsWithSummary } from './queries';

describe('getProjectsWithSummary', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('merges base projects, chapter counts, and recording counts', async () => {
    mockExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('ORDER BY p.name COLLATE NOCASE')) {
        return {
          rows: [
            {
              id: 1,
              name: 'Alpha',
              source_language_id: 10,
              target_language_id: 20,
              is_active: 1,
              status: 'active',
              updated_at: '2026-01-01T00:00:00.000Z',
              metadata: null,
              source_language_name: 'English',
              target_language_name: 'Baka',
            },
          ],
        };
      }
      if (sql.includes('COUNT(DISTINCT ca.id) AS chapter_count')) {
        return { rows: [{ id: 1, chapter_count: 12 }] };
      }
      if (sql.includes('FROM recordings r')) {
        return {
          rows: [{ id: 1, recording_count: 3, pending_count: 1 }],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await getProjectsWithSummary(247);

    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 1,
      name: 'Alpha',
      target_language_name: 'Baka',
      chapterCount: 12,
      syncState: 'unsynced',
    });
  });

  it('defaults chapter and recording counts when a project has no rows', async () => {
    mockExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('ORDER BY p.name COLLATE NOCASE')) {
        return {
          rows: [
            {
              id: 2,
              name: 'Beta',
              source_language_id: 10,
              target_language_id: 21,
              is_active: 1,
              status: 'active',
              updated_at: '2026-01-01T00:00:00.000Z',
              metadata: null,
              source_language_name: 'English',
              target_language_name: 'French',
            },
          ],
        };
      }
      if (sql.includes('COUNT(DISTINCT ca.id)')) {
        return { rows: [] };
      }
      if (sql.includes('FROM recordings r')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await getProjectsWithSummary(247);

    expect(result[0]).toMatchObject({
      chapterCount: 0,
      syncState: 'none',
    });
  });

  it('maps recordings with no pending items to synced', async () => {
    mockExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('ORDER BY p.name COLLATE NOCASE')) {
        return {
          rows: [
            {
              id: 3,
              name: 'Gamma',
              source_language_id: 10,
              target_language_id: 22,
              is_active: 1,
              status: 'active',
              updated_at: '2026-01-01T00:00:00.000Z',
              metadata: null,
              source_language_name: 'English',
              target_language_name: 'Spanish',
            },
          ],
        };
      }
      if (sql.includes('COUNT(DISTINCT ca.id) AS chapter_count')) {
        return { rows: [{ id: 3, chapter_count: 4 }] };
      }
      if (sql.includes('FROM recordings r')) {
        return {
          rows: [{ id: 3, recording_count: 5, pending_count: 0 }],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await getProjectsWithSummary(247);

    expect(result[0]).toMatchObject({
      id: 3,
      chapterCount: 4,
      syncState: 'synced',
    });
  });

  it('recording query starts from recordings (no chapter-wide bible_texts scan)', async () => {
    mockExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('ORDER BY p.name')) {
        return { rows: [] };
      }
      if (sql.includes('COUNT(DISTINCT ca.id)')) {
        return { rows: [] };
      }
      if (sql.includes('FROM recordings r')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await getProjectsWithSummary(99);

    const recordingSql = mockExecute.mock.calls.find(([sql]) =>
      String(sql).includes('FROM recordings r'),
    )?.[0] as string;
    expect(recordingSql).toContain('INNER JOIN bible_texts bt_r');
    expect(recordingSql).not.toContain('LEFT JOIN bible_texts');
  });
});
