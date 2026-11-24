import { isDevPreviewChapterConflictEnabled } from '../config/devPreviewChapterConflict';
import {
  chapterHasUnuploadableSelectedTakes,
  getChapterAssignmentById,
  getChapterHasConflict,
  hasPendingStageAdvance,
  isChapterFullyRecordedPericopeMode,
  isChapterFullyRecordedVerseMode,
} from '../db/queries';
import { getProjectPericopeSetId } from '../db/repository';
import type { ChapterAssignmentData } from '../types/db/types';
import { logger } from '../utils/logger';
import {
  getStageAdvanceVisibility,
  resolvePeerCheckerAssignmentOnAdvance,
  type StageAdvanceVisibility,
} from '../utils/stageAdvancement';
import { isStageAhead } from '../utils/workflowStage';
import { authToken } from './authToken';
import type { DraftingUnit } from './draftingUnitPreference';
import { getCredentials } from './keychain';
import { normalizeChapterStatus } from './mapChapterAssignment';
import { confirmStageAdvancement } from './stageAdvance';
import { getActiveUserId } from './storage';
import { syncPendingStageAdvancesForUser } from './sync';

const log = logger.create('peerCheckSend');

export type PeerCheckSendCheck = {
  chapter: ChapterAssignmentData;
  /** The Record tab's gate, for the whole chapter. */
  visibility: StageAdvanceVisibility;
  hasConflict: boolean;
  hasUnuploadableTakes: boolean;
};

/**
 * Whether this account may send the chapter to Peer Check now: the Record
 * tab's gate (role, a fully recorded chapter, conflict, takes that can't
 * upload), read fresh for the whole chapter. Null when it isn't a Peer Check
 * send at all, e.g. a later stage (#909) or a chapter not on this phone.
 */
export async function readPeerCheckSend(params: {
  chapterAssignmentId: number;
  userId: number;
  draftingUnit: DraftingUnit;
}): Promise<PeerCheckSendCheck | null> {
  const { chapterAssignmentId, userId, draftingUnit } = params;
  const chapter = await getChapterAssignmentById(chapterAssignmentId);
  if (!chapter) return null;
  const { bibleId, bookId, chapterNumber, projectId, projectUnitId } = chapter;
  const pericopeSetId =
    draftingUnit === 'pericope' && projectId !== null
      ? await getProjectPericopeSetId(projectId)
      : null;
  const [complete, hasUnuploadableTakes, conflict] = await Promise.all([
    pericopeSetId !== null
      ? isChapterFullyRecordedPericopeMode(
          bibleId,
          bookId,
          chapterNumber,
          pericopeSetId,
          projectUnitId,
        )
      : isChapterFullyRecordedVerseMode(
          bibleId,
          bookId,
          chapterNumber,
          projectUnitId,
        ),
    chapterHasUnuploadableSelectedTakes(bibleId, bookId, chapterNumber),
    getChapterHasConflict(chapterAssignmentId),
  ]);
  const hasConflict = isDevPreviewChapterConflictEnabled() || conflict;
  const visibility = getStageAdvanceVisibility({
    chapterData: chapter,
    currentUserId: userId,
    hasChapterRecording: complete,
    hasConflict,
    hasUnuploadableTakes,
    // Send is the chapter's, not a unit's.
    isOnLastUnit: true,
  });
  if (visibility.destination?.nextStatus !== 'peer_check') return null;
  return { chapter, visibility, hasConflict, hasUnuploadableTakes };
}

/**
 * - `confirmed`: the server has the chapter in Peer Check.
 * - `queued`: saved here; the queue sends it when it can.
 * - `kept`: the server kept the chapter at its stage; the local send is gone.
 */
export type PeerCheckSendResult = 'confirmed' | 'queued' | 'kept';

export class PeerCheckSendBlockedError extends Error {
  constructor() {
    super("This chapter can't be sent to Peer Check right now");
    this.name = 'PeerCheckSendBlockedError';
  }
}

/**
 * Sends one chapter to Peer Check for the account that asked. Rechecks the
 * gate, writes and queues it as the Record tab does, then drains the queue
 * once so an online send can come back confirmed. Throws, writing nothing,
 * when the account changed or the chapter can't be sent.
 */
export async function sendChapterToPeerCheck(params: {
  chapterAssignmentId: number;
  userId: number;
  draftingUnit: DraftingUnit;
}): Promise<PeerCheckSendResult> {
  const { chapterAssignmentId, userId } = params;
  const isActive = () => getActiveUserId() === String(userId);
  if (!isActive()) throw new PeerCheckSendBlockedError();
  const check = await readPeerCheckSend(params);
  if (
    !isActive() ||
    !check ||
    !check.visibility.visible ||
    check.visibility.disabled ||
    !check.visibility.destination
  ) {
    throw new PeerCheckSendBlockedError();
  }
  const { destination } = check.visibility;
  await confirmStageAdvancement({
    chapterAssignmentId,
    destination,
    assignPeerCheckerId: resolvePeerCheckerAssignmentOnAdvance({
      chapterData: check.chapter,
      currentUserId: userId,
      nextStatus: destination.nextStatus,
    }),
    userId,
  });

  // The send is written; from here a failure leaves it queued, not undone.
  try {
    // Another account's session must not drain this one's queue.
    if (isActive()) {
      const token =
        (await getCredentials(String(userId)))?.token ??
        (isActive() ? authToken.get() : null);
      if (isActive()) {
        await syncPendingStageAdvancesForUser(userId, token ?? undefined);
      }
    }
    if (await hasPendingStageAdvance(chapterAssignmentId)) return 'queued';
    const after = await getChapterAssignmentById(chapterAssignmentId);
    if (!after) return 'queued';
    const status = normalizeChapterStatus(after.status);
    return status === destination.nextStatus ||
      isStageAhead(status, destination.nextStatus)
      ? 'confirmed'
      : 'kept';
  } catch (error) {
    log.warn('Peer Check send queued; follow-up failed', {
      chapterAssignmentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'queued';
  }
}
