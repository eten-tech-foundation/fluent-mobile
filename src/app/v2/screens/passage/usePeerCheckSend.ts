import { useCallback, useEffect, useRef, useState } from 'react';
import type { DialogProps } from '../../../../components/ui/Dialog';
import {
  PEER_CHECK_SEND_BLOCKED,
  PEER_CHECK_SEND_CANCEL,
  PEER_CHECK_SEND_CAPTURING,
  PEER_CHECK_SEND_CONFIRM,
  PEER_CHECK_SEND_FAILED,
  PEER_CHECK_SEND_LABEL,
  PEER_CHECK_SEND_OK,
  PEER_CHECK_SEND_RETRY,
  PEER_CHECK_SEND_SENDING,
  RECORD_AUDIO_CONFLICT_WARNING,
  RECORD_STAGE_ADVANCE_UNUPLOADABLE_WARNING,
  peerCheckSendKept,
} from '../../../../constants/messages';
import { useDraftingUnit } from '../../../../hooks/useDraftingUnit';
import { normalizeChapterStatus } from '../../../../services/mapChapterAssignment';
import {
  PeerCheckSendBlockedError,
  readPeerCheckSend,
  sendChapterToPeerCheck,
  type PeerCheckSendCheck,
} from '../../../../services/peerCheckSend';
import { logger } from '../../../../utils/logger';
import { stageAdvanceConfirmBody } from '../../../../utils/stageAdvancement';
import type { Ready } from './ready';

const log = logger.create('usePeerCheckSend');

/** The title sheet's Send row, by what the chapter's send has come to. */
export type PeerCheckRow =
  | { kind: 'send'; disabled: boolean; detail: string }
  /** Queued on this phone; the server doesn't have it yet. */
  | { kind: 'queued' }
  /** The server has it in Peer Check. */
  | { kind: 'sent' };

type Asking = {
  scope: string;
  /** `kept`: nothing to retry; the server decided. */
  phase: 'confirm' | 'sending' | 'failed' | 'kept';
  message?: string;
};

/**
 * Send to Peer Check for the passage's chapter, with the Record tab's gate
 * and queue. Only the chapter the passage is recorded under is sent, never
 * another chapter a passage runs into. A send is bound to the account and
 * chapter that started it; a result that lands after either changed is
 * dropped.
 */
export function usePeerCheckSend({
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
    value: PeerCheckSendCheck | null;
  } | null>(null);
  // Re-read whenever the passage reloads: a take, a sync or a send.
  useEffect(() => {
    if (userId === null || scope === null) return;
    let cancelled = false;
    readPeerCheckSend({ chapterAssignmentId, userId, draftingUnit })
      .then(value => {
        if (!cancelled) setCheck({ scope, value });
      })
      .catch(error => {
        log.warn('Peer Check send check failed', {
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
  // Only this drafter's send lands at Peer Check; a later stage's queued
  // advance (#909) is not one.
  const sentByMe =
    normalizeChapterStatus(assignment.status) === 'peer_check' &&
    assignment.assignedUserId === userId;
  let row: PeerCheckRow | null = null;
  if (sentByMe) {
    row = passage.waitingToSend ? { kind: 'queued' } : { kind: 'sent' };
  } else if (current?.visibility.visible) {
    row = {
      kind: 'send',
      disabled: current.visibility.disabled || capturing,
      detail: capturing
        ? PEER_CHECK_SEND_CAPTURING
        : current.hasConflict
        ? RECORD_AUDIO_CONFLICT_WARNING
        : current.hasUnuploadableTakes
        ? RECORD_STAGE_ADVANCE_UNUPLOADABLE_WARNING
        : chapterName,
    };
  }
  const canSend = row?.kind === 'send' && !row.disabled;

  const [asking, setAsking] = useState<Asking | null>(null);
  const sendingRef = useRef(false);
  const open = useCallback(() => {
    if (!canSend || scope === null) return;
    setAsking({ scope, phase: 'confirm' });
  }, [canSend, scope]);
  const cancel = useCallback(() => {
    if (sendingRef.current) return;
    setAsking(null);
  }, []);
  const confirm = useCallback(() => {
    if (sendingRef.current || userId === null || scope === null) return;
    if (!asking || asking.scope !== scope || asking.phase === 'sending') return;
    if (asking.phase === 'kept') {
      setAsking(null);
      return;
    }
    sendingRef.current = true;
    const started = scope;
    const stale = () => {
      if (mountedRef.current && scopeRef.current === started) return false;
      if (mountedRef.current) {
        setAsking(a => (a?.scope === started ? null : a));
      }
      return true;
    };
    setAsking({ scope, phase: 'sending' });
    sendChapterToPeerCheck({ chapterAssignmentId, userId, draftingUnit })
      .then(result => {
        if (stale()) return;
        setAsking(
          result === 'kept'
            ? {
                scope: started,
                phase: 'kept',
                message: peerCheckSendKept(chapterName),
              }
            : null,
        );
        onSent();
      })
      .catch(error => {
        log.warn('Peer Check send failed', {
          chapterAssignmentId,
          error: error instanceof Error ? error.message : String(error),
        });
        if (stale()) return;
        setAsking({
          scope: started,
          phase: 'failed',
          message:
            error instanceof PeerCheckSendBlockedError
              ? PEER_CHECK_SEND_BLOCKED
              : PEER_CHECK_SEND_FAILED,
        });
      })
      .finally(() => {
        sendingRef.current = false;
      });
  }, [
    asking,
    scope,
    userId,
    chapterAssignmentId,
    draftingUnit,
    chapterName,
    onSent,
  ]);

  const shown = asking && asking.scope === scope ? asking : null;
  const dialog: Omit<DialogProps, 'visible'> | null = shown
    ? {
        title: `${PEER_CHECK_SEND_LABEL}?`,
        message:
          shown.message ?? stageAdvanceConfirmBody(chapterName, 'Peer Check'),
        confirmLabel:
          shown.phase === 'sending'
            ? PEER_CHECK_SEND_SENDING
            : shown.phase === 'failed'
            ? PEER_CHECK_SEND_RETRY
            : shown.phase === 'kept'
            ? PEER_CHECK_SEND_OK
            : PEER_CHECK_SEND_CONFIRM,
        cancelLabel: PEER_CHECK_SEND_CANCEL,
        onConfirm: confirm,
        onCancel: cancel,
      }
    : null;

  return { row, open, dialog };
}
