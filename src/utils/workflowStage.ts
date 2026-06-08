import { WorkflowBadgeStage } from '../types/db/types';
import { workflowStages } from '../theme/tokens';

/** Matches fluent-api CHAPTER_ASSIGNMENT_STATUS.complete */
const COMPLETE_STATUSES = new Set(['complete', 'completed']);

const MY_WORK_BADGE_STAGES = new Set<WorkflowBadgeStage>([
  'draft',
  'peer_check',
  'not_started',
]);

const STAGE_BY_STATUS: Record<string, WorkflowBadgeStage> = {
  draft: 'draft',
  peer_check: 'peer_check',
  not_started: 'not_started',
  '': 'not_started',
  community_check: 'community_check',
  community_review: 'community_check',
  advanced_check: 'advanced_check',
  consultant_check: 'advanced_check',
  expert_check: 'advanced_check',
  complete: 'complete',
  completed: 'complete',
};

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

export function isCompleteStatus(status: string | null | undefined): boolean {
  return COMPLETE_STATUSES.has(normalizeStatus(status));
}

export function getWorkflowStage(
  status: string | null | undefined,
): WorkflowBadgeStage | null {
  if (status === null || status === undefined) {
    return null;
  }

  const normalized = normalizeStatus(status);
  if (normalized in STAGE_BY_STATUS) {
    return STAGE_BY_STATUS[normalized];
  }

  return null;
}

export function getBadgeStage(
  status: string | null | undefined,
): WorkflowBadgeStage | null {
  const stage = getWorkflowStage(status);
  if (!stage || !MY_WORK_BADGE_STAGES.has(stage)) {
    return null;
  }
  return stage;
}

export function getWorkflowStageLabel(stage: WorkflowBadgeStage): string {
  return workflowStages[stage].label;
}
