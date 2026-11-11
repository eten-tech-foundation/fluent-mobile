const mockKv = new Map<string, string>();
let mockFailWrites = false;
let mockFailReads = false;
let mockFailRemoves = false;

jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: (key: string) => {
      if (mockFailReads) throw new Error('kv unavailable');
      return mockKv.get(key) ?? null;
    },
    setItemSync: (key: string, value: string) => {
      if (mockFailWrites) throw new Error('kv unavailable');
      mockKv.set(key, value);
    },
    removeItemSync: (key: string) => {
      if (mockFailRemoves) throw new Error('kv unavailable');
      mockKv.delete(key);
    },
  })),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import {
  clearAllUploadReceipts,
  clearUploadReceipt,
  persistUploadReceipt,
  readUploadReceipt,
  readUploadReceiptServerTakeId,
  UNBOUND_UPLOAD_RECEIPT_KEY_PREFIX,
  uploadReceiptKey,
  type UploadReceipt,
} from './uploadReceipts';

const receipt: UploadReceipt = {
  recordingId: 'rec-1',
  uploadIntentVersion: 2,
  acceptedScope: {
    bibleTextId: 42,
    projectUnitId: 7,
    localFilePath: 'file:///rec-1.m4a',
    recordedByUserId: 5,
  },
  kind: 'uploaded',
  bibleTextId: 42,
  versionToken: 3,
  serverTakeId: 9,
  blobKey: 'verse-audio/1/2/3.m4a',
  acceptedAt: '2026-01-01T00:00:00.000Z',
};

describe('uploadReceipts (#886)', () => {
  beforeEach(() => {
    mockKv.clear();
    mockFailWrites = false;
    mockFailReads = false;
    mockFailRemoves = false;
  });

  it('round-trips an uploaded receipt', () => {
    expect(persistUploadReceipt(receipt)).toBe(true);
    expect(readUploadReceipt('rec-1')).toEqual(receipt);
  });

  it('round-trips a conflicted receipt without a blob key', () => {
    const { blobKey: _blobKey, ...rest } = receipt;
    const conflicted: UploadReceipt = {
      ...rest,
      kind: 'conflicted',
      serverTakeId: null,
    };
    persistUploadReceipt(conflicted);
    expect(readUploadReceipt('rec-1')).toEqual(conflicted);
  });

  it('returns false instead of throwing when the KV write fails', () => {
    mockFailWrites = true;
    expect(persistUploadReceipt(receipt)).toBe(false);
    expect(readUploadReceipt('rec-1')).toBeNull();
  });

  it('clears a receipt', () => {
    persistUploadReceipt(receipt);
    clearUploadReceipt('rec-1');
    expect(readUploadReceipt('rec-1')).toBeNull();
    expect(mockKv.has(uploadReceiptKey('rec-1'))).toBe(false);
  });

  it.each([
    ['not json', 'nope'],
    ['wrong recording id', JSON.stringify({ ...receipt, recordingId: 'x' })],
    ['unknown kind', JSON.stringify({ ...receipt, kind: 'maybe' })],
    [
      'non-numeric version token',
      JSON.stringify({ ...receipt, versionToken: '3' }),
    ],
    [
      'uploaded without blob key',
      JSON.stringify({ ...receipt, blobKey: undefined }),
    ],
    [
      'written before operation versions',
      JSON.stringify({ ...receipt, uploadIntentVersion: undefined }),
    ],
    [
      'without an accepted scope',
      JSON.stringify({ ...receipt, acceptedScope: undefined }),
    ],
    [
      'negative operation version',
      JSON.stringify({ ...receipt, uploadIntentVersion: -1 }),
    ],
  ])('never applies, but keeps, an unbound receipt (%s)', (_label, raw) => {
    mockKv.set(uploadReceiptKey('rec-1'), raw);
    expect(readUploadReceipt('rec-1')).toBeNull();
    expect(mockKv.has(uploadReceiptKey('rec-1'))).toBe(false);
    expect(mockKv.get(`${UNBOUND_UPLOAD_RECEIPT_KEY_PREFIX}rec-1`)).toBe(raw);
  });

  it('keeps the server take id of an unbound receipt for deletion recovery', () => {
    mockKv.set(
      uploadReceiptKey('rec-1'),
      JSON.stringify({ ...receipt, uploadIntentVersion: undefined }),
    );
    expect(readUploadReceiptServerTakeId('rec-1')).toBe(9);
    expect(readUploadReceiptServerTakeId('rec-2')).toBeNull();
    clearAllUploadReceipts('rec-1');
    expect(readUploadReceiptServerTakeId('rec-1')).toBeNull();
    expect([...mockKv.keys()]).toEqual([]);
  });

  it('reads the server take id of an applicable receipt', () => {
    persistUploadReceipt(receipt);
    expect(readUploadReceiptServerTakeId('rec-1')).toBe(9);
  });

  it('returns null without throwing when the KV read fails', () => {
    persistUploadReceipt(receipt);
    mockFailReads = true;
    expect(readUploadReceipt('rec-1')).toBeNull();
  });

  it('swallows a failing KV remove', () => {
    persistUploadReceipt(receipt);
    mockFailRemoves = true;
    expect(() => clearUploadReceipt('rec-1')).not.toThrow();
    mockFailRemoves = false;
    expect(readUploadReceipt('rec-1')).toEqual(receipt);
  });

  it('keeps a receipt whose server take id is not a positive integer', () => {
    const raw = JSON.stringify({ ...receipt, serverTakeId: 'nine' });
    mockKv.set(uploadReceiptKey('rec-1'), raw);
    expect(readUploadReceipt('rec-1')).toBeNull();
    expect(mockKv.get(`${UNBOUND_UPLOAD_RECEIPT_KEY_PREFIX}rec-1`)).toBe(raw);
    expect(readUploadReceiptServerTakeId('rec-1')).toBeNull();
  });

  it('rejects an empty blob key, a blank timestamp, and a mismatched verse', () => {
    for (const broken of [
      { ...receipt, blobKey: '' },
      { ...receipt, acceptedAt: '' },
      { ...receipt, versionToken: -1 },
      { ...receipt, bibleTextId: 99 },
    ]) {
      mockKv.clear();
      mockKv.set(uploadReceiptKey('rec-1'), JSON.stringify(broken));
      expect(readUploadReceipt('rec-1')).toBeNull();
      expect(mockKv.has(`${UNBOUND_UPLOAD_RECEIPT_KEY_PREFIX}rec-1`)).toBe(
        true,
      );
    }
  });

  it('does not overwrite an unbound receipt that already has a server take id', () => {
    const kept = JSON.stringify({ ...receipt, serverTakeId: 77 });
    mockKv.set(`${UNBOUND_UPLOAD_RECEIPT_KEY_PREFIX}rec-1`, kept);
    mockKv.set(
      uploadReceiptKey('rec-1'),
      JSON.stringify({ ...receipt, blobKey: '' }),
    );
    expect(readUploadReceipt('rec-1')).toBeNull();
    expect(mockKv.get(`${UNBOUND_UPLOAD_RECEIPT_KEY_PREFIX}rec-1`)).toBe(kept);
    expect(readUploadReceiptServerTakeId('rec-1')).toBe(77);
  });

  it('is scoped per recording id', () => {
    persistUploadReceipt(receipt);
    expect(readUploadReceipt('rec-2')).toBeNull();
    expect(readUploadReceipt('rec-1')).not.toBeNull();
  });
});
