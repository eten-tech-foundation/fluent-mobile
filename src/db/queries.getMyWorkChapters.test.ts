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
    ...overrides,
  };
}

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
    // JOIN clauses also mention these columns — assert the SELECT list only.
    const selectList = sql.slice(0, sql.indexOf('FROM chapter_assignments'));
    expect(selectList).toContain('pu.project_id');
    expect(selectList).toContain('b.code AS book_code');
    expect(selectList).toContain('ca.project_unit_id');
    expect(selectList).toContain('ca.bible_id');
    expect(selectList).toContain('ca.book_id');
    expect(selectList).toContain('ca.assigned_user_id');
    expect(selectList).toContain('ca.peer_checker_id');

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
    expect(params).toEqual([
      7,
      7,
      MY_WORK_CHAPTER_STATUSES.NOT_STARTED,
      MY_WORK_CHAPTER_STATUSES.DRAFT,
      7,
      MY_WORK_CHAPTER_STATUSES.PEER_CHECK,
      7,
      7,
    ]);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.listAccess).toBe('assigned');
    expect(chapters[0]?.projectId).toBe(3);
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

  it('keeps a drafter peer_check row with a yellow pending cloud while the stage is queued', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        row({
          id: 30,
          status: 'peer_check',
          assigned_user_id: 7,
          peer_checker_id: null,
          recording_count: 4,
          pending_count: 0,
          has_pending_stage_advance: 1,
        }),
        row({
          id: 31,
          status: 'peer_check',
          assigned_user_id: 7,
          peer_checker_id: null,
          recording_count: 4,
          pending_count: 0,
          has_pending_stage_advance: 0,
        }),
      ],
    });

    const chapters = await getMyWorkChapters(7);

    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({
      id: 30,
      listAccess: 'assigned',
      assignmentStatus: 'peer_check',
      syncState: 'deviceOnly',
      hasPendingStageAdvance: true,
    });
    const sql = String(mockExecute.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('stage_advance_queue');
  });

  it('keeps the yellow cloud while a stage advance is pending, then filters the drafter peer_check chapter out when none is pending (#257)', async () => {
    const queuedRow = row({
      id: 40,
      status: 'peer_check',
      assigned_user_id: 7,
      peer_checker_id: null,
      recording_count: 4,
      pending_count: 0,
      has_pending_stage_advance: 1,
    });

    // Before the drain: queue row pending -> chapter stays with a yellow cloud.
    mockExecute.mockResolvedValueOnce({ rows: [queuedRow] });
    const beforeDrain = await getMyWorkChapters(7);
    expect(beforeDrain).toHaveLength(1);
    expect(beforeDrain[0]).toMatchObject({
      id: 40,
      syncState: 'deviceOnly',
      hasPendingStageAdvance: true,
    });

    // After the server confirms: queue row deleted, same peer_check row with
    // no pending advance -> drafter is not the peer checker, so it leaves.
    mockExecute.mockResolvedValueOnce({
      rows: [{ ...queuedRow, has_pending_stage_advance: 0 }],
    });
    const afterDrain = await getMyWorkChapters(7);
    expect(afterDrain).toEqual([]);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });
});
