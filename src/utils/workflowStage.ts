/** Matches fluent-api CHAPTER_ASSIGNMENT_STATUS.complete */
const COMPLETE_STATUSES = new Set(['complete', 'completed']);

export type WorkflowBadgeStage = 'draft' | 'peer_check';

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

export function isCompleteStatus(status: string | null | undefined): boolean {
  return COMPLETE_STATUSES.has(normalizeStatus(status));
}

export function getBadgeStage(
  status: string | null | undefined,
): WorkflowBadgeStage | null {
  const normalized = normalizeStatus(status);
  if (normalized === 'draft') {
    return 'draft';
  }
  if (normalized === 'peer_check') {
    return 'peer_check';
  }
  return null;
}

export function getWorkflowStageLabel(stage: WorkflowBadgeStage): string {
  return stage === 'draft' ? 'Draft' : 'Peer Check';
}
