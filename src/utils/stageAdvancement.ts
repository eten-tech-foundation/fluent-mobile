import type { ChapterAssignmentData } from '../types/db/types';
import { CHAPTER_ASSIGNMENT_STATUS } from '../types/db/types';

export type StageAdvanceStatus =
  | 'peer_check'
  | 'community_review'
  | 'linguist_check'
  | 'theological_check'
  | 'consultant_check'
  | 'complete';

export type StageAdvanceDestination = {
  /** Next chapter_assignments.status value written locally / expected by API. */
  nextStatus: StageAdvanceStatus;
  /** CTA label, e.g. "Send to Peer Check". */
  buttonLabel: string;
  /** Confirm-sheet destination name, e.g. "Peer Check". */
  destinationLabel: string;
};

function normalizeAdvanceStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

/** Full linear chain (#258 + #443): current status -> next submit destination. */
const STAGE_CHAIN: Record<string, StageAdvanceStatus> = {
  '': 'peer_check',
  not_started: 'peer_check',
  draft: 'peer_check',
  peer_check: 'community_review',
  community_review: 'linguist_check',
  linguist_check: 'theological_check',
  theological_check: 'consultant_check',
  consultant_check: 'complete',
  // complete: terminal, intentionally absent — returns null below
};

/**
 * Maps the chapter's current status to the next stage-advance destination.
 * Covers the full linear chain from Drafting through Complete (#258, #443).
 * Terminal (`complete`) or unrecognized statuses return null.
 */
export function getStageAdvanceDestination(
  status: string | null | undefined,
): StageAdvanceDestination | null {
  const normalized = normalizeAdvanceStatus(status);
  const nextStatus = Object.prototype.hasOwnProperty.call(
    STAGE_CHAIN,
    normalized,
  )
    ? STAGE_CHAIN[normalized]
    : undefined;
  if (!nextStatus) {
    return null;
  }

  return {
    nextStatus,
    buttonLabel: `Send to ${CHAPTER_ASSIGNMENT_STATUS[nextStatus]}`,
    destinationLabel: CHAPTER_ASSIGNMENT_STATUS[nextStatus],
  };
}

type StageAdvanceChapterData = {
  status: ChapterAssignmentData['status'];
  assignedUserId?: ChapterAssignmentData['assignedUserId'];
  peerCheckerId?: ChapterAssignmentData['peerCheckerId'];
};

export type StageAdvanceVisibilityInput = {
  chapterData: StageAdvanceChapterData;
  currentUserId: number | null;
  /** True when at least one verse in the chapter has a selected recording. */
  hasChapterRecording: boolean;
  hasConflict: boolean;
};

export type StageAdvanceVisibility = {
  visible: boolean;
  disabled: boolean;
  destination: StageAdvanceDestination | null;
};

/** Statuses gated to a specific assignee. Everything else (Community Review
 * through Consultant Check) is open to any translator per #443 AC. */
const ASSIGNEE_GATED_STATUSES = new Set([
  '',
  'not_started',
  'draft',
  'peer_check',
]);

/**
 * Visibility / enablement for the Record-tab stage advancement CTA (#258, #443, #442).
 * Conflict disables (does not hide). Wrong assignee / no recordings / terminal
 * stage hide. Unassigned Peer Check is open to any non-drafter. Community Review
 * and later stages are ungated — any translator.
 */
export function getStageAdvanceVisibility({
  chapterData,
  currentUserId,
  hasChapterRecording,
  hasConflict,
}: StageAdvanceVisibilityInput): StageAdvanceVisibility {
  const destination = getStageAdvanceDestination(chapterData.status);
  if (!destination || currentUserId === null) {
    return { visible: false, disabled: false, destination: null };
  }

  const normalized = normalizeAdvanceStatus(chapterData.status);

  if (ASSIGNEE_GATED_STATUSES.has(normalized)) {
    const isPeerCheck = normalized === 'peer_check';

    if (isPeerCheck) {
      const assignedUserId = chapterData.assignedUserId;
      if (typeof assignedUserId !== 'number') {
        return { visible: false, disabled: false, destination: null };
      }
      const isDrafter = assignedUserId === currentUserId;
      const peerCheckerId = chapterData.peerCheckerId;
      const isOpen = typeof peerCheckerId !== 'number';
      const isAssignedPeerChecker = peerCheckerId === currentUserId;
      if (isDrafter || (!isOpen && !isAssignedPeerChecker)) {
        return { visible: false, disabled: false, destination: null };
      }
    } else {
      if (chapterData.assignedUserId !== currentUserId) {
        return { visible: false, disabled: false, destination: null };
      }

      // Drafting with no recordings: hide until at least one verse is recorded.
      if (!hasChapterRecording) {
        return { visible: false, disabled: false, destination: null };
      }
    }
  }
  // community_review, linguist_check, theological_check, consultant_check:
  // no assignee — visible to any translator on the project.

  return {
    visible: true,
    disabled: hasConflict,
    destination,
  };
}

/**
 * True when the drafter must not capture on open Peer Check (#442, fluent-api
 * edit policy). PM-assigned Peer Check uses a different rule set.
 */
export function isDrafterBlockedFromOpenPeerCheckCapture(
  chapterData: StageAdvanceChapterData,
  currentUserId: number | null,
): boolean {
  if (currentUserId === null) {
    return false;
  }
  if (normalizeAdvanceStatus(chapterData.status) !== 'peer_check') {
    return false;
  }
  if (typeof chapterData.peerCheckerId === 'number') {
    return false;
  }
  return chapterData.assignedUserId === currentUserId;
}

/**
 * When advancing unassigned Peer Check → Community Review, the tapping peer
 * becomes Peer Checker. Drafter and PM-assigned items do not assign here.
 */
export function resolvePeerCheckerAssignmentOnAdvance(params: {
  chapterData: StageAdvanceChapterData;
  currentUserId: number | null;
  nextStatus: StageAdvanceStatus;
}): number | undefined {
  const { chapterData, currentUserId, nextStatus } = params;
  if (nextStatus !== 'community_review') {
    return undefined;
  }
  if (normalizeAdvanceStatus(chapterData.status) !== 'peer_check') {
    return undefined;
  }
  if (currentUserId === null) {
    return undefined;
  }
  if (typeof chapterData.assignedUserId !== 'number') {
    return undefined;
  }
  if (chapterData.assignedUserId === currentUserId) {
    return undefined;
  }
  if (typeof chapterData.peerCheckerId === 'number') {
    return undefined;
  }
  return currentUserId;
}

export function stageAdvanceConfirmBody(
  chapterName: string,
  destinationLabel: string,
): string {
  return `This marks ${chapterName} as ready for ${destinationLabel}.`;
}
