import { MyWorkChapter } from '../types/db/types';
import {
  groupMyWorkChaptersByStage,
  initialExpandedMyWorkStages,
  MY_WORK_ACCORDION_STAGE_ORDER,
  reconcileExpandedMyWorkStages,
  toggleMyWorkStageExpanded,
} from './myWorkStageGroups';

function chapter(
  overrides: Partial<MyWorkChapter> &
    Pick<MyWorkChapter, 'id' | 'assignmentStatus'>,
): MyWorkChapter {
  return {
    displayLabel: `Ch ${overrides.id}`,
    bookName: 'Luke',
    chapterNumber: overrides.id,
    workflowStage: null,
    syncState: 'none',
    ownershipState: 'mine',
    completedVerses: 0,
    totalVerses: 1,
    downloadedVerses: 0,
    hasConflict: false,
    projectName: 'Demo',
    targetLanguageName: 'English',
    projectUnitId: 11,
    projectId: 3,
    bibleId: 5,
    bookId: 42,
    bookCode: 'LUK',
    assignedUserId: null,
    peerCheckerId: null,
    ...overrides,
  };
}

describe('myWorkStageGroups', () => {
  it('orders six raw-status groups in workflow order with distinct advanced stages', () => {
    const chapters = [
      chapter({ id: 1, assignmentStatus: 'consultant_check' }),
      chapter({ id: 2, assignmentStatus: 'draft' }),
      chapter({ id: 3, assignmentStatus: 'linguist_check' }),
      chapter({ id: 4, assignmentStatus: 'peer_check' }),
      chapter({ id: 5, assignmentStatus: 'theological_check' }),
      chapter({ id: 6, assignmentStatus: 'community_review' }),
      chapter({ id: 7, assignmentStatus: 'linguist_check' }),
    ];

    const groups = groupMyWorkChaptersByStage(chapters);

    expect(groups.map(group => group.stage)).toEqual([
      ...MY_WORK_ACCORDION_STAGE_ORDER,
    ]);
    expect(groups.map(group => group.label)).toEqual([
      'Drafting',
      'Peer Check',
      'Community Review',
      'Linguist Check',
      'Theologian Check',
      'Consultant Check',
    ]);
    expect(
      groups
        .find(group => group.stage === 'linguist_check')
        ?.chapters.map(item => item.id),
    ).toEqual([3, 7]);
  });

  it('keeps not_started chapters visible under Drafting', () => {
    const groups = groupMyWorkChaptersByStage([
      chapter({ id: 1, assignmentStatus: 'not_started' }),
      chapter({ id: 2, assignmentStatus: 'draft' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].stage).toBe('draft');
    expect(groups[0].chapters.map(item => item.id)).toEqual([1, 2]);
  });

  it('preserves within-group query order without activity sorting', () => {
    const groups = groupMyWorkChaptersByStage([
      chapter({
        id: 2,
        assignmentStatus: 'draft',
        lastActivityAt: '2024-01-01T00:00:00Z',
      }),
      chapter({
        id: 1,
        assignmentStatus: 'draft',
        lastActivityAt: '2025-01-01T00:00:00Z',
      }),
    ]);

    expect(groups[0].chapters.map(item => item.id)).toEqual([2, 1]);
  });

  it('starts multi-group accordions collapsed and sole group expanded', () => {
    const multi = groupMyWorkChaptersByStage([
      chapter({ id: 1, assignmentStatus: 'draft' }),
      chapter({ id: 2, assignmentStatus: 'peer_check' }),
    ]);
    const sole = groupMyWorkChaptersByStage([
      chapter({ id: 1, assignmentStatus: 'draft' }),
    ]);

    expect([...initialExpandedMyWorkStages(multi)]).toEqual([]);
    expect([...initialExpandedMyWorkStages(sole)]).toEqual(['draft']);
  });

  it('auto-expands a sole group once and honors user collapse across refresh', () => {
    let state = reconcileExpandedMyWorkStages(['draft'], {
      expanded: new Set(),
      userTouched: new Set(),
      didAutoExpandSole: false,
    });
    expect([...state.expanded]).toEqual(['draft']);
    expect(state.didAutoExpandSole).toBe(true);

    state = toggleMyWorkStageExpanded('draft', state);
    expect([...state.expanded]).toEqual([]);

    state = reconcileExpandedMyWorkStages(['draft'], state);
    expect([...state.expanded]).toEqual([]);
    expect(state.userTouched.has('draft')).toBe(true);
  });

  it('keeps multi-group collapsed until toggled and preserves toggles on refresh', () => {
    let state = reconcileExpandedMyWorkStages(['draft', 'peer_check'], {
      expanded: new Set(),
      userTouched: new Set(),
      didAutoExpandSole: false,
    });
    expect([...state.expanded]).toEqual([]);

    state = toggleMyWorkStageExpanded('peer_check', state);
    expect([...state.expanded]).toEqual(['peer_check']);

    state = reconcileExpandedMyWorkStages(['draft', 'peer_check'], state);
    expect([...state.expanded]).toEqual(['peer_check']);
  });
});
