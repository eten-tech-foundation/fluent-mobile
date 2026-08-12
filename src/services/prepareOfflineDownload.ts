import { enqueueDownloadItems } from '../db/repository';
import { simulatePrepareOfflineDownloadProgress } from './prepareOfflineResources';
import { PrepareOfflineResourceItem } from '../types/prepareOffline/types';
import { logger } from '../utils/logger';
import { prepareOfflineItemsToEnqueueInputs } from '../utils/prepareOfflineQueueMapping';

const log = logger.create('prepareOfflineDownload');

export interface EnqueuePrepareOfflineDownloadInput {
  userId: number;
  projectId: number;
  items: PrepareOfflineResourceItem[];
}

/**
 * Enqueue selected resources for tier-ordered download using stable catalog ids.
 * Returns enqueued queue row ids (may be fewer when rows already exist).
 */
export async function enqueuePrepareOfflineDownload(
  input: EnqueuePrepareOfflineDownloadInput,
): Promise<string[]> {
  log.info('Enqueue prepare offline download', {
    userId: input.userId,
    projectId: input.projectId,
    itemCount: input.items.length,
  });

  const enqueueInputs = prepareOfflineItemsToEnqueueInputs(
    input.items,
    input.projectId,
    input.userId,
  );

  try {
    const ids = await enqueueDownloadItems(enqueueInputs);
    log.info('Prepare offline items enqueued', {
      projectId: input.projectId,
      enqueuedCount: ids.length,
    });
    return ids;
  } catch (error) {
    log.error(
      'Failed to enqueue prepare offline download; falling back to dev mock',
      {
        error,
        projectId: input.projectId,
      },
    );

    if (__DEV__) {
      const tierOrderedIds = input.items.map(item => item.id);
      simulatePrepareOfflineDownloadProgress(input.projectId, tierOrderedIds);
      return [];
    }

    throw error;
  }
}
