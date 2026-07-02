import React from 'react';
import { Alert } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { RecordTab } from './RecordTab';
import type { VerseData } from '../../../types/db/types';

const mockUseVerseRecorder = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    addListener: jest.fn(() => jest.fn()),
    dispatch: jest.fn(),
    goBack: jest.fn(),
  }),
}));

jest.mock('../../../hooks/useVerseRecorder', () => ({
  useVerseRecorder: (args: unknown) => mockUseVerseRecorder(args),
}));

const VERSES: VerseData[] = [
  { bibleId: 1, bookId: 41, chapterNumber: 14, verseNumber: 1, text: 'v1' },
  { bibleId: 1, bookId: 41, chapterNumber: 14, verseNumber: 2, text: 'v2' },
  { bibleId: 1, bookId: 41, chapterNumber: 14, verseNumber: 3, text: 'v3' },
];

function baseRecorderState() {
  return {
    status: 'idle' as const,
    elapsedMs: 0,
    permission: 'granted' as const,
    currentRecording: null,
    isReady: true,
    isPlaying: false,
    requestPermission: jest
      .fn()
      .mockResolvedValue({ granted: true, canAskAgain: true }),
    start: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    reRecord: jest.fn().mockResolvedValue(undefined),
    deleteCurrent: jest.fn().mockResolvedValue(undefined),
    discardPaused: jest.fn().mockResolvedValue(undefined),
    togglePlayback: jest.fn().mockResolvedValue(undefined),
    stopPlayback: jest.fn(),
  };
}

function reviewRecording() {
  return {
    id: 'rec-1',
    bibleTextId: 42,
    localFilePath: '/tmp/rec-1.m4a',
    takeNumber: 1,
    isLatest: true,
    syncStatus: 'pending' as const,
    createdAt: 'x',
    updatedAt: 'x',
  };
}

function renderTab(
  overrides: Partial<React.ComponentProps<typeof RecordTab>> = {},
) {
  return render(
    <RecordTab
      bookName="Mark"
      chapterNumber={14}
      verses={VERSES}
      selectedVerseNumber={overrides.selectedVerseNumber ?? 3}
      bibleTextIdForSelectedVerse={42}
      onSelectVerse={jest.fn()}
      {...overrides}
    />,
  );
}

describe('RecordTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defers the record UI until the recorder is ready to avoid a flash', () => {
    jest.useFakeTimers();
    try {
      mockUseVerseRecorder.mockReturnValue({
        ...baseRecorderState(),
        isReady: false,
      });
      renderTab();

      // While loading, the controls are held back so idle never flashes.
      expect(screen.getByTestId('record-loading')).toBeTruthy();
      expect(screen.queryByTestId('record-start-button')).toBeNull();
      // The verse reference still shows so the header does not jump.
      expect(screen.getByTestId('record-verse-reference')).toHaveTextContent(
        'Mark 14:3',
      );

      // After the defer window the UI surfaces even if still not ready.
      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(screen.getByTestId('record-start-button')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('renders the record UI immediately once the recorder is ready', () => {
    mockUseVerseRecorder.mockReturnValue(baseRecorderState());
    renderTab();

    expect(screen.queryByTestId('record-loading')).toBeNull();
    expect(screen.getByTestId('record-start-button')).toBeTruthy();
  });

  it('renders the idle record button with a label and disabled play hint', () => {
    mockUseVerseRecorder.mockReturnValue(baseRecorderState());
    renderTab();

    expect(screen.getByTestId('record-verse-reference')).toHaveTextContent(
      'Mark 14:3',
    );
    expect(screen.getByTestId('record-start-button')).toBeTruthy();
    expect(screen.getByTestId('record-start-label')).toHaveTextContent(
      'Record Mark 14:3',
    );
    expect(screen.getByTestId('record-play-idle-placeholder')).toBeTruthy();
  });

  it('shows pause and stop controls with a duration and tip when recording', () => {
    mockUseVerseRecorder.mockReturnValue({
      ...baseRecorderState(),
      status: 'recording',
      elapsedMs: 65_420,
    });
    renderTab();

    expect(screen.getByTestId('record-duration')).toHaveTextContent('01:05:42');
    expect(screen.getByTestId('record-pause-button')).toBeTruthy();
    expect(screen.getByTestId('record-stop-button')).toBeTruthy();
    expect(screen.getByTestId('record-tip')).toHaveTextContent(
      'Tap pause to study the source, stop to finish.',
    );
  });

  it('shows the paused tip instead of the recording tip while paused', () => {
    mockUseVerseRecorder.mockReturnValue({
      ...baseRecorderState(),
      status: 'paused',
      elapsedMs: 3_000,
    });
    renderTab();

    expect(screen.getByTestId('record-tip')).toHaveTextContent(
      'Recording paused — review the source below, then resume.',
    );
  });

  it('shows the resume button while paused', () => {
    mockUseVerseRecorder.mockReturnValue({
      ...baseRecorderState(),
      status: 'paused',
      elapsedMs: 3_000,
    });
    renderTab();

    expect(screen.getByTestId('record-resume-button')).toBeTruthy();
    expect(screen.queryByTestId('record-pause-button')).toBeNull();
  });

  it('renders review controls with placeholder, play, re-record and delete', () => {
    const state = {
      ...baseRecorderState(),
      status: 'review' as const,
      currentRecording: reviewRecording(),
    };
    mockUseVerseRecorder.mockReturnValue(state);

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderTab();

    expect(
      screen.getByTestId('record-review-record-done-placeholder'),
    ).toBeTruthy();
    expect(screen.getByTestId('record-play-button')).toBeTruthy();
    expect(screen.getByTestId('record-rerecord-button')).toHaveTextContent(
      'Re-record',
    );
    expect(screen.getByTestId('record-delete-button')).toHaveTextContent(
      'Delete',
    );
    expect(screen.queryByTestId('record-tip')).toBeNull();

    fireEvent.press(screen.getByTestId('record-delete-button'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete draft?',
      expect.any(String),
      expect.any(Array),
    );

    alertSpy.mockRestore();
  });

  it('plays the draft when the review play button is pressed', () => {
    const togglePlayback = jest.fn().mockResolvedValue(undefined);
    mockUseVerseRecorder.mockReturnValue({
      ...baseRecorderState(),
      status: 'review',
      currentRecording: reviewRecording(),
      isPlaying: false,
      togglePlayback,
    });

    renderTab();

    expect(
      screen.getByTestId('record-play-button').props.accessibilityLabel,
    ).toBe('Play draft');
    fireEvent.press(screen.getByTestId('record-play-button'));
    expect(togglePlayback).toHaveBeenCalledTimes(1);
  });

  it('shows a pause affordance while the draft is playing', () => {
    mockUseVerseRecorder.mockReturnValue({
      ...baseRecorderState(),
      status: 'review',
      currentRecording: reviewRecording(),
      isPlaying: true,
    });

    renderTab();

    const playButton = screen.getByTestId('record-play-button');
    expect(playButton.props.accessibilityLabel).toBe('Pause draft');
    expect(playButton.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });

  it('disables verse chevrons while recording even when navigation is possible', () => {
    mockUseVerseRecorder.mockReturnValue({
      ...baseRecorderState(),
      status: 'recording',
      elapsedMs: 4_000,
    });
    renderTab({ selectedVerseNumber: 2 });

    expect(
      screen.getByTestId('record-prev-verse').props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
    expect(
      screen.getByTestId('record-next-verse').props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('disables prev on the first verse and next on the last verse', () => {
    mockUseVerseRecorder.mockReturnValue(baseRecorderState());
    const { rerender } = renderTab({ selectedVerseNumber: 1 });

    expect(
      screen.getByTestId('record-prev-verse').props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
    expect(
      screen.getByTestId('record-next-verse').props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: false }));

    rerender(
      <RecordTab
        bookName="Mark"
        chapterNumber={14}
        verses={VERSES}
        selectedVerseNumber={3}
        bibleTextIdForSelectedVerse={42}
        onSelectVerse={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId('record-next-verse').props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('prompts the OS permission dialog on first tap when permission is denied', async () => {
    const requestPermission = jest
      .fn()
      .mockResolvedValue({ granted: true, canAskAgain: true });
    const start = jest.fn().mockResolvedValue(undefined);
    mockUseVerseRecorder.mockReturnValue({
      ...baseRecorderState(),
      permission: 'denied',
      requestPermission,
      start,
    });

    renderTab();
    fireEvent.press(screen.getByTestId('record-start-button'));

    await waitFor(() => expect(requestPermission).toHaveBeenCalled());
    await waitFor(() => expect(start).toHaveBeenCalled());
  });

  it('shows the Settings alert instead of starting when permission is blocked', async () => {
    const requestPermission = jest.fn();
    const start = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUseVerseRecorder.mockReturnValue({
      ...baseRecorderState(),
      permission: 'blocked',
      requestPermission,
      start,
    });

    renderTab();
    fireEvent.press(screen.getByTestId('record-start-button'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Microphone access required',
        expect.stringContaining('Settings'),
        expect.any(Array),
      ),
    );
    expect(requestPermission).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('shows the Settings alert when the OS permanently denies during the prompt', async () => {
    const requestPermission = jest
      .fn()
      .mockResolvedValue({ granted: false, canAskAgain: false });
    const start = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUseVerseRecorder.mockReturnValue({
      ...baseRecorderState(),
      permission: 'denied',
      requestPermission,
      start,
    });

    renderTab();
    fireEvent.press(screen.getByTestId('record-start-button'));

    await waitFor(() => expect(requestPermission).toHaveBeenCalled());
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Microphone access required',
        expect.stringContaining('Settings'),
        expect.any(Array),
      ),
    );
    expect(start).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('forwards attribution context to useVerseRecorder', () => {
    mockUseVerseRecorder.mockReturnValue(baseRecorderState());
    renderTab({
      selectedVerseNumber: 2,
      userId: 'user-7',
      projectId: 55,
      chapterAssignmentId: 88,
      bookCode: 'MRK',
    });

    expect(mockUseVerseRecorder).toHaveBeenCalledWith(
      expect.objectContaining({
        bibleTextId: 42,
        userId: 'user-7',
        projectId: 55,
        chapterAssignmentId: 88,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 2,
      }),
    );
  });

  it('source text accordion is collapsed by default and toggles open', () => {
    mockUseVerseRecorder.mockReturnValue(baseRecorderState());
    renderTab();

    expect(screen.queryByTestId('record-source-body')).toBeNull();
    fireEvent.press(screen.getByTestId('record-source-toggle'));
    expect(screen.getByTestId('record-source-body')).toHaveTextContent('v3');
  });
});
