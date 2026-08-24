import React from 'react';
import { render } from '@testing-library/react-native';
import { ProjectChapter } from '../../types/db/types';
import { ProjectChapterRow } from './ProjectChapterRow';

jest.mock('lucide-react-native', () => {
  const ReactNative = require('react-native');
  const Mock = () => <ReactNative.View />;
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
  };
});

const baseChapter: ProjectChapter = {
  id: 2,
  displayLabel: 'Mark 2',
  bookName: 'Mark',
  chapterNumber: 2,
  workflowStage: 'draft',
  syncState: 'synced',
  completedVerses: 2,
  totalVerses: 10,
  downloadedVerses: 10,
  hasConflict: false,
  lastActivityLabel: 'Today',
};

describe('ProjectChapterRow', () => {
  it('renders the conflict indicator when hasConflict', () => {
    const { getByTestId } = render(
      <ProjectChapterRow
        chapter={{ ...baseChapter, hasConflict: true }}
        onPress={jest.fn()}
      />,
    );

    expect(getByTestId('chapter-conflict-indicator')).toBeTruthy();
  });

  it('omits the conflict indicator when hasConflict is false', () => {
    const { queryByTestId } = render(
      <ProjectChapterRow chapter={baseChapter} onPress={jest.fn()} />,
    );

    expect(queryByTestId('chapter-conflict-indicator')).toBeNull();
  });
});
