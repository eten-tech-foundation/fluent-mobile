import {
  deleteRecordingById,
  insertRecording,
  type InsertRecordingInput,
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

jest.mock('./db', () => {
  return {
    getDatabase: () => mockDb,
  };
});

function makeDb(existingMaxTake: number): MockDb {
  mockTx = {
    execute: jest.fn().mockImplementation((sql: string) => {
      if (/MAX\(take_number\)/.test(sql)) {
        return Promise.resolve({ rows: [{ max_take: existingMaxTake }] });
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

describe('insertRecording', () => {
  const baseInput: InsertRecordingInput = {
    id: 'rec-1',
    bibleTextId: 42,
    localFilePath: '/tmp/rec-1.m4a',
    durationMs: 12000,
    fileSizeBytes: 24000,
    createdAt: '2026-07-01T00:00:00.000Z',
  };

  it('demotes prior latest rows and inserts the new take as latest', async () => {
    mockDb = makeDb(0);

    const rec = await insertRecording(baseInput);

    expect(rec.takeNumber).toBe(1);
    expect(rec.isLatest).toBe(true);
    expect(rec.syncStatus).toBe('pending');

    const executeCalls = mockTx.execute.mock.calls.map(
      ([sql]) => sql as string,
    );
    expect(executeCalls[0]).toMatch(/MAX\(take_number\)/);
    expect(executeCalls[1]).toMatch(/UPDATE recordings SET is_latest = 0/);
    expect(executeCalls[2]).toMatch(/INSERT INTO recordings/);

    const insertParams = mockTx.execute.mock.calls[2]?.[1] as unknown[];
    expect(insertParams).toEqual([
      'rec-1',
      42,
      '/tmp/rec-1.m4a',
      12000,
      24000,
      1,
      'pending',
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    ]);
  });

  it('increments take_number when prior takes exist', async () => {
    mockDb = makeDb(3);

    const rec = await insertRecording({ ...baseInput, id: 'rec-2' });

    expect(rec.takeNumber).toBe(4);
    const insertParams = mockTx.execute.mock.calls[2]?.[1] as unknown[];
    expect(insertParams?.[5]).toBe(4);
  });

  it('accepts a custom sync status', async () => {
    mockDb = makeDb(0);

    const rec = await insertRecording({ ...baseInput, syncStatus: 'error' });

    expect(rec.syncStatus).toBe('error');
    const insertParams = mockTx.execute.mock.calls[2]?.[1] as unknown[];
    expect(insertParams?.[6]).toBe('error');
  });
});

describe('deleteRecordingById', () => {
  it('runs a DELETE query with the provided id', async () => {
    mockDb = makeDb(0);

    await deleteRecordingById('rec-9');

    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM recordings WHERE id = \?/),
      ['rec-9'],
    );
  });
});
