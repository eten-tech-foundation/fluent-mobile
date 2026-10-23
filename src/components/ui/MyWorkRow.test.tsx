import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { MyWorkChapter } from '../../types/db/types';
import { getActiveUserId } from '../../services/storage';
import { parseUserId } from '../../utils/parseUserId';
import { hasProjectObserverGrant } from '../../services/userOrgGrants';
import { MyWorkRow } from './MyWorkRow';

const mockStart = jest.fn();
const mockUseDraftDownload = jest.fn();

jest.mock('../../hooks/useDraftDownload', () => ({
  useDraftDownload: (...args: unknown[]) => mockUseDraftDownload(...args),
}));

jest.mock('../../services/storage', () => ({
  getActiveUserId: jest.fn(),
}));

jest.mock('../../utils/parseUserId', () => ({
  parseUserId: jest.fn(),
}));

jest.mock('../../services/userOrgGrants', () => ({
  hasProjectObserverGrant: jest.fn(() => false),
}));

jest.mock('lucide-react-native', () => {
  const ReactNative = require('react-native');
  const Mock = () => <ReactNative.View />;
  return {
    CloudCheck: Mock,
    CloudOff: Mock,
    CloudUpload: Mock,
    ChevronRight: Mock,
    Users: Mock,
    TriangleAlert: Mock,
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

jest.mock('./ChapterOwnershipIndicator', () => {
  const ReactNative = require('react-native');
  return {
    ChapterOwnershipIndicator: () => (
      <ReactNative.View testID="chapter-ownership-mine" />
    ),
  };
});

jest.mock('./DraftDownloadChip', () => {
  const ReactNative = require('react-native');
  return {
    DraftDownloadChip: ({
      onPress,
      testID,
    }: {
      onPress: () => void;
      testID?: string;
    }) => (
      <ReactNative.Pressable testID={testID} onPress={onPress}>
        <ReactNative.View />
      </ReactNative.Pressable>
    ),
  };
});

const mockGetActiveUserId = getActiveUserId as jest.MockedFunction<
  typeof getActiveUserId
>;
const mockParseUserId = parseUserId as jest.MockedFunction<typeof parseUserId>;

const baseChapter: MyWorkChapter = {
  id: 1,
  displayLabel: 'Mark 1',
  bookName: 'Mark',
  chapterNumber: 1,
  assignmentStatus: 'draft',
  workflowStage: 'draft',
  syncState: 'deviceOnly',
  ownershipState: 'mine',
  completedVerses: 1,
  totalVerses: 10,
  downloadedVerses: 10,
  hasConflict: false,
  lastActivityLabel: 'Yesterday',
  projectName: 'Demo',
  targetLanguageName: 'English',
  projectUnitId: 11,
  projectId: 3,
  bibleId: 5,
  bookId: 41,
  bookCode: 'MRK',
  assignedUserId: 7,
  peerCheckerId: null,
};

const peerChapter: MyWorkChapter = {
  ...baseChapter,
  id: 2,
  displayLabel: 'Mark 2',
  chapterNumber: 2,
  assignmentStatus: 'peer_check',
  workflowStage: 'peer_check',
  assignedUserId: 9,
  peerCheckerId: 7,
};

const peerRequest = {
  chapterAssignmentId: 2,
  projectUnitId: 11,
  projectId: 3,
  userId: 7,
  bibleId: 5,
  bookId: 41,
  bookCode: 'MRK',
  chapterNumber: 2,
  role: 'peer_check' as const,
};

describe('MyWorkRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveUserId.mockReturnValue('7');
    mockParseUserId.mockReturnValue(7);
    mockStart.mockResolvedValue({ ok: true });
    mockUseDraftDownload.mockReturnValue({
      state: {
        chapterAssignmentId: 0,
        role: 'peer_check',
        status: 'idle',
        phase: 'idle',
        progress: 0,
        readyAtMs: null,
      },
      start: mockStart,
      refresh: jest.fn(),
    });
  });

  it('renders the conflict indicator beside cloud sync when hasConflict', () => {
    const onPress = jest.fn();
    const { getByTestId, getByText } = render(
      <MyWorkRow
        chapter={{ ...baseChapter, hasConflict: true }}
        onPress={onPress}
      />,
    );

    expect(getByText('Mark 1')).toBeTruthy();
    expect(getByTestId('chapter-conflict-indicator')).toBeTruthy();
    fireEvent.press(getByText('Mark 1'));
    expect(onPress).toHaveBeenCalled();
  });

  it('omits the conflict indicator when hasConflict is false', () => {
    const { queryByTestId } = render(
      <MyWorkRow chapter={baseChapter} onPress={jest.fn()} />,
    );

    expect(queryByTestId('chapter-conflict-indicator')).toBeNull();
  });

  it('shows only the conflict indicator when both conflict and ownership apply', () => {
    const { getAllByTestId, queryByTestId } = render(
      <MyWorkRow
        chapter={{ ...baseChapter, hasConflict: true }}
        onPress={jest.fn()}
      />,
    );

    expect(
      getAllByTestId(/-indicator$/).map(node => node.props.testID),
    ).toEqual(['chapter-cloud-sync-indicator', 'chapter-conflict-indicator']);
    expect(queryByTestId('chapter-ownership-mine')).toBeNull();
  });

  it('shows the ownership indicator when there is no conflict', () => {
    const { getAllByTestId } = render(
      <MyWorkRow chapter={baseChapter} onPress={jest.fn()} />,
    );

    expect(
      getAllByTestId(/chapter-(cloud-sync|ownership)-/).map(
        node => node.props.testID,
      ),
    ).toEqual(['chapter-cloud-sync-indicator', 'chapter-ownership-mine']);
  });

  it('does not render the workflow status badge on the row', () => {
    const { queryByText, getByText } = render(
      <MyWorkRow chapter={baseChapter} onPress={jest.fn()} />,
    );

    expect(getByText('Mark 1')).toBeTruthy();
    expect(getByText('Yesterday')).toBeTruthy();
    expect(queryByText('Draft')).toBeNull();
  });

  it('keeps a stable chip column and omits the chip when ineligible', () => {
    const { getByTestId, queryByTestId } = render(
      <MyWorkRow chapter={baseChapter} onPress={jest.fn()} />,
    );

    expect(getByTestId('my-work-row-chip-column-1')).toBeTruthy();
    expect(queryByTestId('my-work-draft-download-1')).toBeNull();
    expect(mockUseDraftDownload).toHaveBeenCalledWith(null);
  });

  it('wires the download chip for assigned peer_check without auto-start or row navigation', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <MyWorkRow chapter={peerChapter} onPress={onPress} />,
    );

    expect(mockUseDraftDownload).toHaveBeenCalledWith(peerRequest);
    expect(mockStart).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('my-work-draft-download-2'));
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('nulls the download hook after account switch leaves a stale peer row', () => {
    const { rerender, queryByTestId } = render(
      <MyWorkRow chapter={peerChapter} onPress={jest.fn()} />,
    );

    expect(mockUseDraftDownload).toHaveBeenLastCalledWith(peerRequest);
    expect(queryByTestId('my-work-draft-download-2')).toBeTruthy();

    mockGetActiveUserId.mockReturnValue('8');
    mockParseUserId.mockReturnValue(8);
    rerender(<MyWorkRow chapter={peerChapter} onPress={jest.fn()} />);

    expect(mockUseDraftDownload).toHaveBeenLastCalledWith(null);
    expect(queryByTestId('my-work-draft-download-2')).toBeNull();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('nulls the download hook when synced id drifts from active account', () => {
    mockGetActiveUserId.mockReturnValue('8');
    mockParseUserId.mockReturnValue(7);

    const { queryByTestId } = render(
      <MyWorkRow chapter={peerChapter} onPress={jest.fn()} />,
    );

    expect(mockUseDraftDownload).toHaveBeenCalledWith(null);
    expect(queryByTestId('my-work-draft-download-2')).toBeNull();
  });

  it('nulls the download hook when peer is assigned to another user', () => {
    const { queryByTestId } = render(
      <MyWorkRow
        chapter={{
          ...peerChapter,
          peerCheckerId: 9,
        }}
        onPress={jest.fn()}
      />,
    );

    expect(mockUseDraftDownload).toHaveBeenCalledWith(null);
    expect(queryByTestId('my-work-draft-download-2')).toBeNull();
  });

  it('nulls download hook on review stage without observer grant', () => {
    (hasProjectObserverGrant as jest.Mock).mockReturnValue(false);
    const { rerender, queryByTestId } = render(
      <MyWorkRow chapter={peerChapter} onPress={jest.fn()} />,
    );
    expect(mockUseDraftDownload).toHaveBeenLastCalledWith(peerRequest);

    rerender(
      <MyWorkRow
        chapter={{
          ...peerChapter,
          assignmentStatus: 'community_review',
        }}
        onPress={jest.fn()}
      />,
    );

    expect(mockUseDraftDownload).toHaveBeenLastCalledWith(null);
    expect(queryByTestId('my-work-draft-download-2')).toBeNull();
  });
});
