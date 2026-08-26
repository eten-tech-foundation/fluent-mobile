import type { ChapterAssignmentData } from '../types/db/types';
import { getWorkflowStage } from './workflowStage';

export type StageAdvanceDestination = {
  /** Next chapter_assignments.status value written locally / expected by API. */
  nextStatus: 'peer_check' | 'community_check';
  /** CTA label, e.g. "Send to Peer Check". */
  buttonLabel: string;
  /** Confirm-sheet destination name, e.g. "Peer Check". */
  destinationLabel: string;
};

/**
 * Maps the chapter's current workflow stage to the next submit destination.
 * Only Drafting → Peer Check and Peer Check → Community Review are advanceable
 * from mobile (#258).
 */
export function getStageAdvanceDestination(
  status: string | null | undefined,
): StageAdvanceDestination | null {
  const stage = getWorkflowStage(status);
  if (stage === 'draft' || stage === 'not_started') {
    return {
      nextStatus: 'peer_check',
      buttonLabel: 'Send to Peer Check',
      destinationLabel: 'Peer Check',
    };
  }
  if (stage === 'peer_check') {
    return {
      nextStatus: 'community_check',
      buttonLabel: 'Send to Community Review',
      destinationLabel: 'Community Review',
    };
  }
  return null;
}

export type StageAdvanceVisibilityInput = {
  chapterData: Pick<
    ChapterAssignmentData,
    'status' | 'assignedUserId' | 'peerCheckerId'
  >;
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

/**
 * Visibility / enablement for the Record-tab stage advancement CTA (#258).
 * Conflict disables (does not hide). Wrong assignee / community / no recordings hide.
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

  const stage = getWorkflowStage(chapterData.status);
  const isAssignee =
    stage === 'peer_check'
      ? chapterData.peerCheckerId === currentUserId
      : chapterData.assignedUserId === currentUserId;

  if (!isAssignee) {
    return { visible: false, disabled: false, destination: null };
  }

  // Drafting with no recordings: hide until at least one verse is recorded.
  if ((stage === 'draft' || stage === 'not_started') && !hasChapterRecording) {
    return { visible: false, disabled: false, destination: null };
  }

  return {
    visible: true,
    disabled: hasConflict,
    destination,
  };
}

export function stageAdvanceConfirmBody(
  chapterName: string,
  destinationLabel: string,
): string {
  return `This marks ${chapterName} as ready for ${destinationLabel}.`;
}
