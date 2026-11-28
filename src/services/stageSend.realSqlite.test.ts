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
  StageSendBlockedError,
  readStageSend,
  sendChapterToStage,
} from './stageSend';
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
let mockTranslatorProjects: number[] = [100];
jest.mock('../utils/myWorkDraftDownload', () => ({
  getTranslatorProjectIds: () => mockTranslatorProjects,
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
  sendChapterToStage({
    chapterAssignmentId: 7,
    userId: 4,
    draftingUnit: 'verse',
    to: 'peer_check',
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

describe('Stage send against real SQLite (#908, #909)', () => {
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
    mockTranslatorProjects = [100];
    authToken.set('session-token');
    mockDb = createRealSqliteDb();
    await runMigrations(mockDb);
    await mockDb.execute(`
      INSERT INTO users (id, email) VALUES (4, 'drafter@example.test'), (5, 'other@example.test'), (6, 'checker@example.test');
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
        const check = await readStageSend({
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

    await expect(send()).rejects.toBeInstanceOf(StageSendBlockedError);
    expect(await status()).toBe(before);
    expect(await queueRows()).toBe(0);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('reads the stage gate, disabling rather than hiding a conflict', async () => {
    await mockDb.execute(
      'UPDATE chapter_assignments SET has_conflict = 1 WHERE id = 7',
    );
    const check = await readStageSend({
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

    await expect(send()).rejects.toBeInstanceOf(StageSendBlockedError);
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
      readStageSend({ chapterAssignmentId: 7, userId: 4, draftingUnit });

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

  describe('after Drafting (#909)', () => {
    async function atStage(stage: string, peerCheckerId: number | null = null) {
      await mockDb.execute(
        'UPDATE chapter_assignments SET status = ?, peer_checker_id = ? WHERE id = 7',
        [stage, peerCheckerId],
      );
    }
    const sendAs = (userId: number, to: string) => {
      mockActiveUser = String(userId);
      return sendChapterToStage({
        chapterAssignmentId: 7,
        userId,
        draftingUnit: 'verse',
        to: to as Parameters<typeof sendChapterToStage>[0]['to'],
      });
    };
    const offered = async (userId: number) =>
      (
        await readStageSend({
          chapterAssignmentId: 7,
          userId,
          draftingUnit: 'verse',
        })
      )?.visibility.destination?.nextStatus ?? null;
    async function queued() {
      const { rows } = await mockDb.execute(
        'SELECT to_status, peer_checker_id, user_id FROM stage_advance_queue',
      );
      return rows.map(r => ({
        to: r.to_status,
        peerCheckerId: r.peer_checker_id,
        userId: r.user_id,
      }));
    }
    async function peerChecker() {
      const { rows } = await mockDb.execute(
        'SELECT peer_checker_id FROM chapter_assignments WHERE id = 7',
      );
      return rows[0]?.peer_checker_id ?? null;
    }

    it.each([
      // [stage, peer checker, user, offered next stage]
      ['peer_check', null, 4, null],
      ['peer_check', null, 5, 'community_review'],
      ['peer_check', 6, 6, 'community_review'],
      ['peer_check', 6, 5, null],
      ['peer_check', 6, 4, null],
      ['community_review', 6, 5, 'linguist_check'],
      ['linguist_check', 6, 4, 'theological_check'],
      ['theological_check', 6, 5, 'consultant_check'],
      ['consultant_check', 6, 5, 'complete'],
      ['complete', 6, 5, null],
      ['complete', 6, 4, null],
    ])(
      'at %s with checker %s, user %s is offered %s',
      async (stage, checker, userId, next) => {
        await atStage(stage, checker);
        expect(await offered(userId)).toBe(next);
      },
    );

    it.each([
      // [peer checker, user, offered next stage] with no Translator grant
      [null, 5, null],
      [6, 6, 'community_review'],
    ])(
      'without a Translator grant, Peer Check with checker %s offers user %s %s',
      async (checker, userId, next) => {
        mockTranslatorProjects = [];
        await atStage('peer_check', checker);
        expect(await offered(userId)).toBe(next);
      },
    );

    it.each([
      [
        'the drafter on open Peer Check',
        'peer_check',
        null,
        4,
        'community_review',
      ],
      [
        "a peer on someone else's Peer Check",
        'peer_check',
        6,
        5,
        'community_review',
      ],
      ['anyone on a Complete chapter', 'complete', 6, 5, 'complete'],
      [
        'a peer without a Translator grant on open Peer Check',
        'peer_check',
        null,
        5,
        'community_review',
        [] as number[],
      ],
    ])(
      'refuses %s without writing',
      async (_name, stage, checker, userId, to, translatorProjects = [100]) => {
        mockTranslatorProjects = translatorProjects;
        await atStage(stage, checker);
        await expect(sendAs(userId, to)).rejects.toBeInstanceOf(
          StageSendBlockedError,
        );
        expect(await status()).toBe(stage);
        expect(await queueRows()).toBe(0);
        expect(mockGet).not.toHaveBeenCalled();
        expect(mockSubmit).not.toHaveBeenCalled();
      },
    );

    it('assigns the peer who advances open Peer Check', async () => {
      await atStage('peer_check');
      mockOnline = false;

      await expect(sendAs(5, 'community_review')).resolves.toBe('queued');
      expect(await status()).toBe('community_review');
      expect(await peerChecker()).toBe(5);
      expect(await queued()).toEqual([
        { to: 'community_review', peerCheckerId: 5, userId: 5 },
      ]);
    });

    it('keeps an assigned peer checker when they advance', async () => {
      await atStage('peer_check', 6);
      mockOnline = false;

      await expect(sendAs(6, 'community_review')).resolves.toBe('queued');
      expect(await peerChecker()).toBe(6);
      expect(await queued()).toEqual([
        { to: 'community_review', peerCheckerId: null, userId: 6 },
      ]);
    });

    it('queues a later stage offline, then reaches it on reconnect', async () => {
      await atStage('community_review', 6);
      mockOnline = false;

      await expect(sendAs(5, 'linguist_check')).resolves.toBe('queued');
      expect(await status()).toBe('linguist_check');
      expect(await hasPendingStageAdvance(7)).toBe(true);

      mockOnline = true;
      mockGet.mockResolvedValue(server('community_review'));
      mockSubmit.mockResolvedValue(server('linguist_check'));
      await syncPendingStageAdvancesForUser(5, 'drafter-token');
      expect(mockSubmit).toHaveBeenCalledTimes(1);
      expect(await hasPendingStageAdvance(7)).toBe(false);
      expect(await status()).toBe('linguist_check');
    });

    it('confirms a later stage the server takes online', async () => {
      await atStage('theological_check', 6);
      mockGet.mockResolvedValue(server('theological_check'));
      mockSubmit.mockResolvedValue(server('consultant_check'));

      await expect(sendAs(5, 'consultant_check')).resolves.toBe('confirmed');
      expect(await status()).toBe('consultant_check');
      expect(await queueRows()).toBe(0);
    });

    it('refuses, writing nothing, once the next stage is not the one confirmed', async () => {
      await atStage('linguist_check', 6);

      await expect(sendAs(5, 'linguist_check')).rejects.toBeInstanceOf(
        StageSendBlockedError,
      );
      expect(await status()).toBe('linguist_check');
      expect(await queueRows()).toBe(0);
    });

    describe('Complete', () => {
      beforeEach(async () => {
        await atStage('consultant_check', 6);
      });

      it('writes Complete only after the server confirms it', async () => {
        let serverRead!: (v: unknown) => void;
        mockGet.mockImplementationOnce(
          () => new Promise(r => (serverRead = r)) as never,
        );
        mockSubmit.mockResolvedValue(server('complete'));
        mockGet.mockResolvedValueOnce(server('complete'));

        const sent = sendAs(5, 'complete');
        await waitForCall(mockGet);
        expect(await status()).toBe('consultant_check');
        expect(mockSubmit).not.toHaveBeenCalled();

        serverRead(server('consultant_check'));
        await expect(sent).resolves.toBe('confirmed');
        expect(mockSubmit).toHaveBeenCalledWith(7, 'session-token');
        expect(await status()).toBe('complete');
        expect(await queueRows()).toBe(0);
      });

      it.each([
        [
          'offline',
          () =>
            mockGet.mockRejectedValue(new TypeError('Network request failed')),
        ],
        [
          'a timeout',
          () => mockGet.mockRejectedValue(new Error('Request timed out')),
        ],
        [
          'a rejection',
          () => {
            mockGet.mockResolvedValue(server('consultant_check'));
            mockSubmit.mockRejectedValue(new ApiError(403, 'forbidden'));
          },
        ],
        [
          'a readback that is not Complete',
          () => {
            mockGet.mockResolvedValue(server('consultant_check'));
            mockSubmit.mockResolvedValue(server('consultant_check'));
          },
        ],
        [
          "another chapter's response",
          () =>
            mockGet.mockResolvedValue({
              ...server('complete'),
              chapterAssignmentId: 8,
            }),
        ],
        [
          'a server at an earlier stage',
          () => mockGet.mockResolvedValue(server('theological_check')),
        ],
      ])('never writes Complete after %s', async (_name, arrange) => {
        arrange();

        await expect(sendAs(5, 'complete')).rejects.not.toBeInstanceOf(
          StageSendBlockedError,
        );
        expect(await status()).toBe('consultant_check');
        expect(await queueRows()).toBe(0);
      });

      it('reports a confirmed Complete as confirmed, never queued', async () => {
        mockGet.mockResolvedValue(server('complete'));
        const pending = jest
          .spyOn(queries, 'hasPendingStageAdvance')
          .mockRejectedValue(new Error('disk'));

        await expect(sendAs(5, 'complete')).resolves.toBe('confirmed');
        pending.mockRestore();
        expect(mockSubmit).not.toHaveBeenCalled();
        expect(await status()).toBe('complete');
      });

      it('refuses Complete, calling no server, once the account changed', async () => {
        mockActiveUser = '5';

        await expect(
          sendChapterToStage({
            chapterAssignmentId: 7,
            userId: 4,
            draftingUnit: 'verse',
            to: 'complete',
          }),
        ).rejects.toBeInstanceOf(StageSendBlockedError);
        expect(mockGet).not.toHaveBeenCalled();
        expect(await status()).toBe('consultant_check');
      });
    });
  });
});

async function waitForCall(fn: jest.Mock): Promise<void> {
  for (let i = 0; i < 50 && fn.mock.calls.length === 0; i++) {
    await new Promise<void>(r => setImmediate(r));
  }
  expect(fn).toHaveBeenCalled();
}
