import { WorkflowBadgeStage } from '../types/db/types';
import { workflowStages } from '../theme/tokens';
import { STAGE_STATUS_ORDER } from './stageAdvancement';

/** Matches fluent-api CHAPTER_ASSIGNMENT_STATUS.complete */
const COMPLETE_STATUSES = new Set(['complete']);

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
  community_review: 'community_review',
  linguist_check: 'advanced_check',
  theological_check: 'advanced_check',
  consultant_check: 'advanced_check',
  complete: 'complete',
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

function stageRank(status: string | null | undefined): number | null {
  if (status === null || status === undefined) return null;
  const index = STAGE_STATUS_ORDER.indexOf(
    normalizeStatus(status) as (typeof STAGE_STATUS_ORDER)[number],
  );
  return index === -1 ? null : index;
}

/**
 * Lower workflow stage of the two values. A missing status loses to the
 * defined one, so an undefined server status keeps the local stage (#257).
 */
export function pickLowerStageStatus(
  a: string | null | undefined,
  b: string | null | undefined,
): string {
  if (a === null || a === undefined) return b ?? '';
  if (b === null || b === undefined) return a;
  const rankA = stageRank(a);
  const rankB = stageRank(b);
  if (rankA === null) return normalizeStatus(b);
  if (rankB === null) return normalizeStatus(a);
  return rankA <= rankB ? normalizeStatus(a) : normalizeStatus(b);
}

export function isStageAhead(
  serverStatus: string | null | undefined,
  toStatus: string,
): boolean {
  const serverRank = stageRank(serverStatus);
  const toRank = stageRank(toStatus);
  if (serverRank === null || toRank === null) return false;
  return serverRank > toRank;
}
