import type { DB } from '@op-engineering/op-sqlite';
import { createRealSqliteDb } from '../test/realSqlite';
import { runMigrations } from '../db/migrations';
import { insertChapterAssignmentSyncData } from '../db/repository';
import { confirmStageAdvancement } from './stageAdvance';
import { FluentAPI } from './api';
import { authToken } from './authToken';
import { getChapterAssignmentPullRevision } from '../utils/chapterCompletionSyncGuard';

let mockDb: DB;
jest.mock('../db/db', () => ({ getDatabase: () => mockDb }));
jest.mock('./api', () => ({
  FluentAPI: {
    getChapterAssignment: jest.fn(),
    submitChapterAssignment: jest.fn(),
  },
}));

const assignment = {
  chapterAssignmentId: 7,
  projectId: 100,
  projectUnitId: 580,
  bibleId: 1,
  bookId: 1,
  chapterNumber: 1,
  chapterStatus: 'consultant_check',
  updatedAt: '2026-10-26T00:00:00.000Z',
};

describe('confirmed Complete and assignment ingestion', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    authToken.set('initiating-account');
    mockDb = createRealSqliteDb();
    await runMigrations(mockDb);
    await mockDb.execute(`
      INSERT INTO languages (id, lang_name, script_direction) VALUES (1, 'English', 'ltr');
      INSERT INTO books (id, code, eng_display_name) VALUES (1, 'GEN', 'Genesis');
      INSERT INTO bibles (id, language_id, name, abbreviation) VALUES (1, 1, 'Test Bible', 'TST');
      INSERT INTO projects (id, name, source_language_id, target_language_id, is_active, status, updated_at)
        VALUES (100, 'Project', 1, 1, 1, 'not_assigned', '2026-10-26');
      INSERT INTO project_units (id, project_id, status, name) VALUES (580, 100, 'not_started', 'Milestone');
    `);
    await insertChapterAssignmentSyncData([assignment]);
    jest
      .mocked(FluentAPI.getChapterAssignment)
      .mockResolvedValueOnce({ ...assignment, status: 'consultant_check' })
      .mockResolvedValueOnce({ ...assignment, status: 'complete' });
    jest.mocked(FluentAPI.submitChapterAssignment).mockResolvedValue(null);
  });

  afterEach(async () => {
    await mockDb.close();
    authToken.set(null);
  });

  it('ignores an older in-flight pull finishing last, but accepts a later intentional server reversion', async () => {
    const oldPullRevision = getChapterAssignmentPullRevision();
    let finishOldPull!: () => void;
    const oldPull = new Promise<void>(resolve => {
      finishOldPull = resolve;
    }).then(() =>
      insertChapterAssignmentSyncData([assignment], oldPullRevision),
    );

    await confirmStageAdvancement({
      chapterAssignmentId: 7,
      destination: {
        nextStatus: 'complete',
        buttonLabel: 'Send to Complete',
        destinationLabel: 'Complete',
      },
    });
    finishOldPull();
    await oldPull;
    expect(
      (
        await mockDb.execute(
          'SELECT status FROM chapter_assignments WHERE id = 7',
        )
      ).rows[0],
    ).toEqual({ status: 'complete' });

    await insertChapterAssignmentSyncData(
      [assignment],
      getChapterAssignmentPullRevision(),
    );
    expect(
      (
        await mockDb.execute(
          'SELECT status FROM chapter_assignments WHERE id = 7',
        )
      ).rows[0],
    ).toEqual({ status: 'consultant_check' });
  });
});
