import React from 'react';
import { render } from '@testing-library/react-native';
import { MyWorkChapter, ProjectChapter } from '../../types/db/types';
import {
  deriveChapterOwnershipState,
  resolveStageAssigneeId,
} from '../../utils/chapterOwnershipState';
import { MyWorkRow } from './MyWorkRow';
import { ProjectChapterRow } from './ProjectChapterRow';

jest.mock('lucide-react-native', () => {
  const ReactNative = require('react-native');
  const Mock = (props: { accessibilityLabel?: string }) => (
    <ReactNative.View accessibilityLabel={props.accessibilityLabel} />
  );
  return {
    CloudCheck: Mock,
    CloudUpload: Mock,
    ChevronRight: Mock,
    Users: Mock,
    TriangleAlert: Mock,
    Mic: Mock,
    UserCheck: Mock,
    UsersRound: Mock,
    BadgeCheck: Mock,
    Check: Mock,
    CircleCheck: Mock,
    User: Mock,
  };
});

jest.mock('./ChapterSyncIndicator', () => {
  const ReactNative = require('react-native');
  return {
    ChapterCloudSyncIndicator: () => (
      <ReactNative.View testID="chapter-cloud-sync-indicator" />
    ),
  };
});

/** Same derivation path as `queries` chapter row mapping. */
function ownershipFromStageRefresh(args: {
  status: string;
  assignedUserId: number;
  peerCheckerId: number;
  currentUserId: number;
}) {
  return deriveChapterOwnershipState(
    resolveStageAssigneeId(
      args.status,
      args.assignedUserId,
      args.peerCheckerId,
    ),
    args.currentUserId,
  );
}

const CURRENT_USER_ID = 10;
const DRAFTER_ID = 10;
const PEER_CHECKER_ID = 11;
const ASSIGNMENT_ID = 488;

describe('ownership stage refresh (same-instance clear)', () => {
  it('clears MyWorkRow mine icon after Draft→complete refresh with retained assignees', () => {
    const draftOwnership = ownershipFromStageRefresh({
      status: 'draft',
      assignedUserId: DRAFTER_ID,
      peerCheckerId: PEER_CHECKER_ID,
      currentUserId: CURRENT_USER_ID,
    });
    expect(draftOwnership).toBe('mine');

    const draftChapter: MyWorkChapter = {
      id: ASSIGNMENT_ID,
      displayLabel: '1 John 1',
      bookName: '1 John',
      chapterNumber: 1,
      workflowStage: 'draft',
      syncState: 'deviceOnly',
      ownershipState: draftOwnership,
      completedVerses: 1,
      totalVerses: 10,
      downloadedVerses: 10,
      hasConflict: false,
      lastActivityLabel: 'Yesterday',
      projectName: 'Demo',
      targetLanguageName: 'English',
    };

    const { getByTestId, queryByTestId, rerender } = render(
      <MyWorkRow chapter={draftChapter} onPress={jest.fn()} />,
    );

    expect(getByTestId(`my-work-row-${ASSIGNMENT_ID}`)).toBeTruthy();
    expect(getByTestId('chapter-ownership-mine')).toBeTruthy();

    const completeOwnership = ownershipFromStageRefresh({
      status: 'complete',
      assignedUserId: DRAFTER_ID,
      peerCheckerId: PEER_CHECKER_ID,
      currentUserId: CURRENT_USER_ID,
    });
    expect(completeOwnership).toBe('unassigned');

    rerender(
      <MyWorkRow
        chapter={{
          ...draftChapter,
          workflowStage: 'complete',
          ownershipState: completeOwnership,
        }}
        onPress={jest.fn()}
      />,
    );

    expect(getByTestId(`my-work-row-${ASSIGNMENT_ID}`)).toBeTruthy();
    expect(queryByTestId('chapter-ownership-mine')).toBeNull();
    expect(queryByTestId('chapter-ownership-other')).toBeNull();
  });

  it('clears ProjectChapterRow mine icon after Draft→community_review with retained assignees', () => {
    const draftOwnership = ownershipFromStageRefresh({
      status: 'draft',
      assignedUserId: DRAFTER_ID,
      peerCheckerId: PEER_CHECKER_ID,
      currentUserId: CURRENT_USER_ID,
    });
    expect(draftOwnership).toBe('mine');

    const draftChapter: ProjectChapter = {
      id: ASSIGNMENT_ID,
      displayLabel: '1 John 1',
      bookName: '1 John',
      chapterNumber: 1,
      workflowStage: 'draft',
      syncState: 'synced',
      ownershipState: draftOwnership,
      completedVerses: 2,
      totalVerses: 10,
      downloadedVerses: 10,
      hasConflict: false,
      lastActivityLabel: 'Today',
    };

    const { getByTestId, queryByTestId, rerender } = render(
      <ProjectChapterRow chapter={draftChapter} onPress={jest.fn()} />,
    );

    expect(getByTestId(`chapter-row-${ASSIGNMENT_ID}`)).toBeTruthy();
    expect(getByTestId('chapter-ownership-mine')).toBeTruthy();

    const communityOwnership = ownershipFromStageRefresh({
      status: 'community_review',
      assignedUserId: DRAFTER_ID,
      peerCheckerId: PEER_CHECKER_ID,
      currentUserId: CURRENT_USER_ID,
    });
    expect(communityOwnership).toBe('unassigned');

    rerender(
      <ProjectChapterRow
        chapter={{
          ...draftChapter,
          workflowStage: 'community_review',
          ownershipState: communityOwnership,
        }}
        onPress={jest.fn()}
      />,
    );

    expect(getByTestId(`chapter-row-${ASSIGNMENT_ID}`)).toBeTruthy();
    expect(queryByTestId('chapter-ownership-mine')).toBeNull();
    expect(queryByTestId('chapter-ownership-other')).toBeNull();
  });
});
