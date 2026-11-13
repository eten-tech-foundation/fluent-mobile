/**
 * Activation upload state machine through the real worker and real SQLite
 * persistence (#886). The fake server applies fluent-api `main` verse-audio
 * semantics for single-verse uploads: content-hash dedupe per unit, a stale
 * precondition on duplicate bytes is a 200 no-op, a stale precondition on new
 * bytes keeps both takes and flags a conflict, and a missing precondition
 * replaces the active take.
 */
import type { DB } from '@op-engineering/op-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { createRealSqliteDb } from '../test/realSqlite';
import { resetFileSystemMock } from '../test/mocks/expo-file-system';
import { runMigrations } from '../db/migrations';
import { selectRecordingTake } from '../db/recordingsRepository';
import { ApiError } from '../types/api/errors';
import { Sha256 } from './fileSha256';
import type {
  VerseAudioResponse,
  VerseAudioTakeResponse,
} from '../types/api/verseAudio';
import {
  __resetRecordingSyncForTests,
  ACTIVATION_OTHER_TAKE_ACTIVE_MESSAGE,
  drainPendingRecordingDeletions,
  syncPendingRecordings,
} from './recordingSync';
import {
  chooseLocalTakeAfterUnresolvedActivation,
  clearUploadOperation,
  readUploadOperation,
} from './uploadOperationState';

let mockDb: DB;
const mockKv = new Map<string, string>();
/** Keys whose next KV read throws once (unreadable storage, not absence). */
const mockKvReadFailures = new Set<string>();
let mockActiveUserId = '7';
const mockCredentials = new Map<string, { token: string }>();

jest.mock('../db/db', () => ({ getDatabase: () => mockDb }));
jest.mock('./storage', () => ({
  getActiveUserId: () => mockActiveUserId,
  setReauthRequired: jest.fn(),
  kvStorage: {
    getItemSync: (key: string) => {
      if (mockKvReadFailures.delete(key)) {
        throw new Error('KV read failed');
      }
      return mockKv.get(key) ?? null;
    },
    setItemSync: (key: string, value: string) => {
      mockKv.set(key, value);
    },
    removeItemSync: (key: string) => {
      mockKv.delete(key);
    },
  },
}));
jest.mock('./keychain', () => ({
  getCredentials: async (userId: string) => mockCredentials.get(userId) ?? null,
  getCredentialsVersion: () => 0,
}));
// Membership refresh is exercised in projectMembership.test.ts; these activation
// passes must reach the worker under test (#848).
jest.mock('./projectMembership', () => ({
  refreshProjectMembership: async () => undefined,
}));
jest.mock('./recordingDataEvents', () => ({
  emitRecordingDataChanged: jest.fn(),
}));
jest.mock('./syncEvents', () => ({
  emitUploadSessionEvent: jest.fn(),
  emitAuthReauthRequired: jest.fn(),
  onSyncComplete: jest.fn(),
}));
jest.mock('./uploadOrchestrator', () => ({
  setChapterUploadWorker: jest.fn(),
}));

function hashOf(content: string): string {
  // Fixtures are ASCII, so char codes are the stored bytes.
  return new Sha256()
    .update(Uint8Array.from(content, char => char.charCodeAt(0)))
    .digestHex();
}
type ServerTake = { id: number; hash: string; uploadedBy: number };
type ServerUnit = {
  versionToken: number;
  activeTakeId: number;
  conflictStatus: 'clean' | 'conflict';
  takes: ServerTake[];
};
type PutRecord = {
  token: string;
  hash: string;
  baseVersionToken?: number;
  activate: boolean;
};

/** Single unit (projectUnitId 12, bibleTextId 42) fake of fluent-api main. */
class FakeVerseAudioServer {
  unit: ServerUnit | null = null;
  puts: PutRecord[] = [];
  gets: { token: string }[] = [];
  deletes: number[] = [];
  private nextTakeId = 100;
  /** Apply the next PUT, then lose its response. */
  loseNextAck = false;
  /** Reject the next PUT with 409 + currentVersionToken without applying. */
  rejectNextWith409 = false;
  /** Reject every PUT with 409 (a server that never conflict-200s). */
  alwaysReject409 = false;
  onGet: (() => Promise<void>) | null = null;

  seedOtherDeviceActiveTake(hash: string): number {
    const id = this.nextTakeId++;
    if (!this.unit) {
      this.unit = {
        versionToken: 1,
        activeTakeId: id,
        conflictStatus: 'clean',
        takes: [{ id, hash, uploadedBy: 99 }],
      };
    } else {
      this.unit.takes.push({ id, hash, uploadedBy: 99 });
      this.unit.activeTakeId = id;
      this.unit.versionToken += 1;
    }
    return id;
  }

  async put(params: {
    file: { uri: string };
    baseVersionToken?: number;
    activate?: boolean;
    token: string;
  }): Promise<VerseAudioResponse> {
    const hash = hashOf(await FileSystem.readAsStringAsync(params.file.uri));
    const activate = params.activate !== false;
    this.puts.push({
      token: params.token,
      hash,
      activate,
      ...(params.baseVersionToken !== undefined
        ? { baseVersionToken: params.baseVersionToken }
        : {}),
    });
    if (this.rejectNextWith409 || this.alwaysReject409) {
      this.rejectNextWith409 = false;
      throw new ApiError(409, 'Version conflict', 'VERSION_CONFLICT', {
        currentVersionToken: this.unit?.versionToken ?? 1,
      });
    }
    const takeId = this.apply(hash, params.baseVersionToken, activate);
    if (this.loseNextAck) {
      this.loseNextAck = false;
      throw new ApiError(0, 'Network request failed');
    }
    return this.response(takeId);
  }

  private apply(
    hash: string,
    base: number | undefined,
    activate: boolean,
  ): number {
    if (!this.unit) {
      const id = this.nextTakeId++;
      this.unit = {
        versionToken: 1,
        activeTakeId: id,
        conflictStatus: 'clean',
        takes: [{ id, hash, uploadedBy: 7 }],
      };
      return id;
    }
    const unit = this.unit;
    const fresh = base === undefined || base === unit.versionToken;
    const duplicate = unit.takes.find(t => t.hash === hash);
    if (duplicate) {
      if (!activate || unit.activeTakeId === duplicate.id) return duplicate.id;
      if (fresh) {
        unit.activeTakeId = duplicate.id;
        unit.versionToken += 1;
      }
      return duplicate.id;
    }
    const id = this.nextTakeId++;
    unit.takes.push({ id, hash, uploadedBy: 7 });
    if (!activate) return id;
    if (fresh) {
      unit.activeTakeId = id;
    } else {
      unit.conflictStatus = 'conflict';
    }
    unit.versionToken += 1;
    return id;
  }

  async get(token: string): Promise<VerseAudioResponse> {
    this.gets.push({ token });
    if (this.onGet) {
      const hook = this.onGet;
      this.onGet = null;
      await hook();
    }
    if (!this.unit) throw new ApiError(404, 'Verse audio not found');
    return this.response(undefined);
  }

  response(takeId: number | undefined): VerseAudioResponse {
    const unit = this.unit as ServerUnit;
    const take = (t: ServerTake): VerseAudioTakeResponse => ({
      id: t.id,
      uploadedBy: t.uploadedBy,
      contentType: 'audio/mp4',
      sizeBytes: 10,
      durationSeconds: 1,
      contentHash: t.hash,
      downloadUrl: `https://example.test/${t.id}`,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    return {
      id: 1,
      projectUnitId: 12,
      bibleTextId: 42,
      uploadedBy: 7,
      contentType: 'audio/mp4',
      sizeBytes: 10,
      durationSeconds: 1,
      versionToken: unit.versionToken,
      conflictStatus: unit.conflictStatus,
      activeTakeId: unit.activeTakeId,
      ...(takeId !== undefined ? { takeId } : {}),
      verseNumber: 1,
      downloadUrl: `https://example.test/${unit.activeTakeId}`,
      takes: unit.takes.map(take),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }
}

let mockServer: FakeVerseAudioServer;
jest.mock('./api', () => ({
  FluentAPI: {
    uploadVerseAudio: (
      params: { file: { uri: string }; baseVersionToken?: number },
      token: string,
    ) => mockServer.put({ ...params, token }),
    getVerseAudioUnit: (_params: unknown, token: string) =>
      mockServer.get(token),
    deleteVerseAudioTake: async (params: { takeId: number }) => {
      mockServer.deletes.push(params.takeId);
      return { versionToken: (mockServer.unit?.versionToken ?? 0) + 1 };
    },
  },
}));

const MINE = 'file:///recordings/mine.m4a';
const MINE_AUDIO = 'mine-audio-bytes';
const OTHER_DEVICE_HASH = hashOf('other-device-audio');
const delay = async (): Promise<void> => undefined;

async function row(id = 'mine'): Promise<Record<string, unknown>> {
  return (await mockDb.execute('SELECT * FROM recordings WHERE id = ?', [id]))
    .rows[0] as Record<string, unknown>;
}

/** New module state, same SQLite + KV: an app process restart. */
function restartProcess(): void {
  __resetRecordingSyncForTests();
}

async function pass() {
  return syncPendingRecordings('pass-token', { delay }).catch(
    (error: unknown) => error,
  );
}

describe('activation upload reconciliation (real worker + SQLite, #886)', () => {
  beforeEach(async () => {
    mockServer = new FakeVerseAudioServer();
    mockKv.clear();
    mockKvReadFailures.clear();
    mockCredentials.clear();
    mockActiveUserId = '7';
    __resetRecordingSyncForTests();
    resetFileSystemMock();
    await FileSystem.writeAsStringAsync(MINE, MINE_AUDIO);
    await FileSystem.writeAsStringAsync(
      'file:///recordings/alt.m4a',
      'alt-audio',
    );
    mockDb = createRealSqliteDb();
    await runMigrations(mockDb);
    await mockDb.execute(`
      INSERT INTO users(id, email) VALUES (7, 'fixture@example.test');
      INSERT INTO languages(id, lang_name, script_direction) VALUES (1, 'Fixture', 'ltr');
      INSERT INTO books(id, code, eng_display_name) VALUES (40, 'MAT', 'Matthew');
      INSERT INTO bibles(id, language_id, name, abbreviation) VALUES (1, 1, 'Fixture', 'FIX');
      INSERT INTO projects(id, name, source_language_id, target_language_id, is_active, status, updated_at)
        VALUES (1, 'Fixture', 1, 1, 1, 'not_assigned', '2026-01-01');
      INSERT INTO user_projects(user_id, project_id) VALUES (7, 1);
      INSERT INTO project_units(id, project_id, status, name) VALUES (12, 1, 'not_started', '');
      INSERT INTO bible_texts(id, bible_id, book_id, chapter_number, verse_number, text)
        VALUES (42, 1, 40, 1, 1, 'Fixture');
      INSERT INTO recordings(id, bible_text_id, recorded_by_user_id, project_unit_id,
        local_file_path, is_selected, sync_status, start_chapter, start_verse,
        end_chapter, end_verse, created_at, updated_at)
        VALUES ('mine', 42, 7, 12, '${MINE}', 1, 'pending', 1, 1, 1, 1,
          '2026-01-01', '2026-01-01');
    `);
  });

  afterEach(async () => {
    await mockDb.close();
  });

  /** Existing unit at token 1 that this device already knows about. */
  async function seedKnownUnit(): Promise<number> {
    const otherId = mockServer.seedOtherDeviceActiveTake(OTHER_DEVICE_HASH);
    await mockDb.execute(
      'UPDATE recordings SET version_token = 1 WHERE id = ?',
      ['mine'],
    );
    return otherId;
  }

  it('lost ack, restart, then another device selects a newer take: no replay, recording kept, needs attention', async () => {
    await seedKnownUnit();
    mockServer.loseNextAck = true;
    // One attempt per pass so the lost ack ends the pass.
    const first = await syncPendingRecordings('pass-token', {
      delay,
      maxAttempts: 1,
    }).catch((error: unknown) => error);
    expect(first).toMatchObject({ name: 'UploadNetworkInterruptedError' });
    const mineTakeId = mockServer.unit?.activeTakeId;
    expect(readUploadOperation('mine', 0)).toMatchObject({
      phase: 'dispatched',
      baseVersionToken: 1,
    });

    restartProcess();
    const newerId = mockServer.seedOtherDeviceActiveTake(hashOf('newer'));
    await pass();

    expect(mockServer.puts).toHaveLength(1);
    expect(mockServer.gets).toHaveLength(1);
    expect(mockServer.unit).toMatchObject({ activeTakeId: newerId });
    expect(mockServer.unit?.takes.map(t => t.id)).toContain(mineTakeId);
    expect(await row()).toMatchObject({
      sync_status: 'failed',
      upload_error: ACTIVATION_OTHER_TAKE_ACTIVE_MESSAGE,
      local_file_path: MINE,
      is_selected: 1,
    });
    expect(await FileSystem.getInfoAsync(MINE)).toMatchObject({
      exists: true,
    });
    expect(readUploadOperation('mine', 0)).toMatchObject({
      phase: 'unresolved',
      serverTakeId: mineTakeId,
      observedVersionToken: mockServer.unit?.versionToken,
    });

    // Later passes, automatic (chapter) or manual, only re-check (GET).
    await syncPendingRecordings('pass-token', {
      delay,
      chapter: { bookId: 40, chapterNumber: 1 },
    }).catch((error: unknown) => error);
    expect(mockServer.gets).toHaveLength(2);
    await pass();
    expect(mockServer.gets).toHaveLength(3);
    expect(mockServer.puts).toHaveLength(1);
    expect(mockServer.unit).toMatchObject({ activeTakeId: newerId });
  });

  it('unreadable operation state after a lost ack: no blind PUT, the dispatched operation is kept, and the next readable pass reconciles', async () => {
    await seedKnownUnit();
    mockServer.loseNextAck = true;
    await syncPendingRecordings('pass-token', {
      delay,
      maxAttempts: 1,
    }).catch(() => undefined);
    const dispatched = mockKv.get('upload_op:mine');
    expect(readUploadOperation('mine', 0)).toMatchObject({
      phase: 'dispatched',
      baseVersionToken: 1,
    });

    // Another take in this unit moves the local token past the pinned one.
    await mockDb.execute(`
      INSERT INTO recordings(id, bible_text_id, recorded_by_user_id, project_unit_id,
        local_file_path, is_selected, sync_status, version_token, start_chapter,
        start_verse, end_chapter, end_verse, created_at, updated_at)
        VALUES ('alt', 42, 7, 12, 'file:///recordings/alt.m4a', 0, 'uploaded', 3,
          1, 1, 1, 1, '2026-01-01', '2026-01-01');
    `);
    restartProcess();
    mockKvReadFailures.add('upload_op:mine');
    await pass();

    expect(mockServer.puts).toHaveLength(1);
    expect(mockServer.puts[0]).toMatchObject({ baseVersionToken: 1 });
    expect(mockKv.get('upload_op:mine')).toBe(dispatched);
    expect(await row()).toMatchObject({
      sync_status: 'failed',
      upload_error: 'Could not read upload state on this device',
      local_file_path: MINE,
      is_selected: 1,
    });

    // A read failure never clears the operation it could not inspect.
    mockKvReadFailures.add('upload_op:mine');
    clearUploadOperation('mine', 0);
    expect(mockKv.get('upload_op:mine')).toBe(dispatched);

    // Readable again: the lost ack is reconciled under the pinned token.
    await pass();
    expect(mockServer.puts).toHaveLength(1);
    expect(mockServer.gets).toHaveLength(1);
    expect(await row()).toMatchObject({ sync_status: 'uploaded' });
  });

  it('stale 409 with currentVersionToken: never resubmits with the newer token', async () => {
    await seedKnownUnit();
    const newerId = mockServer.seedOtherDeviceActiveTake(hashOf('newer'));
    mockServer.rejectNextWith409 = true;

    await pass();

    // Every PUT carried the original precondition; the server kept the newer
    // selection and flagged a conflict rather than overwriting it.
    expect(mockServer.puts.map(p => p.baseVersionToken)).toEqual([1, 1]);
    expect(mockServer.unit).toMatchObject({
      activeTakeId: newerId,
      conflictStatus: 'conflict',
    });
    expect(await row()).toMatchObject({ sync_status: 'conflicted' });
  });

  it('repeated 409s after the unit moved stop after one replay and need attention', async () => {
    await seedKnownUnit();
    const newerId = mockServer.seedOtherDeviceActiveTake(hashOf('newer'));
    mockServer.alwaysReject409 = true;

    await pass();
    await pass();

    // First PUT, one reconciled replay, then no more PUTs.
    expect(mockServer.puts.map(p => p.baseVersionToken)).toEqual([1, 1]);
    expect(mockServer.unit).toMatchObject({ activeTakeId: newerId });
    expect(await row()).toMatchObject({
      sync_status: 'failed',
      upload_error: ACTIVATION_OTHER_TAKE_ACTIVE_MESSAGE,
    });
    expect(readUploadOperation('mine', 0)).toMatchObject({
      phase: 'unresolved',
      observedVersionToken: mockServer.unit?.versionToken,
    });
  });

  it('a 200 returning the matched non-active take is not reported as an activation', async () => {
    await seedKnownUnit();
    // This device's bytes reached the server earlier as a stored-only take.
    await mockServer.put({
      file: { uri: MINE },
      activate: false,
      token: 'earlier',
    });
    const storedId = mockServer.unit?.takes.at(-1)?.id;
    const newerId = mockServer.seedOtherDeviceActiveTake(hashOf('newer'));
    mockServer.puts = [];

    await pass();

    // Stale precondition on duplicate bytes: server 200 no-op.
    expect(mockServer.puts).toHaveLength(1);
    expect(mockServer.unit).toMatchObject({ activeTakeId: newerId });
    expect(await row()).toMatchObject({
      sync_status: 'failed',
      upload_error: ACTIVATION_OTHER_TAKE_ACTIVE_MESSAGE,
      blob_key: null,
    });
    expect(readUploadOperation('mine', 0)).toMatchObject({
      phase: 'unresolved',
      serverTakeId: storedId,
    });
  });

  it('exact matching take already active after a lost ack: reconciles locally without a replay', async () => {
    await seedKnownUnit();
    mockServer.loseNextAck = true;

    await pass();

    expect(mockServer.puts).toHaveLength(1);
    expect(mockServer.gets).toHaveLength(1);
    const activeId = mockServer.unit?.activeTakeId;
    expect(mockServer.unit?.takes.find(t => t.id === activeId)?.hash).toBe(
      hashOf(MINE_AUDIO),
    );
    expect(await row()).toMatchObject({
      sync_status: 'uploaded',
      server_take_id: activeId,
      version_token: mockServer.unit?.versionToken,
    });
    expect(readUploadOperation('mine')).toBeNull();
  });

  it('explicit user reselection after reconciliation creates a new generation with a fresh precondition', async () => {
    await seedKnownUnit();
    mockServer.loseNextAck = true;
    await syncPendingRecordings('pass-token', {
      delay,
      maxAttempts: 1,
    }).catch(() => undefined);
    const mineTakeId = mockServer.unit?.activeTakeId;
    mockServer.seedOtherDeviceActiveTake(hashOf('newer'));
    await pass();
    expect(await row()).toMatchObject({ sync_status: 'failed' });
    const observed = mockServer.unit?.versionToken;

    await expect(
      chooseLocalTakeAfterUnresolvedActivation('mine'),
    ).resolves.toBe(true);
    expect(await row()).toMatchObject({
      sync_status: 'pending',
      upload_intent_version: 1,
      version_token: observed,
    });

    await pass();

    expect(mockServer.puts.at(-1)).toMatchObject({
      baseVersionToken: observed,
      activate: true,
    });
    expect(mockServer.unit).toMatchObject({
      activeTakeId: mineTakeId,
      conflictStatus: 'clean',
    });
    expect(await row()).toMatchObject({
      sync_status: 'uploaded',
      server_take_id: mineTakeId,
    });
  });

  it('local intent change while reconciliation is pending is not consumed by the old operation', async () => {
    await mockDb.execute(`
      INSERT INTO recordings(id, bible_text_id, recorded_by_user_id, project_unit_id,
        local_file_path, is_selected, sync_status, start_chapter, start_verse,
        end_chapter, end_verse, created_at, updated_at)
        VALUES ('alt', 42, 7, 12, 'file:///recordings/alt.m4a', 0, 'uploaded',
          1, 1, 1, 1, '2026-01-01', '2026-01-01');
    `);
    mockServer.loseNextAck = true;
    await syncPendingRecordings('pass-token', {
      delay,
      maxAttempts: 1,
    }).catch(() => undefined);
    expect(readUploadOperation('mine', 0)).toMatchObject({
      phase: 'dispatched',
    });

    // The user picks the other take while the reconcile GET is in flight.
    mockServer.onGet = () => selectRecordingTake('alt');
    await syncPendingRecordings('pass-token', {
      delay,
      maxAttempts: 1,
    }).catch(() => undefined);

    const mine = await row('mine');
    expect(mine).toMatchObject({
      is_selected: 0,
      upload_intent_version: 1,
    });
    expect(mine.sync_status).not.toBe('uploaded');
    expect(await row('alt')).toMatchObject({
      is_selected: 1,
      sync_status: 'pending',
    });
  });

  it('account switch: reconciliation and replay use the owner token and the persisted precondition', async () => {
    await seedKnownUnit();
    mockCredentials.set('7', { token: 'owner-7' });
    mockServer.loseNextAck = true;
    await syncPendingRecordings('pass-token', {
      delay,
      maxAttempts: 1,
    }).catch(() => undefined);

    restartProcess();
    mockActiveUserId = '8';
    await pass();

    expect(mockServer.puts.map(p => p.token)).toEqual(['owner-7']);
    expect(mockServer.gets.map(g => g.token)).toEqual(['owner-7']);
    expect(await row()).toMatchObject({ sync_status: 'uploaded' });
  });

  it('control: stored-only uploads keep their retry behaviour without reconciliation', async () => {
    await mockDb.execute('UPDATE recordings SET is_selected = 0 WHERE id = ?', [
      'mine',
    ]);
    await seedKnownUnit();
    mockServer.loseNextAck = true;

    await pass();

    expect(mockServer.gets).toHaveLength(0);
    expect(mockServer.puts).toHaveLength(2);
    expect(mockServer.puts.every(p => !p.activate)).toBe(true);
    expect(await row()).toMatchObject({ sync_status: 'uploaded' });
    expect(readUploadOperation('mine')).toBeNull();
  });

  it('control: take deletion is unaffected by activation reconciliation', async () => {
    await mockDb.execute(`
      INSERT INTO recording_deletions(id, project_unit_id, bible_text_id,
        server_take_id, recorded_by_user_id, created_at)
        VALUES ('del-1', 12, 42, 55, 7, '2026-01-01');
    `);

    const result = await drainPendingRecordingDeletions('pass-token');

    expect(result).toMatchObject({ attempted: 1, deleted: 1, failed: 0 });
    expect(mockServer.deletes).toEqual([55]);
    expect(mockServer.gets).toHaveLength(0);
    expect(mockServer.puts).toHaveLength(0);
  });
});
