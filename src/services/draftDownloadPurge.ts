import {
  deleteDownloadItem,
  getDownloadQueueItemsByResourcePrefix,
  markDownloadItemCancelled,
} from '../db/downloadQueueRepository';
import { deleteDownloadResourceFile } from './downloadStorage';
import {
  readDraftDownloadManifest,
  writeDraftDownloadPurgeTombstone,
  type DraftDownloadManifest,
  type DraftManifestIdentity,
} from './draftDownloadManifest';
import {
  draftAudioResourceId,
  draftScriptureResourceId,
  draftTextResourceId,
} from './draftDownloadIds';
import { getSharedDownloadQueueWorker } from './downloadQueueWorkerSingleton';
import { logger } from '../utils/logger';
import type { DraftDownloadRole } from '../types/draftDownload/types';
import { isStageAhead } from '../utils/workflowStage';

const log = logger.create('DraftDownloadPurge');

export type PurgeDraftDownloadsInput = {
  projectId: number;
  userId: number;
  chapterAssignmentId: number;
  role: DraftDownloadRole;
  /**
   * Stage that was left. Only `peer_check` (peer_check role) and
   * `community_review` (observer role) purge.
   */
  leftStage: 'peer_check' | 'community_review' | string;
};

export type PurgeDraftDownloadsResult = {
  deletedCount: number;
  /** Queue ids that still need a purge retry (file delete failed). */
  failedIds: string[];
};

export type PersistedStageChangePurgeInput = {
  projectId: number;
  userId: number;
  chapterAssignmentId: number;
  /** Status actually persisted before the write (null/missing → no purge). */
  fromStatus: string | null | undefined;
  /** Status actually persisted after commit (null/missing → no purge). */
  toStatus: string | null | undefined;
};

function normalizeStatus(status: string | null | undefined): string | null {
  if (status === null || status === undefined) return null;
  const normalized = status.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * True only when both statuses are known and `to` is strictly ahead of `from`.
 * Reuses #257/#770 `isStageAhead` (same STAGE_STATUS_ORDER) — no duplicate policy.
 */
export function isStrictlyForwardStageExit(
  fromStatus: string | null | undefined,
  toStatus: string | null | undefined,
): boolean {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (from === null || to === null) return false;
  return isStageAhead(to, from);
}

/**
 * Role that may purge when leaving a stage. peer_check → peer_check role;
 * community_review → observer. Any other stage → null.
 */
export function roleForStageExit(
  leftStage: string | null | undefined,
): DraftDownloadRole | null {
  const stage = normalizeStatus(leftStage);
  if (stage === 'peer_check') return 'peer_check';
  if (stage === 'community_review') return 'observer';
  return null;
}

function siblingRole(role: DraftDownloadRole): DraftDownloadRole {
  return role === 'observer' ? 'peer_check' : 'observer';
}

/**
 * Resource ids this role may delete: exact regenerated assignment audio
 * identities plus safe known text/scripture ids. Returns null when any unit
 * resourceId is forged/mismatched (fail safe — no deletes).
 */
function ownedResourceIds(manifest: DraftDownloadManifest): Set<string> | null {
  const ids = new Set<string>();
  for (const unit of manifest.units) {
    try {
      const expected = draftAudioResourceId(
        manifest.chapterAssignmentId,
        unit.bibleTextId,
        unit.activeTakeId,
        unit.contentHash,
      );
      if (unit.resourceId !== expected) {
        return null;
      }
      ids.add(expected);
    } catch {
      return null;
    }
  }
  ids.add(draftTextResourceId(manifest.chapterAssignmentId));
  if (manifest.role === 'observer') {
    ids.add(draftScriptureResourceId(manifest.chapterAssignmentId));
  }
  return ids;
}

/**
 * After a committed local/sync status write, purge only on a strictly forward
 * exit of peer_check (peer_check role) or community_review (observer). Same,
 * lower, unknown, or missing persisted statuses → no purge.
 */
export async function maybePurgeDraftDownloadsAfterPersistedStageChange(
  input: PersistedStageChangePurgeInput,
): Promise<PurgeDraftDownloadsResult | null> {
  if (!isStrictlyForwardStageExit(input.fromStatus, input.toStatus)) {
    return null;
  }
  const leftStage = normalizeStatus(input.fromStatus);
  const role = roleForStageExit(leftStage);
  if (!role || leftStage === null) {
    return null;
  }
  return purgeDraftDownloadsOnStageExit({
    projectId: input.projectId,
    userId: input.userId,
    chapterAssignmentId: input.chapterAssignmentId,
    role,
    leftStage,
  });
}

/**
 * Remove draft-chapter queue rows + files when a chapter leaves Peer Check or
 * Community Review. Deletes only this role's owned, manifest-listed resources
 * that are not still referenced by a valid non-purged sibling-role manifest
 * for the same account/project/assignment. Missing/invalid own manifest fails
 * safe (tombstone only). Does **not** delete authored recordings, shared
 * Prepare for Offline rows, or shared `bible_texts`.
 */
export async function purgeDraftDownloadsOnStageExit(
  input: PurgeDraftDownloadsInput,
): Promise<PurgeDraftDownloadsResult> {
  const expectedRole = roleForStageExit(input.leftStage);
  if (!expectedRole || input.role !== expectedRole) {
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

  // Fail safe: no owned list → do not delete queue/files (retry needs preserved units).
  if (!previous) {
    log.info('Stage-exit purge skipped deletes; missing/invalid manifest', {
      chapterAssignmentId: input.chapterAssignmentId,
      userId: input.userId,
      role: input.role,
      leftStage: input.leftStage,
    });
    return { deletedCount: 0, failedIds: [] };
  }

  const owned = ownedResourceIds(previous);
  if (owned === null) {
    log.info(
      'Stage-exit purge skipped deletes; invalid/forged unit resource ids',
      {
        chapterAssignmentId: input.chapterAssignmentId,
        userId: input.userId,
        role: input.role,
        leftStage: input.leftStage,
      },
    );
    return { deletedCount: 0, failedIds: [] };
  }

  const protectedIds = new Set<string>();
  const sibling = await readDraftDownloadManifest({
    ...identity,
    role: siblingRole(input.role),
  });
  if (sibling && !sibling.purged) {
    const siblingOwned = ownedResourceIds(sibling);
    if (siblingOwned) {
      for (const id of siblingOwned) {
        protectedIds.add(id);
      }
    }
  }

  const rows = await getDownloadQueueItemsByResourcePrefix(
    input.projectId,
    input.userId,
    'draft-',
  );
  const targets = rows.filter(item => {
    const resourceId = item.resourceId ?? item.id;
    return owned.has(resourceId) && !protectedIds.has(resourceId);
  });

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
    protectedCount: protectedIds.size,
  });

  return { deletedCount, failedIds };
}
