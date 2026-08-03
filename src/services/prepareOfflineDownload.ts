import { simulatePrepareOfflineDownloadProgress } from './prepareOfflineResources';
import { PrepareOfflineResourceItem } from '../types/prepareOffline/types';
import { logger } from '../utils/logger';

const log = logger.create('prepareOfflineDownload');

export interface EnqueuePrepareOfflineDownloadInput {
  userId: number;
  projectId: number;
  items: PrepareOfflineResourceItem[];
}

/**
 * Enqueue selected resources for tier-ordered download.
 * Items must be in manifest/catalog order (see sortItemsForPrepareOfflineDownload).
 * TODO(#201): persist queue rows and start the download worker.
 *
 * In dev, delegates progress simulation to prepareOfflineResources service.
 */
export function enqueuePrepareOfflineDownload(
  input: EnqueuePrepareOfflineDownloadInput,
): void {
  log.info('Prepare offline download enqueue stub', {
    userId: input.userId,
    projectId: input.projectId,
    itemCount: input.items.length,
  });

  const tierOrderedIds = input.items.map(item => item.id);

  simulatePrepareOfflineDownloadProgress(input.projectId, tierOrderedIds);
}
