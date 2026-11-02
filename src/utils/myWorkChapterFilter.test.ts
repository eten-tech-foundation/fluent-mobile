import {
  buildMyWorkChapterFilter,
  classifyMyWorkListAccess,
  getMyWorkChapterQueryParams,
  isEligibleOpenPeerCheckNonDrafter,
  MY_WORK_CHAPTER_STATUSES,
  MY_WORK_OBSERVER_REVIEW_STATUSES,
  normalizeMyWorkGrantProjectIds,
} from './myWorkChapterFilter';

describe('myWorkChapterFilter', () => {
  it('binds not_started and draft to assignee and peer_check to peer checker', () => {
    expect(getMyWorkChapterQueryParams(42)).toEqual([
      MY_WORK_CHAPTER_STATUSES.NOT_STARTED,
      MY_WORK_CHAPTER_STATUSES.DRAFT,
      42,
      MY_WORK_CHAPTER_STATUSES.PEER_CHECK,
      42,
    ]);
  });

  it('keeps assigned-only SQL when grant and translator project IDs are empty/unknown', () => {
    const filter = buildMyWorkChapterFilter(7, [], []);
    expect(filter.whereSql).toContain('ca.assigned_user_id = ?');
    expect(filter.whereSql).toContain('ca.peer_checker_id = ?');
    expect(filter.whereSql).not.toContain('user_projects');
    expect(filter.whereSql).not.toContain('community_review');
    expect(filter.whereSql).not.toContain('peer_checker_id IS NULL');
    expect(filter.whereSql).toContain('stage_advance_queue');
    expect(filter.params).toEqual([...getMyWorkChapterQueryParams(7), 7]);
  });

  it('adds Observer review statuses with pu.project_id IN and user_projects membership', () => {
    const filter = buildMyWorkChapterFilter(7, [100, 100, -1, 0, 200]);

    expect(normalizeMyWorkGrantProjectIds([100, 100, -1, 0, 200])).toEqual([
      100, 200,
    ]);
    expect(filter.whereSql).toContain('pu.project_id IN (?, ?)');
    expect(filter.whereSql).toContain('FROM user_projects up');
    expect(filter.whereSql).toContain('up.user_id = ?');
    expect(filter.whereSql).toContain('up.project_id = pu.project_id');
    expect(filter.whereSql.startsWith('(')).toBe(true);

    expect(filter.params).toEqual([
      MY_WORK_CHAPTER_STATUSES.NOT_STARTED,
      MY_WORK_CHAPTER_STATUSES.DRAFT,
      7,
      MY_WORK_CHAPTER_STATUSES.PEER_CHECK,
      7,
      ...MY_WORK_OBSERVER_REVIEW_STATUSES,
      100,
      200,
      7,
      7,
    ]);
  });

  it('adds open Peer Check branch with translator project IDs and membership', () => {
    const filter = buildMyWorkChapterFilter(7, [], [3, 3, -1, 9]);

    expect(filter.whereSql).toContain('ca.peer_checker_id IS NULL');
    expect(filter.whereSql).toContain('ca.assigned_user_id IS NOT NULL');
    expect(filter.whereSql).toContain('ca.assigned_user_id != ?');
    expect(filter.whereSql).toContain('pu.project_id IN (?, ?)');
    expect(filter.whereSql).toContain('FROM user_projects up');
    expect(filter.params).toEqual([
      MY_WORK_CHAPTER_STATUSES.NOT_STARTED,
      MY_WORK_CHAPTER_STATUSES.DRAFT,
      7,
      MY_WORK_CHAPTER_STATUSES.PEER_CHECK,
      7,
      MY_WORK_CHAPTER_STATUSES.PEER_CHECK,
      7,
      3,
      9,
      7,
      7,
    ]);
  });

  it('mirrors open Peer Check non-drafter semantics without stage imports', () => {
    expect(
      isEligibleOpenPeerCheckNonDrafter(
        {
          status: 'peer_check',
          assignedUserId: 9,
          peerCheckerId: null,
        },
        7,
      ),
    ).toBe(true);
    expect(
      isEligibleOpenPeerCheckNonDrafter(
        {
          status: 'peer_check',
          assignedUserId: 7,
          peerCheckerId: undefined,
        },
        7,
      ),
    ).toBe(false);
    expect(
      isEligibleOpenPeerCheckNonDrafter(
        {
          status: 'peer_check',
          assignedUserId: 9,
          peerCheckerId: 20,
        },
        7,
      ),
    ).toBe(false);
    expect(
      isEligibleOpenPeerCheckNonDrafter(
        {
          status: 'peer_check',
          assignedUserId: undefined,
          peerCheckerId: null,
        },
        7,
      ),
    ).toBe(false);
  });

  it('classifies assigned, open_peer, and grant-verified Observer rows', () => {
    expect(
      classifyMyWorkListAccess({
        userId: 7,
        assignmentStatus: 'draft',
        assignedUserId: 7,
        peerCheckerId: null,
        projectId: 3,
        grantProjectIds: [],
      }),
    ).toBe('assigned');

    expect(
      classifyMyWorkListAccess({
        userId: 7,
        assignmentStatus: 'peer_check',
        assignedUserId: 9,
        peerCheckerId: 7,
        projectId: 3,
        grantProjectIds: [3],
        translatorProjectIds: [3],
      }),
    ).toBe('assigned');

    expect(
      classifyMyWorkListAccess({
        userId: 7,
        assignmentStatus: 'peer_check',
        assignedUserId: 9,
        peerCheckerId: null,
        projectId: 3,
        grantProjectIds: [],
        translatorProjectIds: [3],
      }),
    ).toBe('open_peer');

    expect(
      classifyMyWorkListAccess({
        userId: 7,
        assignmentStatus: 'peer_check',
        assignedUserId: 7,
        peerCheckerId: null,
        projectId: 3,
        grantProjectIds: [],
        translatorProjectIds: [3],
      }),
    ).toBeNull();

    expect(
      classifyMyWorkListAccess({
        userId: 7,
        assignmentStatus: 'peer_check',
        assignedUserId: 7,
        peerCheckerId: null,
        projectId: 3,
        grantProjectIds: [],
        translatorProjectIds: [3],
        hasPendingStageAdvance: true,
      }),
    ).toBe('assigned');

    // Flag alone never grants access to someone who is not the drafter.
    expect(
      classifyMyWorkListAccess({
        userId: 7,
        assignmentStatus: 'peer_check',
        assignedUserId: 9,
        peerCheckerId: 20,
        projectId: 3,
        grantProjectIds: [],
        translatorProjectIds: [],
        hasPendingStageAdvance: true,
      }),
    ).toBeNull();

    expect(
      classifyMyWorkListAccess({
        userId: 7,
        assignmentStatus: 'peer_check',
        assignedUserId: 9,
        peerCheckerId: null,
        projectId: 3,
        grantProjectIds: [],
        translatorProjectIds: [],
      }),
    ).toBeNull();

    expect(
      classifyMyWorkListAccess({
        userId: 7,
        assignmentStatus: 'peer_check',
        assignedUserId: 9,
        peerCheckerId: null,
        projectId: 3,
        grantProjectIds: [3],
        translatorProjectIds: [],
      }),
    ).toBeNull();

    expect(
      classifyMyWorkListAccess({
        userId: 7,
        assignmentStatus: 'community_review',
        assignedUserId: null,
        peerCheckerId: null,
        projectId: 3,
        grantProjectIds: [3],
      }),
    ).toBe('observer');

    expect(
      classifyMyWorkListAccess({
        userId: 7,
        assignmentStatus: 'community_review',
        assignedUserId: null,
        peerCheckerId: null,
        projectId: 3,
        grantProjectIds: [],
      }),
    ).toBeNull();

    expect(
      classifyMyWorkListAccess({
        userId: 7,
        assignmentStatus: 'community_review',
        assignedUserId: null,
        peerCheckerId: null,
        projectId: 99,
        grantProjectIds: [3],
      }),
    ).toBeNull();
  });
});
