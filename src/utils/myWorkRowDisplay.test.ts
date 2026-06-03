import { MyWorkChapter } from '../types/db/types';
import { getMyWorkRowDisplay } from './myWorkRowDisplay';

const baseChapter: MyWorkChapter = {
  id: 1,
  displayLabel: 'Luke 4',
  bookName: 'Luke',
  chapterNumber: 4,
  workflowStage: 'draft',
  syncState: 'synced',
  completedVerses: 0,
  totalVerses: 5,
  downloadedVerses: 5,
  lastActivityLabel: 'Jun 1, 2024',
  projectName: 'Gospel of Luke',
  targetLanguageName: 'Baka',
};

describe('getMyWorkRowDisplay', () => {
  it('shows cloud sync and date for in-progress chapters', () => {
    expect(getMyWorkRowDisplay(baseChapter, false)).toEqual({
      showCloudSync: true,
      showActivityDate: true,
      showProgressRing: false,
      progressRingIndeterminate: false,
    });
  });

  it('shows progress ring for not started chapters without a date', () => {
    const chapter: MyWorkChapter = {
      ...baseChapter,
      workflowStage: 'not_started',
      syncState: 'none',
      lastActivityLabel: undefined,
      downloadedVerses: 0,
    };

    expect(getMyWorkRowDisplay(chapter, true)).toEqual({
      showCloudSync: false,
      showActivityDate: false,
      showProgressRing: true,
      progressRingIndeterminate: true,
    });
  });
});
