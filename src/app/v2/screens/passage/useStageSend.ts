import { useCallback, useEffect, useRef, useState } from 'react';
import type { DialogProps } from '../../../../components/ui/Dialog';
import {
  RECORD_AUDIO_CONFLICT_WARNING,
  RECORD_STAGE_ADVANCE_UNUPLOADABLE_WARNING,
  STAGE_SEND_CANCEL,
  STAGE_SEND_CAPTURING,
  STAGE_SEND_COMPLETE_FAILED,
  STAGE_SEND_CONFIRM,
  STAGE_SEND_FAILED,
  STAGE_SEND_OK,
  STAGE_SEND_RETRY,
  STAGE_SEND_SENDING,
  stageQueuedTitle,
  stageSendBlocked,
  stageSendKept,
} from '../../../../constants/messages';
import { useDraftingUnit } from '../../../../hooks/useDraftingUnit';
import { normalizeChapterStatus } from '../../../../services/mapChapterAssignment';
import {
  StageSendBlockedError,
  readStageSend,
  sendChapterToStage,
  type StageSendCheck,
} from '../../../../services/stageSend';
import { CHAPTER_ASSIGNMENT_STATUS } from '../../../../types/db/types';
import { logger } from '../../../../utils/logger';
import {
  stageAdvanceConfirmBody,
  type StageAdvanceDestination,
} from '../../../../utils/stageAdvancement';
import { isStageAhead } from '../../../../utils/workflowStage';
import type { Ready } from './ready';

const log = logger.create('useStageSend');

/** The title sheet's Send row, by what the chapter's send has come to. */
export type StageSendRow =
  /** e.g. "Send to Community Review". */
  | { kind: 'send'; label: string; disabled: boolean; detail: string }
  /** Queued on this phone; the server doesn't have it yet. */
  | { kind: 'queued'; title: string }
  /** The drafter's send: the server has it in Peer Check. */
  | { kind: 'sent' };

type Asking = {
  scope: string;
  /** What the dialog asked about; a different next stage isn't sent. */
  destination: StageAdvanceDestination;
  /** `kept`: nothing to retry; the server decided. */
  phase: 'confirm' | 'sending' | 'failed' | 'kept';
  message?: string;
};

/**
 * Sends the passage's chapter on to its next stage, from Draft through
 * Complete, with the stage gate and queue. Only the chapter the
 * passage is recorded under is sent, never another chapter a passage runs
 * into. A send is bound to the account and chapter that started it; a result
 * that lands after either changed is dropped.
 */
export function useStageSend({
  passage,
  userId,
  capturing,
  onSent,
}: {
  passage: Ready;
  userId: number | null;
  /** A take is in progress: Send waits for it. */
  capturing: boolean;
  /** Re-reads the passage once the send is written. */
  onSent: () => void;
}) {
  const { draftingUnit } = useDraftingUnit();
  const { assignment } = passage;
  const chapterAssignmentId = assignment.id;
  const chapterName = `${assignment.bookName ?? ''} ${
    assignment.chapterNumber
  }`.trim();
  const scope =
    userId === null ? null : `${userId}:${chapterAssignmentId}:${draftingUnit}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [check, setCheck] = useState<{
    scope: string;
    value: StageSendCheck | null;
  } | null>(null);
  // Re-read whenever the passage reloads: a take, a sync or a send.
  useEffect(() => {
    if (userId === null || scope === null) return;
    let cancelled = false;
    readStageSend({ chapterAssignmentId, userId, draftingUnit })
      .then(value => {
        if (!cancelled) setCheck({ scope, value });
      })
      .catch(error => {
        log.warn('Stage send check failed', {
          chapterAssignmentId,
          error: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) setCheck({ scope, value: null });
      });
    return () => {
      cancelled = true;
    };
  }, [scope, userId, chapterAssignmentId, draftingUnit, passage]);

  const current = check && check.scope === scope ? check.value : null;
  const status = normalizeChapterStatus(assignment.status);
  const destination = current?.visibility.visible
    ? current.visibility.destination
    : null;
  let row: StageSendRow | null = null;
  if (passage.waitingToSend) {
    // A queued send already moved the local stage; one at a time.
    const label: string | undefined =
      CHAPTER_ASSIGNMENT_STATUS[
        status as keyof typeof CHAPTER_ASSIGNMENT_STATUS
      ];
    row = { kind: 'queued', title: stageQueuedTitle(label) };
  } else if (status === 'peer_check' && assignment.assignedUserId === userId) {
    row = { kind: 'sent' };
  } else if (current && destination) {
    row = {
      kind: 'send',
      label: destination.buttonLabel,
      disabled: current.visibility.disabled || capturing,
      detail: capturing
        ? STAGE_SEND_CAPTURING
        : current.hasConflict
        ? RECORD_AUDIO_CONFLICT_WARNING
        : current.hasUnuploadableTakes
        ? RECORD_STAGE_ADVANCE_UNUPLOADABLE_WARNING
        : chapterName,
    };
  }
  const sendTo =
    row?.kind === 'send' && !row.disabled ? destination?.nextStatus : null;

  const [asking, setAsking] = useState<Asking | null>(null);
  const sendingRef = useRef(false);
  const open = useCallback(() => {
    if (!sendTo || !destination || scope === null) return;
    setAsking({ scope, destination, phase: 'confirm' });
  }, [sendTo, destination, scope]);
  const cancel = useCallback(() => {
    if (sendingRef.current) return;
    setAsking(null);
  }, []);
  // An unanswered question about a stage the chapter has left isn't asked,
  // and a failure isn't retried once the chapter has reached that stage.
  const reached = (to: StageAdvanceDestination) =>
    status === to.nextStatus || isStageAhead(status, to.nextStatus);
  const shown =
    asking &&
    asking.scope === scope &&
    (asking.phase === 'confirm'
      ? asking.destination.nextStatus === sendTo
      : asking.phase === 'sending' || !reached(asking.destination))
      ? asking
      : null;
  // Dropped for good: it doesn't come back if the stage or account does.
  const dropped = asking !== null && !shown && asking.phase !== 'sending';
  useEffect(() => {
    if (dropped) setAsking(null);
  }, [dropped]);
  const confirm = useCallback(() => {
    if (sendingRef.current || userId === null || scope === null) return;
    if (!shown || shown.phase === 'sending') return;
    if (shown.phase === 'kept') {
      setAsking(null);
      return;
    }
    sendingRef.current = true;
    const started = scope;
    const to = shown.destination;
    const stale = () => {
      if (mountedRef.current && scopeRef.current === started) return false;
      if (mountedRef.current) {
        setAsking(a => (a?.scope === started ? null : a));
      }
      return true;
    };
    setAsking({ scope, destination: to, phase: 'sending' });
    sendChapterToStage({
      chapterAssignmentId,
      userId,
      draftingUnit,
      to: to.nextStatus,
    })
      .then(result => {
        if (stale()) return;
        setAsking(
          result === 'kept'
            ? {
                scope: started,
                destination: to,
                phase: 'kept',
                message: stageSendKept(chapterName),
              }
            : null,
        );
        onSent();
      })
      .catch(error => {
        log.warn('Stage send failed', {
          chapterAssignmentId,
          to: to.nextStatus,
          error: error instanceof Error ? error.message : String(error),
        });
        if (stale()) return;
        setAsking({
          scope: started,
          destination: to,
          phase: 'failed',
          message:
            error instanceof StageSendBlockedError
              ? stageSendBlocked(to.destinationLabel)
              : to.nextStatus === 'complete'
              ? STAGE_SEND_COMPLETE_FAILED
              : STAGE_SEND_FAILED,
        });
      })
      .finally(() => {
        sendingRef.current = false;
      });
  }, [
    shown,
    scope,
    userId,
    chapterAssignmentId,
    draftingUnit,
    chapterName,
    onSent,
  ]);

  const dialog: Omit<DialogProps, 'visible'> | null = shown
    ? {
        title: `${shown.destination.buttonLabel}?`,
        message:
          shown.message ??
          stageAdvanceConfirmBody(
            chapterName,
            shown.destination.destinationLabel,
          ),
        confirmLabel:
          shown.phase === 'sending'
            ? STAGE_SEND_SENDING
            : shown.phase === 'failed'
            ? STAGE_SEND_RETRY
            : shown.phase === 'kept'
            ? STAGE_SEND_OK
            : STAGE_SEND_CONFIRM,
        cancelLabel: STAGE_SEND_CANCEL,
        onConfirm: confirm,
        onCancel: cancel,
      }
    : null;

  return { row, open, dialog };
}
