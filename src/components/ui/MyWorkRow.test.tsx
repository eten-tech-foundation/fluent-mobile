import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { MyWorkChapter } from '../../types/db/types';
import { MyWorkRow } from './MyWorkRow';

jest.mock('lucide-react-native', () => {
  const ReactNative = require('react-native');
  const Mock = () => <ReactNative.View />;
  return {
    CloudCheck: Mock,
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
      <ReactNative.View testID="chapter-ownership-indicator" />
    ),
  };
});

const baseChapter: MyWorkChapter = {
  id: 1,
  displayLabel: 'Mark 1',
  bookName: 'Mark',
  chapterNumber: 1,
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
};

describe('MyWorkRow', () => {
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

  it('renders indicators in the shared cloud, conflict, ownership order', () => {
    const { getAllByTestId } = render(
      <MyWorkRow
        chapter={{ ...baseChapter, hasConflict: true }}
        onPress={jest.fn()}
      />,
    );

    expect(
      getAllByTestId(/-indicator$/).map(node => node.props.testID),
    ).toEqual([
      'chapter-cloud-sync-indicator',
      'chapter-conflict-indicator',
      'chapter-ownership-indicator',
    ]);
  });
});
