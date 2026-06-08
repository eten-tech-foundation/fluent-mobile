import { ProjectChapter } from '../types/db/types';
import { getMyWorkRowDisplay, MyWorkRowDisplay } from './myWorkRowDisplay';

export interface ProjectChapterRowDisplay extends MyWorkRowDisplay {
  showPhaseIcon: boolean;
}

export function getProjectChapterRowDisplay(
  chapter: ProjectChapter,
  isSyncing: boolean,
): ProjectChapterRowDisplay {
  return {
    ...getMyWorkRowDisplay(chapter, isSyncing),
    showPhaseIcon: chapter.workflowStage !== 'not_started',
  };
}
