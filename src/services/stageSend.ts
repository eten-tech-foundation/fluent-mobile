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
import { classifyMyWorkListAccess } from '../utils/myWorkChapterFilter';
import { getTranslatorProjectIds } from '../utils/myWorkDraftDownload';
import {
  getStageAdvanceVisibility,
  resolvePeerCheckerAssignmentOnAdvance,
  type StageAdvanceStatus,
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

const log = logger.create('stageSend');

export type StageSendCheck = {
  chapter: ChapterAssignmentData;
  /** The Record tab's gate, for the whole chapter. */
  visibility: StageAdvanceVisibility;
  hasConflict: boolean;
  hasUnuploadableTakes: boolean;
};

/**
 * Whether this account may send the chapter on to its next stage now: the
 * Record tab's gate (role, a fully recorded chapter while drafting, conflict,
 * takes that can't upload), read fresh for the whole chapter. Null when the
 * gate offers no send, e.g. a Complete chapter or one not on this phone.
 */
export async function readStageSend(params: {
  chapterAssignmentId: number;
  userId: number;
  draftingUnit: DraftingUnit;
}): Promise<StageSendCheck | null> {
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
  if (!visibility.destination) return null;
  // Seeing a Peer Check isn't checking it: only its checker, or a peer the
  // chapter would open for as open Peer Check work (Translator grant), sends.
  if (
    normalizeChapterStatus(chapter.status) === 'peer_check' &&
    !isPeerCheckWork(chapter, userId)
  ) {
    return null;
  }
  return { chapter, visibility, hasConflict, hasUnuploadableTakes };
}

function isPeerCheckWork(
  chapter: ChapterAssignmentData,
  userId: number,
): boolean {
  if (chapter.projectId === null) return false;
  const access = classifyMyWorkListAccess({
    userId,
    assignmentStatus: chapter.status,
    assignedUserId: chapter.assignedUserId,
    peerCheckerId: chapter.peerCheckerId,
    projectId: chapter.projectId,
    grantProjectIds: [],
    translatorProjectIds: getTranslatorProjectIds(String(userId)),
  });
  return access === 'assigned' || access === 'open_peer';
}

/**
 * - `confirmed`: the server has the chapter at the stage it was sent to.
 * - `queued`: saved here; the queue sends it when it can. Never Complete.
 * - `kept`: the server kept the chapter at its stage; the local send is gone.
 */
export type StageSendResult = 'confirmed' | 'queued' | 'kept';

export class StageSendBlockedError extends Error {
  constructor() {
    super("This chapter can't be sent on right now");
    this.name = 'StageSendBlockedError';
  }
}

/**
 * Sends one chapter on to `to` for the account that asked. Rechecks the gate,
 * and refuses if the chapter's next stage is no longer `to`. A nonterminal
 * send is written and queued as the Record tab does, then the queue drains
 * once so an online send can come back confirmed. Complete is written only
 * after the server confirms it, and throws otherwise. Throws, writing
 * nothing, when the account changed or the chapter can't be sent.
 */
export async function sendChapterToStage(params: {
  chapterAssignmentId: number;
  userId: number;
  draftingUnit: DraftingUnit;
  to: StageAdvanceStatus;
}): Promise<StageSendResult> {
  const { chapterAssignmentId, userId, to } = params;
  const isActive = () => getActiveUserId() === String(userId);
  if (!isActive()) throw new StageSendBlockedError();
  const check = await readStageSend(params);
  if (
    !isActive() ||
    !check ||
    !check.visibility.visible ||
    check.visibility.disabled ||
    check.visibility.destination?.nextStatus !== to
  ) {
    throw new StageSendBlockedError();
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
  if (to === 'complete') return 'confirmed';

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
    log.warn('Stage send queued; follow-up failed', {
      chapterAssignmentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'queued';
  }
}
