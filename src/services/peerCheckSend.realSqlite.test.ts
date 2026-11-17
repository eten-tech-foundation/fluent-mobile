import type { DB } from '@op-engineering/op-sqlite';
import { createRealSqliteDb } from '../test/realSqlite';
import { runMigrations } from '../db/migrations';
import { insertChapterAssignmentSyncData } from '../db/repository';
import * as queries from '../db/queries';
import { hasPendingStageAdvance } from '../db/queries';
import { ApiError } from '../types/api/errors';
import { FluentAPI } from './api';
import { authToken } from './authToken';
import {
  PeerCheckSendBlockedError,
  readPeerCheckSend,
  sendChapterToPeerCheck,
} from './peerCheckSend';
import { __resetStageAdvanceSyncForTests } from './stageAdvanceSync';
import { syncPendingStageAdvancesForUser } from './sync';

let mockDb: DB;
let mockActiveUser = '4';
let mockOnline = true;
jest.mock('../db/db', () => ({ getDatabase: () => mockDb }));
jest.mock('./storage', () => ({
  getActiveUserId: () => mockActiveUser,
  getUserIdSync: () => mockActiveUser,
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));
jest.mock('./connectivity', () => ({
  ...jest.requireActual('./connectivity'),
  getConnectivitySnapshot: async () => ({
    isOnline: mockOnline,
    isWifi: mockOnline,
    connectionType: mockOnline ? 'wifi' : 'none',
  }),
}));
jest.mock('./api', () => ({
  FluentAPI: {
    getChapterAssignment: jest.fn(),
    submitChapterAssignment: jest.fn(),
  },
}));
const mockCredentials = jest.fn(async (_userId: string) => ({
  token: 'drafter-token',
}));
jest.mock('./keychain', () => ({
  getCredentials: (userId: string) => mockCredentials(userId),
}));
jest.mock('./recordingDataEvents', () => ({
  emitRecordingDataChanged: jest.fn(),
}));

const mockGet = jest.mocked(FluentAPI.getChapterAssignment);
const mockSubmit = jest.mocked(FluentAPI.submitChapterAssignment);

const assignment = {
  id: 7,
  chapterAssignmentId: 7,
  projectId: 100,
  projectUnitId: 580,
  bibleId: 1,
  bookId: 1,
  chapterNumber: 1,
  status: 'draft',
  chapterStatus: 'draft',
  assignedUserId: 4,
  updatedAt: '2026-10-26T00:00:00.000Z',
};

const server = (stage: string) => ({
  ...assignment,
  status: stage,
  chapterStatus: stage,
});

const send = () =>
  sendChapterToPeerCheck({
    chapterAssignmentId: 7,
    userId: 4,
    draftingUnit: 'verse',
  });

async function status(): Promise<string> {
  const { rows } = await mockDb.execute(
    'SELECT status FROM chapter_assignments WHERE id = 7',
  );
  return String(rows[0]?.status);
}

async function queueRows(): Promise<number> {
  const { rows } = await mockDb.execute(
    'SELECT COUNT(*) AS n FROM stage_advance_queue',
  );
  return Number(rows[0]?.n);
}

async function record(verse: number, syncStatus = 'uploaded') {
  await mockDb.execute(
    `INSERT INTO recordings(id, bible_text_id, recorded_by_user_id, project_unit_id,
      local_file_path, is_selected, is_canonical, sync_status, granularity,
      start_chapter, start_verse, end_chapter, end_verse, created_at, updated_at)
     VALUES (?, ?, 4, 580, ?, 1, 0, ?, 'verse', 1, ?, 1, ?, '2026-01-01', '2026-01-01')`,
    [
      `v${verse}`,
      10 + verse,
      `file:///v${verse}.m4a`,
      syncStatus,
      verse,
      verse,
    ],
  );
}

describe('Send to Peer Check against real SQLite (#908)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockGet.mockReset();
    mockSubmit.mockReset();
    mockCredentials.mockImplementation(async () => ({
      token: 'drafter-token',
    }));
    __resetStageAdvanceSyncForTests();
    mockActiveUser = '4';
    mockOnline = true;
    authToken.set('session-token');
    mockDb = createRealSqliteDb();
    await runMigrations(mockDb);
    await mockDb.execute(`
      INSERT INTO users (id, email) VALUES (4, 'drafter@example.test'), (5, 'other@example.test');
      INSERT INTO languages (id, lang_name, script_direction) VALUES (1, 'English', 'ltr');
      INSERT INTO books (id, code, eng_display_name) VALUES (1, 'GEN', 'Genesis');
      INSERT INTO bibles (id, language_id, name, abbreviation) VALUES (1, 1, 'Test Bible', 'TST');
      INSERT INTO projects (id, name, source_language_id, target_language_id, is_active, status, updated_at)
        VALUES (100, 'Project', 1, 1, 1, 'not_assigned', '2026-10-26');
      INSERT INTO project_units (id, project_id, status, name) VALUES (580, 100, 'not_started', 'Milestone');
      INSERT INTO bible_texts (id, bible_id, book_id, chapter_number, verse_number, text)
        VALUES (11, 1, 1, 1, 1, 'In the beginning'), (12, 1, 1, 1, 2, 'And the earth');
    `);
    await insertChapterAssignmentSyncData([assignment]);
    await record(1);
    await record(2);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await mockDb.close();
    authToken.set(null);
  });

  it('queues offline as waiting to send, then reaches Peer Check on reconnect', async () => {
    mockOnline = false;

    await expect(send()).resolves.toBe('queued');
    expect(await status()).toBe('peer_check');
    expect(await hasPendingStageAdvance(7)).toBe(true);
    expect(mockSubmit).not.toHaveBeenCalled();

    mockOnline = true;
    mockGet.mockResolvedValue(server('draft'));
    mockSubmit.mockResolvedValue(server('peer_check'));
    await syncPendingStageAdvancesForUser(4, 'drafter-token');

    expect(mockSubmit).toHaveBeenCalledWith(7, 'drafter-token');
    expect(await hasPendingStageAdvance(7)).toBe(false);
    expect(await status()).toBe('peer_check');
  });

  it('comes back confirmed when the server takes it online', async () => {
    mockGet.mockResolvedValue(server('draft'));
    mockSubmit.mockResolvedValue(server('peer_check'));

    await expect(send()).resolves.toBe('confirmed');
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit).toHaveBeenCalledWith(7, 'drafter-token');
    expect(await queueRows()).toBe(0);
  });

  it('stays queued, not confirmed, when the server fails the send', async () => {
    mockGet.mockResolvedValue(server('draft'));
    mockSubmit.mockRejectedValue(new ApiError(500, 'boom'));

    await expect(send()).resolves.toBe('queued');
    expect(await hasPendingStageAdvance(7)).toBe(true);
  });

  it('reports a send the server kept at its stage', async () => {
    mockGet.mockResolvedValue(server('not_started'));

    await expect(send()).resolves.toBe('kept');
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(await queueRows()).toBe(0);
    expect(await status()).toBe('not_started');
  });

  it.each([
    [
      'an unrecorded verse',
      async () => {
        await mockDb.execute(`DELETE FROM recordings WHERE id = 'v2'`);
      },
    ],
    [
      'a conflict',
      async () => {
        await mockDb.execute(
          'UPDATE chapter_assignments SET has_conflict = 1 WHERE id = 7',
        );
      },
    ],
    [
      'a take that cannot upload',
      async () => {
        await mockDb.execute(
          `UPDATE recordings SET granularity = 'stitched', sync_status = 'pending' WHERE id = 'v2'`,
        );
        const check = await readPeerCheckSend({
          chapterAssignmentId: 7,
          userId: 4,
          draftingUnit: 'verse',
        });
        expect(check?.hasUnuploadableTakes).toBe(true);
      },
    ],
    [
      "another drafter's chapter",
      async () => {
        await mockDb.execute(
          'UPDATE chapter_assignments SET assigned_user_id = 5 WHERE id = 7',
        );
      },
    ],
    [
      'a chapter already past Draft',
      async () => {
        await mockDb.execute(
          `UPDATE chapter_assignments SET status = 'peer_check' WHERE id = 7`,
        );
      },
    ],
    [
      'another account now active',
      async () => {
        mockActiveUser = '5';
      },
    ],
  ])('refuses %s without writing', async (_name, arrange) => {
    await arrange();
    const before = await status();

    await expect(send()).rejects.toBeInstanceOf(PeerCheckSendBlockedError);
    expect(await status()).toBe(before);
    expect(await queueRows()).toBe(0);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('reads the gate the Record tab uses, disabling rather than hiding a conflict', async () => {
    await mockDb.execute(
      'UPDATE chapter_assignments SET has_conflict = 1 WHERE id = 7',
    );
    const check = await readPeerCheckSend({
      chapterAssignmentId: 7,
      userId: 4,
      draftingUnit: 'verse',
    });
    expect(check?.visibility).toMatchObject({ visible: true, disabled: true });
    expect(check?.hasConflict).toBe(true);
  });

  it("drains with the queue owner's own token", async () => {
    mockGet.mockResolvedValue(server('draft'));
    mockSubmit.mockResolvedValue(server('peer_check'));

    await send();
    expect(mockCredentials).toHaveBeenCalledWith('4');
    expect(mockSubmit).toHaveBeenCalledWith(7, 'drafter-token');
  });

  it('refuses without writing when the account changes during the check', async () => {
    const real = queries.getChapterAssignmentById;
    const spy = jest
      .spyOn(queries, 'getChapterAssignmentById')
      .mockImplementation(async id => {
        mockActiveUser = '5';
        return real(id);
      });

    await expect(send()).rejects.toBeInstanceOf(PeerCheckSendBlockedError);
    spy.mockRestore();
    expect(await status()).toBe('draft');
    expect(await queueRows()).toBe(0);
  });

  it('leaves the send queued, not drained, once another account is active', async () => {
    mockGet.mockResolvedValue(server('draft'));
    mockSubmit.mockResolvedValue(server('peer_check'));
    mockCredentials.mockImplementation(async () => {
      mockActiveUser = '5';
      return { token: 'drafter-token' };
    });

    await expect(send()).resolves.toBe('queued');
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(await hasPendingStageAdvance(7)).toBe(true);
  });

  it('reports a written send as queued when a follow-up read fails', async () => {
    mockOnline = false;
    const spy = jest
      .spyOn(queries, 'hasPendingStageAdvance')
      .mockRejectedValue(new Error('disk'));

    await expect(send()).resolves.toBe('queued');
    spy.mockRestore();
    expect(await status()).toBe('peer_check');
    expect(await hasPendingStageAdvance(7)).toBe(true);
  });

  it("reports a written send as queued when the chapter can't be re-read", async () => {
    mockOnline = false;
    const real = queries.getChapterAssignmentById;
    let reads = 0;
    const spy = jest
      .spyOn(queries, 'getChapterAssignmentById')
      .mockImplementation(async id => (++reads > 1 ? null : real(id)));
    const pending = jest
      .spyOn(queries, 'hasPendingStageAdvance')
      .mockResolvedValue(false);

    await expect(send()).resolves.toBe('queued');
    spy.mockRestore();
    pending.mockRestore();
    expect(await status()).toBe('peer_check');
  });

  describe('in pericope mode', () => {
    beforeEach(async () => {
      await mockDb.execute(`
        INSERT INTO pericope_sets (id, name) VALUES (1, 'Set');
        UPDATE projects SET pericope_set_id = 1 WHERE id = 100;
        INSERT INTO pericope_verses (pericope_set_id, book_id, chapter_number, verse_number, pericope_number)
          VALUES (1, 1, 1, 1, '1'), (1, 1, 1, 2, '1');
        DELETE FROM recordings;
        INSERT INTO recordings(id, bible_text_id, recorded_by_user_id, project_unit_id,
          local_file_path, is_selected, is_canonical, sync_status, granularity,
          start_chapter, start_verse, end_chapter, end_verse, created_at, updated_at)
        VALUES ('p1', 11, 4, 580, 'file:///p1.m4a', 1, 0, 'uploaded', 'pericope',
          1, 1, 1, 2, '2026-01-01', '2026-01-01');
      `);
    });
    const check = (draftingUnit: 'verse' | 'pericope') =>
      readPeerCheckSend({ chapterAssignmentId: 7, userId: 4, draftingUnit });

    it('offers Send once every pericope has a take', async () => {
      expect((await check('pericope'))?.visibility).toMatchObject({
        visible: true,
        disabled: false,
      });
      // The same takes don't record every verse on their own.
      expect(await check('verse')).toBeNull();
    });

    it('hides Send while a pericope has no take', async () => {
      await mockDb.execute('DELETE FROM recordings');
      expect(await check('pericope')).toBeNull();
    });
  });
});
