import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import PassageScreen from './PassageScreen';
import type { Passage, PassageDownload } from '../../../hooks/usePassage';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDownload = jest.fn();
let mockPassage: Passage = { status: 'loading' };
let mockDownloadState: PassageDownload = 'idle';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({
    chapterId: '5',
    anchorVerse: '22',
    projectUnitId: '3',
    chapterName: 'Mark 14',
    projectName: 'Mark Telugu',
    language: 'Telugu',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-gesture-handler', () => {
  const pan = {
    enabled: () => pan,
    activeOffsetY: () => pan,
    onUpdate: () => pan,
    onEnd: () => pan,
  };
  return {
    Gesture: { Pan: () => pan },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('../../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

jest.mock('../../../hooks/useHaptics', () => ({
  useHaptics: () => ({ press: jest.fn(), toggle: jest.fn() }),
}));

jest.mock('../../../hooks/usePassage', () => ({
  usePassage: () => ({
    passage: mockPassage,
    download: mockDownload,
    downloadState: mockDownloadState,
    reload: jest.fn(),
  }),
}));

const ready: Passage = {
  status: 'ready',
  title: 'The Last Supper',
  reference: 'Mark 14:22–25',
  verses: [
    { chapterNumber: 14, verseNumber: 22, text: 'While they were eating' },
    { chapterNumber: 14, verseNumber: 23, text: 'Then he took a cup' },
  ],
  downloaded: true,
  recordedStatus: 'recorded',
  takes: [
    { id: 'a', takeNumber: 1, selected: false },
    { id: 'b', takeNumber: 2, selected: true },
  ],
};

const hidden = { includeHiddenElements: true };

describe('PassageScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPassage = ready;
    mockDownloadState = 'idle';
  });

  it('puts the script, its actions and takes in the hero, then the steps', () => {
    render(<PassageScreen />);

    expect(
      screen.getByRole('header', { name: 'The Last Supper' }),
    ).toBeTruthy();
    expect(screen.getAllByText('Mark 14:22–25').length).toBeGreaterThan(1);
    expect(screen.getByLabelText('Listen')).toBeTruthy();
    expect(screen.getByLabelText('Record a take')).toBeTruthy();
    expect(screen.getByLabelText('2 takes, take 2 selected')).toBeTruthy();
    expect(screen.getByText('Listening materials')).toBeTruthy();
    expect(screen.getByText('Hear & Heart')).toBeTruthy();
    expect(screen.getByLabelText('Play Hear & Heart')).toBeTruthy();
  });

  it('opens the player in Record mode, whose keys open drafting', () => {
    render(<PassageScreen />);

    fireEvent.press(screen.getByTestId('passage-record'));
    fireEvent.press(screen.getByLabelText('Record in drafting'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/(stack)/verse-detail',
        params: expect.objectContaining({
          chapterId: '5',
          chapterName: 'Mark 14',
          recoverVerse: '22',
        }),
      }),
    );
  });

  it('opens the player in Listen mode', () => {
    render(<PassageScreen />);

    fireEvent.press(screen.getByTestId('passage-listen'));

    expect(screen.getByLabelText('Listen in drafting')).toBeTruthy();
    expect(screen.getByLabelText('Close the player')).toBeTruthy();
  });

  it('closes the player before leaving the page', () => {
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));

    expect(screen.queryByTestId('passage-back')).toBeNull();
    fireEvent.press(screen.getByTestId('passage-close'));
    expect(mockBack).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('passage-back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it("offers a download when the text isn't on the phone", () => {
    mockPassage = { ...ready, downloaded: false, verses: [] };

    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-download'));

    expect(mockDownload).toHaveBeenCalled();
    expect(screen.queryByTestId('passage-script', hidden)).toBeNull();
  });
});
