import { WorkflowBadgeStage } from '../types/db/types';

/** Matches fluent-api CHAPTER_ASSIGNMENT_STATUS.complete */
const COMPLETE_STATUSES = new Set(['complete', 'completed']);

const BADGE_STAGE_BY_STATUS: Record<string, WorkflowBadgeStage> = {
  draft: 'draft',
  peer_check: 'peer_check',
  not_started: 'not_started',
  '': 'not_started',
};

const WORKFLOW_STAGE_LABELS: Record<WorkflowBadgeStage, string> = {
  draft: 'Draft',
  peer_check: 'Peer Check',
  not_started: 'Not Started',
};

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

export function isCompleteStatus(status: string | null | undefined): boolean {
  return COMPLETE_STATUSES.has(normalizeStatus(status));
}

export function getBadgeStage(
  status: string | null | undefined,
): WorkflowBadgeStage | null {
  if (status === null || status === undefined) {
    return null;
  }
  return BADGE_STAGE_BY_STATUS[normalizeStatus(status)] ?? null;
}

export function getWorkflowStageLabel(stage: WorkflowBadgeStage): string {
  return WORKFLOW_STAGE_LABELS[stage];
}
