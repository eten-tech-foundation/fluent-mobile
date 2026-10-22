import { MyWorkChapter, WorkflowBadgeStage } from '../types/db/types';
import { stageEnteredAtMs } from './stageEnteredAt';

/**
 * Accordion keys for My Work (#505 foundation).
 * Raw assignment statuses — not shared `WorkflowBadgeStage` (which collapses
 * linguist/theological/consultant into `advanced_check`).
 * `not_started` chapters appear under Drafting (existing stage semantics).
 */
export const MY_WORK_ACCORDION_STAGE_ORDER = [
  'draft',
  'peer_check',
  'community_review',
  'linguist_check',
  'theological_check',
  'consultant_check',
] as const;

export type MyWorkAccordionStage =
  (typeof MY_WORK_ACCORDION_STAGE_ORDER)[number];

const MY_WORK_STAGE_LABELS: Record<MyWorkAccordionStage, string> = {
  draft: 'Drafting',
  peer_check: 'Peer Check',
  community_review: 'Community Review',
  linguist_check: 'Linguist Check',
  theological_check: 'Theologian Check',
  consultant_check: 'Consultant Check',
};

export type MyWorkStageGroup = {
  stage: MyWorkAccordionStage;
  label: string;
  chapters: MyWorkChapter[];
};

function normalizeAssignmentStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

/** Map raw assignment status → accordion stage; omit complete/unknown. */
export function myWorkAccordionStageForStatus(
  status: string | null | undefined,
): MyWorkAccordionStage | null {
  const normalized = normalizeAssignmentStatus(status);
  if (normalized === 'not_started' || normalized === 'draft') {
    return 'draft';
  }
  if (
    normalized === 'peer_check' ||
    normalized === 'community_review' ||
    normalized === 'linguist_check' ||
    normalized === 'theological_check' ||
    normalized === 'consultant_check'
  ) {
    return normalized;
  }
  return null;
}

/**
 * Legacy icon/badge stage for accordion chrome.
 * Advanced assignment statuses share `advanced_check` visuals (unchanged tokens).
 */
export function myWorkAccordionBadgeStage(
  stage: MyWorkAccordionStage,
): WorkflowBadgeStage {
  if (
    stage === 'linguist_check' ||
    stage === 'theological_check' ||
    stage === 'consultant_check'
  ) {
    return 'advanced_check';
  }
  return stage;
}

export function getMyWorkAccordionStageLabel(
  stage: MyWorkAccordionStage,
): string {
  return MY_WORK_STAGE_LABELS[stage];
}

/**
 * Within a stage: valid `stageEnteredAt` newest-first; null/invalid keep prior
 * query order; equal timestamps stay stable. Never sorts on lastActivity (#505).
 */
export function orderChaptersWithinStage(
  chapters: readonly MyWorkChapter[],
): MyWorkChapter[] {
  return chapters
    .map((chapter, index) => ({ chapter, index }))
    .sort((a, b) => {
      const aMs = stageEnteredAtMs(a.chapter.stageEnteredAt);
      const bMs = stageEnteredAtMs(b.chapter.stageEnteredAt);
      const aValid = aMs !== null;
      const bValid = bMs !== null;
      if (aValid && bValid && aMs !== bMs) {
        return bMs - aMs;
      }
      if (aValid !== bValid) {
        return aValid ? -1 : 1;
      }
      return a.index - b.index;
    })
    .map(entry => entry.chapter);
}

/**
 * Group My Work chapters into non-empty stage accordions.
 * Within each stage, order by `stageEnteredAt` newest-first (#505 / #457).
 */
export function groupMyWorkChaptersByStage(
  chapters: readonly MyWorkChapter[],
): MyWorkStageGroup[] {
  const byStage = new Map<MyWorkAccordionStage, MyWorkChapter[]>();

  for (const chapter of chapters) {
    const stage = myWorkAccordionStageForStatus(chapter.assignmentStatus);
    if (!stage) {
      continue;
    }
    const bucket = byStage.get(stage);
    if (bucket) {
      bucket.push(chapter);
    } else {
      byStage.set(stage, [chapter]);
    }
  }

  const groups: MyWorkStageGroup[] = [];
  for (const stage of MY_WORK_ACCORDION_STAGE_ORDER) {
    const stageChapters = byStage.get(stage);
    if (!stageChapters?.length) {
      continue;
    }
    groups.push({
      stage,
      label: getMyWorkAccordionStageLabel(stage),
      chapters: orderChaptersWithinStage(stageChapters),
    });
  }

  return groups;
}

export function myWorkStageAccordionTitle(
  label: string,
  count: number,
): string {
  return `${label} (${count})`;
}

export type MyWorkExpandedStagesState = {
  expanded: Set<MyWorkAccordionStage>;
  userTouched: Set<MyWorkAccordionStage>;
  didAutoExpandSole: boolean;
};

/** Expand the sole accordion; otherwise start collapsed (#505). */
export function initialExpandedMyWorkStages(
  groups: readonly MyWorkStageGroup[],
): Set<MyWorkAccordionStage> {
  if (groups.length === 1) {
    return new Set([groups[0].stage]);
  }
  return new Set();
}

/**
 * Reconcile accordion expand state after async load / refresh.
 * Preserves explicit user toggles; auto-expands a sole group once.
 */
export function reconcileExpandedMyWorkStages(
  groupStages: readonly MyWorkAccordionStage[],
  state: MyWorkExpandedStagesState,
): MyWorkExpandedStagesState {
  const present = new Set(groupStages);
  const expanded = new Set<MyWorkAccordionStage>();

  for (const stage of state.expanded) {
    if (present.has(stage)) {
      expanded.add(stage);
    }
  }

  let didAutoExpandSole = state.didAutoExpandSole;

  if (groupStages.length > 1) {
    didAutoExpandSole = false;
  } else if (groupStages.length === 1) {
    const sole = groupStages[0];
    if (!didAutoExpandSole && !state.userTouched.has(sole)) {
      expanded.add(sole);
      didAutoExpandSole = true;
    }
  }

  return {
    expanded,
    userTouched: state.userTouched,
    didAutoExpandSole,
  };
}

export function toggleMyWorkStageExpanded(
  stage: MyWorkAccordionStage,
  state: MyWorkExpandedStagesState,
): MyWorkExpandedStagesState {
  const expanded = new Set(state.expanded);
  if (expanded.has(stage)) {
    expanded.delete(stage);
  } else {
    expanded.add(stage);
  }
  const userTouched = new Set(state.userTouched);
  userTouched.add(stage);
  return {
    expanded,
    userTouched,
    didAutoExpandSole: state.didAutoExpandSole,
  };
}
