import { ProjectChapter } from '../types/db/types';
import { getProjectChapterRowDisplay } from './projectChapterRowDisplay';

const baseChapter: ProjectChapter = {
  id: 1,
  displayLabel: 'Luke 1',
  bookName: 'Luke',
  chapterNumber: 1,
  workflowStage: 'complete',
  syncState: 'synced',
  completedVerses: 5,
  totalVerses: 5,
  downloadedVerses: 5,
  lastActivityLabel: 'Apr 14, 2026',
};

describe('getProjectChapterRowDisplay', () => {
  it('shows phase icon, cloud sync, and activity date for active stages', () => {
    expect(getProjectChapterRowDisplay(baseChapter, false)).toEqual({
      showPhaseIcon: true,
      showCloudSync: true,
      showActivityDate: true,
      showProgressRing: false,
      progressRingIndeterminate: false,
    });
  });

  it('hides phase icon and shows progress ring for not started', () => {
    const chapter: ProjectChapter = {
      ...baseChapter,
      workflowStage: 'not_started',
      syncState: 'none',
      lastActivityLabel: undefined,
      downloadedVerses: 0,
      totalVerses: 10,
    };

    expect(getProjectChapterRowDisplay(chapter, false)).toEqual({
      showPhaseIcon: false,
      showCloudSync: false,
      showActivityDate: false,
      showProgressRing: true,
      progressRingIndeterminate: false,
    });
  });

  it('marks progress ring indeterminate while syncing with no downloads', () => {
    const chapter: ProjectChapter = {
      ...baseChapter,
      workflowStage: 'not_started',
      syncState: 'none',
      downloadedVerses: 0,
      totalVerses: 10,
    };

    expect(getProjectChapterRowDisplay(chapter, true)).toEqual({
      showPhaseIcon: false,
      showCloudSync: false,
      showActivityDate: false,
      showProgressRing: true,
      progressRingIndeterminate: true,
    });
  });
});
