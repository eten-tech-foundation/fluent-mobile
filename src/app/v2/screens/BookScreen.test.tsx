import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import BookScreen from './BookScreen';
import type { BookPassages } from '../../../hooks/useBookPassages';
import type { ProjectChapter } from '../../../types/db/types';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockRetry = jest.fn();
let mockChapters: ProjectChapter[] = [];
let mockLoadState = { loading: false, error: null as unknown, removed: false };
let mockPassages: BookPassages = { status: 'loading' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({
    projectId: '9',
    projectUnitId: '3',
    projectName: 'Mark Telugu',
    milestoneName: 'Gospels Phase 1',
    language: 'Telugu',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

jest.mock('../../../hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => false,
}));

jest.mock('../../../hooks/useMilestoneChapters', () => ({
  useMilestoneChapters: () => ({
    chapters: mockChapters,
    loading: mockLoadState.loading,
    refreshing: false,
    error: mockLoadState.error,
    removedFromProject: mockLoadState.removed,
    refresh: jest.fn(),
    retry: mockRetry,
    reload: jest.fn(),
  }),
}));

jest.mock('../../../hooks/useBookPassages', () => ({
  useBookPassages: () => mockPassages,
}));

function chapter(id: number, chapterNumber: number, bookName = 'Mark') {
  return {
    id,
    displayLabel: `${bookName} ${chapterNumber}`,
    bookName,
    chapterNumber,
  } as ProjectChapter;
}

describe('BookScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadState = { loading: false, error: null, removed: false };
    mockChapters = [chapter(1, 14), chapter(2, 15)];
    mockPassages = {
      status: 'ready',
      byChapter: new Map([
        [
          1,
          [
            {
              key: 'pericope::1',
              title: 'The Last Supper',
              reference: 'Mark 14:22–25',
              verses: '22–25',
              anchorVerse: 22,
              recordedStatus: 'recorded',
            },
            {
              key: 'pericope::2',
              title: null,
              reference: 'Mark 14:26–31',
              verses: '26–31',
              anchorVerse: 26,
              recordedStatus: 'none',
            },
          ],
        ],
        [
          2,
          [
            {
              key: 'pericope::3',
              title: 'Jesus Before Pilate',
              reference: 'Mark 15:1–5',
              verses: '1–5',
              anchorVerse: 1,
              recordedStatus: 'partial',
            },
          ],
        ],
      ]),
    };
  });

  it('names the book and groups passages under their chapters', () => {
    render(<BookScreen />);

    expect(screen.getByText('Mark')).toBeTruthy();
    expect(screen.getByText('Chapter 14')).toBeTruthy();
    expect(screen.getByText('1 of 2 recorded')).toBeTruthy();
    expect(screen.getByText('Chapter 15')).toBeTruthy();
    expect(screen.getByText('1 of 3 passages recorded')).toBeTruthy();
    expect(
      screen.getByLabelText('The Last Supper, Mark 14:22–25, Recorded'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Mark 14:26–31, Not recorded yet'),
    ).toBeTruthy();
  });

  it('uses the milestone name when it spans books', () => {
    mockChapters = [chapter(1, 14), chapter(2, 1, 'Luke')];

    render(<BookScreen />);

    expect(screen.getByText('Gospels Phase 1')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Mark 14' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Luke 1' })).toBeTruthy();
  });

  it('opens drafting at the first verse of the passage', () => {
    render(<BookScreen />);

    fireEvent.press(screen.getByTestId('book-passage-1-pericope::1'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/(stack)/verse-detail',
        params: expect.objectContaining({
          chapterId: '1',
          chapterName: 'Mark 14',
          recoverVerse: '22',
        }),
      }),
    );
  });

  it('offers a retry when the chapters fail to load', () => {
    mockLoadState = {
      loading: false,
      error: new Error('nope'),
      removed: false,
    };

    render(<BookScreen />);
    fireEvent.press(screen.getByTestId('book-retry'));

    expect(mockRetry).toHaveBeenCalled();
  });

  it('goes back', () => {
    render(<BookScreen />);

    fireEvent.press(screen.getByLabelText('Back'));

    expect(mockBack).toHaveBeenCalled();
  });
});
