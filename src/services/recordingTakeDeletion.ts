import { deleteRecordingTake } from '../db/repository';
import {
  clearAllUploadReceipts,
  readUploadReceiptServerTakeId,
} from './uploadReceipts';
import {
  clearUploadOperation,
  readUploadOperation,
} from './uploadOperationState';
import { logger } from '../utils/logger';

const log = logger.create('RecordingTakeDeletion');

/**
 * Delete a local take and the upload ledger kept for it in KV. A receipt's
 * server take id is handed to the delete so the server copy is still queued
 * for removal (#716) when the accepted upload never got its local marker.
 */
export async function deleteRecordingTakeWithUploadState(
  id: string,
): Promise<void> {
  const receiptServerTakeId =
    readUploadReceiptServerTakeId(id) ??
    readUploadOperation(id)?.serverTakeId ??
    null;
  const deleted = await deleteRecordingTake(id, { receiptServerTakeId });
  if (!deleted) return;
  // The delete has committed; ledger cleanup must never reject it.
  try {
    clearAllUploadReceipts(id);
    clearUploadOperation(id);
  } catch (error) {
    log.warn('Failed to clear upload state after delete', { id, error });
  }
}
