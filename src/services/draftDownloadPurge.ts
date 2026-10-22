import {
  deleteDownloadItem,
  getDownloadQueueItemsByResourcePrefix,
  markDownloadItemCancelled,
} from '../db/downloadQueueRepository';
import { deleteDownloadResourceFile } from './downloadStorage';
import {
  readDraftDownloadManifest,
  writeDraftDownloadPurgeTombstone,
  type DraftManifestIdentity,
} from './draftDownloadManifest';
import { isDraftChapterResourceId } from './draftDownloadIds';
import { getSharedDownloadQueueWorker } from './downloadQueueWorkerSingleton';
import { logger } from '../utils/logger';
import type { DraftDownloadRole } from '../types/draftDownload/types';

const log = logger.create('DraftDownloadPurge');

export type PurgeDraftDownloadsInput = {
  projectId: number;
  userId: number;
  chapterAssignmentId: number;
  role: DraftDownloadRole;
  /**
   * Stage that was left. Only `peer_check` and `community_review` purge.
   * Does not invent other stage cleanup product behavior.
   */
  leftStage: 'peer_check' | 'community_review' | string;
};

export type PurgeDraftDownloadsResult = {
  deletedCount: number;
  /** Queue ids that still need a purge retry (file delete failed). */
  failedIds: string[];
};

/**
 * Remove draft-chapter queue rows + files when a chapter leaves Peer Check or
 * Community Review. Does **not** delete authored recordings, shared Prepare
 * for Offline rows, or shared `bible_texts`.
 */
export async function purgeDraftDownloadsOnStageExit(
  input: PurgeDraftDownloadsInput,
): Promise<PurgeDraftDownloadsResult> {
  if (
    input.leftStage !== 'peer_check' &&
    input.leftStage !== 'community_review'
  ) {
    return { deletedCount: 0, failedIds: [] };
  }

  const identity: DraftManifestIdentity = {
    projectId: input.projectId,
    userId: input.userId,
    chapterAssignmentId: input.chapterAssignmentId,
    role: input.role,
  };

  const previous = await readDraftDownloadManifest(identity);
  // Tombstone first so async scripture/audio writers cannot recreate cache.
  await writeDraftDownloadPurgeTombstone(identity, previous);

  const rows = await getDownloadQueueItemsByResourcePrefix(
    input.projectId,
    input.userId,
    'draft-',
  );
  const targets = rows.filter(item =>
    isDraftChapterResourceId(
      item.resourceId ?? item.id,
      input.chapterAssignmentId,
    ),
  );

  const worker = getSharedDownloadQueueWorker();
  await worker.dropItems(targets.map(item => item.id));

  let deletedCount = 0;
  const failedIds: string[] = [];

  for (const item of targets) {
    if (item.localFilePath && item.projectId !== undefined) {
      try {
        await deleteDownloadResourceFile(item.projectId, item.localFilePath);
      } catch (error) {
        log.warn('Failed to delete draft download file; retaining row', {
          error,
          id: item.id,
        });
        await markDownloadItemCancelled(item.id, item.resumeData);
        failedIds.push(item.id);
        continue;
      }
    }

    try {
      await deleteDownloadItem(item.id);
      deletedCount += 1;
    } catch (error) {
      log.warn('Failed to delete draft queue row', { error, id: item.id });
      failedIds.push(item.id);
    }
  }

  log.info('Purged draft downloads on stage exit', {
    chapterAssignmentId: input.chapterAssignmentId,
    userId: input.userId,
    role: input.role,
    leftStage: input.leftStage,
    deletedCount,
    failedCount: failedIds.length,
  });

  return { deletedCount, failedIds };
}
