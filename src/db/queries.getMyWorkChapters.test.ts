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

jest.mock('../services/storage', () => ({
  getActiveUserId: jest.fn(),
  getUserIdSync: jest.fn(),
}));

import { getMyWorkChapters } from './queries';
import {
  MY_WORK_CHAPTER_STATUSES,
  MY_WORK_OBSERVER_REVIEW_STATUSES,
} from '../utils/myWorkChapterFilter';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    book_id: 40,
    chapter_number: 1,
    status: 'draft',
    updated_at: null,
    submitted_time: null,
    assigned_user_id: 7,
    peer_checker_id: null,
    project_unit_id: 11,
    project_id: 3,
    bible_id: 5,
    book_code: 'MAT',
    book_name: 'Matthew',
    project_name: 'Demo',
    target_language_name: 'English',
    recording_count: 0,
    pending_count: 0,
    last_recording_activity: null,
    total_verses: 1,
    completed_verses: 0,
    downloaded_verses: 0,
    has_conflict: 0,
    stage_entered_at: null,
    ...overrides,
  };
}

describe('getMyWorkChapters', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('binds assigned params only when Observer grant IDs are absent', async () => {
    mockExecute.mockResolvedValue({ rows: [row()] });

    const chapters = await getMyWorkChapters(7);

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = mockExecute.mock.calls[0] as [
      string,
      (string | number)[],
    ];
    expect(sql).toContain('pu.project_id');
    expect(sql).not.toContain('user_projects');
    expect(sql).toContain('ca.stage_entered_at');
    expect(sql).toMatch(/ORDER BY b\.id, ca\.chapter_number/);
    expect(params).toEqual([
      7,
      MY_WORK_CHAPTER_STATUSES.NOT_STARTED,
      MY_WORK_CHAPTER_STATUSES.DRAFT,
      7,
      MY_WORK_CHAPTER_STATUSES.PEER_CHECK,
      7,
    ]);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.listAccess).toBe('assigned');
    expect(chapters[0]?.projectId).toBe(3);
    expect(chapters[0]?.stageEnteredAt).toBeNull();
  });

  it('maps stage_entered_at onto MyWorkChapter.stageEnteredAt', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        row({
          stage_entered_at: '2025-04-01T15:30:00.000Z',
        }),
        row({
          id: 2,
          stage_entered_at: '   ',
        }),
      ],
    });

    const chapters = await getMyWorkChapters(7);

    expect(chapters[0]?.stageEnteredAt).toBe('2025-04-01T15:30:00.000Z');
    expect(chapters[1]?.stageEnteredAt).toBeNull();
  });

  it('binds Observer statuses, deduped project IDs, and membership userId', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        row({
          id: 10,
          status: 'community_review',
          assigned_user_id: null,
          project_id: 100,
        }),
        row({
          id: 11,
          status: 'draft',
          assigned_user_id: 7,
          project_id: 3,
        }),
      ],
    });

    const chapters = await getMyWorkChapters(7, {
      grantProjectIds: [100, 100, 200],
    });

    const [sql, params] = mockExecute.mock.calls[0] as [
      string,
      (string | number)[],
    ];
    expect(sql).toContain('pu.project_id IN (?, ?)');
    expect(sql).toContain('FROM user_projects up');
    expect(sql).toMatch(
      /\(\(ca\.status IN \(\?, \?\) AND ca\.assigned_user_id = \?\)\s+OR \(ca\.status = \? AND ca\.peer_checker_id = \?\)\)\s+OR \(/,
    );
    expect(params).toEqual([
      7,
      MY_WORK_CHAPTER_STATUSES.NOT_STARTED,
      MY_WORK_CHAPTER_STATUSES.DRAFT,
      7,
      MY_WORK_CHAPTER_STATUSES.PEER_CHECK,
      7,
      ...MY_WORK_OBSERVER_REVIEW_STATUSES,
      100,
      200,
      7,
    ]);

    expect(chapters.map(c => c.id).sort()).toEqual([10, 11]);
    expect(chapters.find(c => c.id === 10)?.listAccess).toBe('observer');
    expect(chapters.find(c => c.id === 11)?.listAccess).toBe('assigned');
  });

  it('drops Observer-looking rows that lack a verified grant project id', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        row({
          id: 20,
          status: 'linguist_check',
          assigned_user_id: null,
          project_id: 99,
        }),
        row({
          id: 21,
          status: 'peer_check',
          assigned_user_id: 9,
          peer_checker_id: 7,
          project_id: 3,
        }),
      ],
    });

    const chapters = await getMyWorkChapters(7, { grantProjectIds: [3] });

    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.id).toBe(21);
    expect(chapters[0]?.listAccess).toBe('assigned');
  });
});
