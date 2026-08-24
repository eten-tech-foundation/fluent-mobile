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

/** Workflow ordinal for conflict resolution (lower = earlier stage). */
const STAGE_RANK: Record<WorkflowBadgeStage, number> = {
  not_started: 0,
  draft: 1,
  peer_check: 2,
  community_check: 3,
  advanced_check: 4,
  complete: 5,
};

export function getWorkflowStageRank(
  status: string | null | undefined,
): number {
  const stage = getWorkflowStage(status);
  if (!stage) {
    return -1;
  }
  return STAGE_RANK[stage];
}

/**
 * Conflict rule (#257): retain whichever stage value is lower (earlier).
 * Returns the status string to persist locally.
 */
export function pickLowerStageStatus(
  localStatus: string | null | undefined,
  serverStatus: string | null | undefined,
): string {
  const localRank = getWorkflowStageRank(localStatus);
  const serverRank = getWorkflowStageRank(serverStatus);
  if (localRank < 0 && serverRank < 0) {
    return (
      normalizeStatus(serverStatus) ||
      normalizeStatus(localStatus) ||
      'not_started'
    );
  }
  if (localRank < 0) {
    return normalizeStatus(serverStatus);
  }
  if (serverRank < 0) {
    return normalizeStatus(localStatus);
  }
  return localRank <= serverRank
    ? normalizeStatus(localStatus)
    : normalizeStatus(serverStatus);
}
