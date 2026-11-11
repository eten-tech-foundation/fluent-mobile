const mockDeleteRecordingTake = jest.fn();
const mockReadServerTakeId = jest.fn();
const mockClearAllUploadReceipts = jest.fn();
const mockClearUploadOperation = jest.fn();

jest.mock('../db/repository', () => ({
  deleteRecordingTake: (...args: unknown[]) => mockDeleteRecordingTake(...args),
}));

jest.mock('./uploadReceipts', () => ({
  readUploadReceiptServerTakeId: (...args: unknown[]) =>
    mockReadServerTakeId(...args),
  clearAllUploadReceipts: (...args: unknown[]) =>
    mockClearAllUploadReceipts(...args),
}));

const mockReadUploadOperation = jest.fn();

jest.mock('./uploadOperationState', () => ({
  clearUploadOperation: (...args: unknown[]) =>
    mockClearUploadOperation(...args),
  readUploadOperation: (...args: unknown[]) => mockReadUploadOperation(...args),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { deleteRecordingTakeWithUploadState } from './recordingTakeDeletion';

describe('deleteRecordingTakeWithUploadState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadServerTakeId.mockReturnValue(null);
    mockReadUploadOperation.mockReturnValue(null);
    mockDeleteRecordingTake.mockResolvedValue(true);
  });

  it('passes the receipt take id so the server copy is queued for deletion', async () => {
    mockReadServerTakeId.mockReturnValue(77);

    await deleteRecordingTakeWithUploadState('rec-1');

    expect(mockDeleteRecordingTake).toHaveBeenCalledWith('rec-1', {
      receiptServerTakeId: 77,
    });
  });

  it('clears receipts and the upload operation after the delete commits', async () => {
    await deleteRecordingTakeWithUploadState('rec-1');

    expect(mockClearAllUploadReceipts).toHaveBeenCalledWith('rec-1');
    expect(mockClearUploadOperation).toHaveBeenCalledWith('rec-1');
  });

  it('uses the upload operation take id when no receipt has one', async () => {
    mockReadUploadOperation.mockReturnValue({ serverTakeId: 88 });

    await deleteRecordingTakeWithUploadState('rec-1');

    expect(mockDeleteRecordingTake).toHaveBeenCalledWith('rec-1', {
      receiptServerTakeId: 88,
    });
  });

  it('keeps upload state when the delete did not apply', async () => {
    mockDeleteRecordingTake.mockResolvedValue(false);

    await deleteRecordingTakeWithUploadState('rec-1');

    expect(mockClearAllUploadReceipts).not.toHaveBeenCalled();
    expect(mockClearUploadOperation).not.toHaveBeenCalled();
  });

  it('does not reject a committed delete when ledger cleanup throws', async () => {
    mockClearUploadOperation.mockImplementation(() => {
      throw new Error('kv down');
    });

    await expect(
      deleteRecordingTakeWithUploadState('rec-1'),
    ).resolves.toBeUndefined();
  });
});
