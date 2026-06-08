import { ChapterSyncState, WorkflowBadgeStage } from '../types/db/types';
import { verseProgressRatio } from './verseProgress';

export interface ChapterRowDisplaySource {
  workflowStage: WorkflowBadgeStage | null;
  syncState: ChapterSyncState;
  lastActivityLabel?: string;
  downloadedVerses: number;
  totalVerses: number;
}

export interface MyWorkRowDisplay {
  showCloudSync: boolean;
  showActivityDate: boolean;
  showProgressRing: boolean;
  progressRingIndeterminate: boolean;
}

export function getMyWorkRowDisplay(
  chapter: ChapterRowDisplaySource,
  isSyncing: boolean,
): MyWorkRowDisplay {
  const isNotStarted = chapter.workflowStage === 'not_started';
  const downloadRatio = verseProgressRatio(
    chapter.downloadedVerses,
    chapter.totalVerses,
  );

  return {
    showCloudSync: !isNotStarted && chapter.syncState !== 'none',
    showActivityDate: !isNotStarted && Boolean(chapter.lastActivityLabel),
    showProgressRing: isNotStarted,
    progressRingIndeterminate: isSyncing && downloadRatio === 0,
  };
}
