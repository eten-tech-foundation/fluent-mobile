import {
  deleteRecordingById,
  upsertLatestRecordingForUser,
  type UpsertLatestRecordingInput,
} from './repository';

interface MockTx {
  execute: jest.Mock;
}

interface MockDb {
  execute: jest.Mock;
  transaction: jest.Mock<Promise<void>, [(tx: MockTx) => Promise<void>]>;
}

let mockDb: MockDb;
let mockTx: MockTx;

const mockDeleteRecordingFile = jest.fn();

jest.mock('./db', () => {
  return {
    getDatabase: () => mockDb,
  };
});

jest.mock('../services/recordingStorage', () => ({
  deleteRecordingFile: (pathOrKey: string) =>
    mockDeleteRecordingFile(pathOrKey),
}));

function makeDb(priorPaths: string[] = []): MockDb {
  mockTx = {
    execute: jest.fn().mockImplementation((sql: string) => {
      if (/SELECT local_file_path FROM recordings/.test(sql)) {
        return Promise.resolve({
          rows: priorPaths.map(local_file_path => ({ local_file_path })),
        });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
  return {
    execute: jest.fn().mockResolvedValue({ rows: [] }),
    transaction: jest.fn(async (cb: (t: MockTx) => Promise<void>) => {
      await cb(mockTx);
    }),
  };
}

describe('upsertLatestRecordingForUser', () => {
  const baseInput: UpsertLatestRecordingInput = {
    id: 'rec-1',
    bibleTextId: 42,
    userId: 'user-9',
    projectUnitId: 3,
    chapterAssignmentId: 7,
    localFilePath: 'recordings/uuser-9/p3/GEN/c001/v001/rec-1.aac',
    durationMs: 12000,
    fileSizeBytes: 24000,
    createdAt: '2026-07-01T00:00:00.000Z',
  };

  beforeEach(() => {
    mockDeleteRecordingFile.mockClear();
  });

  it('requires a non-empty userId', async () => {
    mockDb = makeDb();
    await expect(
      upsertLatestRecordingForUser({ ...baseInput, userId: '' }),
    ).rejects.toThrow(/userId/);
  });

  it('deletes the same user prior row and inserts the new take', async () => {
    mockDb = makeDb(['recordings/uuser-9/p3/GEN/c001/v001/old.aac']);

    const rec = await upsertLatestRecordingForUser(baseInput);

    expect(rec.takeNumber).toBe(1);
    expect(rec.isLatest).toBe(true);
    expect(rec.userId).toBe('user-9');
    expect(rec.projectUnitId).toBe(3);
    expect(rec.syncStatus).toBe('pending');

    const executeCalls = mockTx.execute.mock.calls.map(
      ([sql]) => sql as string,
    );
    expect(executeCalls[0]).toMatch(/SELECT local_file_path FROM recordings/);
    expect(executeCalls[1]).toMatch(
      /DELETE FROM recordings WHERE bible_text_id = \? AND user_id = \?/,
    );
    expect(executeCalls[2]).toMatch(/INSERT INTO recordings/);

    const deleteParams = mockTx.execute.mock.calls[1]?.[1] as unknown[];
    expect(deleteParams).toEqual([42, 'user-9']);

    expect(mockDeleteRecordingFile).toHaveBeenCalledWith(
      'recordings/uuser-9/p3/GEN/c001/v001/old.aac',
    );
  });

  it('does not unlink when replacing with the same path', async () => {
    mockDb = makeDb([baseInput.localFilePath]);

    await upsertLatestRecordingForUser(baseInput);

    expect(mockDeleteRecordingFile).not.toHaveBeenCalled();
  });

  it('accepts a custom sync status', async () => {
    mockDb = makeDb();

    const rec = await upsertLatestRecordingForUser({
      ...baseInput,
      syncStatus: 'error',
    });

    expect(rec.syncStatus).toBe('error');
  });

  it('scopes prior-row delete to the recording user only', async () => {
    mockDb = makeDb(['recordings/uuser-a/p3/GEN/c001/v001/old-a.aac']);

    await upsertLatestRecordingForUser({
      ...baseInput,
      id: 'rec-a',
      userId: 'user-a',
      localFilePath: 'recordings/uuser-a/p3/GEN/c001/v001/rec-a.aac',
    });

    const deleteParams = mockTx.execute.mock.calls[1]?.[1] as unknown[];
    expect(deleteParams).toEqual([42, 'user-a']);

    // A second user's upsert must not use user-a's id in the delete clause.
    mockDb = makeDb([]);
    await upsertLatestRecordingForUser({
      ...baseInput,
      id: 'rec-b',
      userId: 'user-b',
      localFilePath: 'recordings/uuser-b/p3/GEN/c001/v001/rec-b.aac',
    });
    const deleteParamsB = mockTx.execute.mock.calls[1]?.[1] as unknown[];
    expect(deleteParamsB).toEqual([42, 'user-b']);
  });
});

describe('deleteRecordingById', () => {
  beforeEach(() => {
    mockDeleteRecordingFile.mockClear();
  });

  it('runs a DELETE query and unlinks the stored file', async () => {
    mockDb = makeDb();
    mockDb.execute.mockResolvedValueOnce({
      rows: [{ local_file_path: 'recordings/uu/p1/GEN/c001/v001/rec-9.aac' }],
    });

    await deleteRecordingById('rec-9');

    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM recordings WHERE id = \?/),
      ['rec-9'],
    );
    expect(mockDeleteRecordingFile).toHaveBeenCalledWith(
      'recordings/uu/p1/GEN/c001/v001/rec-9.aac',
    );
  });

  it('skips unlink when no row is found', async () => {
    mockDb = makeDb();
    mockDb.execute.mockResolvedValueOnce({ rows: [] });

    await deleteRecordingById('missing');

    expect(mockDeleteRecordingFile).not.toHaveBeenCalled();
  });
});
