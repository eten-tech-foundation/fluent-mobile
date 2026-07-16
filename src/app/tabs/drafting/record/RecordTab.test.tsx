import React from 'react';
import { Alert } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { RecordTab } from './RecordTab';
import type { VerseData } from '../../../../types/db/types';
import { RecorderStatus } from '../../../../types/recording/types';

const mockUseVerseRecorder = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    addListener: jest.fn(() => jest.fn()),
    dispatch: jest.fn(),
    goBack: jest.fn(),
  }),
}));

jest.mock('./hooks/useVerseRecorder', () => ({
  useVerseRecorder: (args: unknown) => mockUseVerseRecorder(args),
}));

const VERSES: VerseData[] = [
  { bibleId: 1, bookId: 41, chapterNumber: 14, verseNumber: 1, text: 'v1' },
  { bibleId: 1, bookId: 41, chapterNumber: 14, verseNumber: 2, text: 'v2' },
  { bibleId: 1, bookId: 41, chapterNumber: 14, verseNumber: 3, text: 'v3' },
];

function baseRecorderState() {
  return {
    status: RecorderStatus.Idle,
    elapsedMs: 0,
    permission: 'granted' as const,
    currentRecording: null,
    isReady: true,
    canResume: true,
    playback: {
      isPlaying: false,
      positionMs: 0,
      durationMs: 0,
      toggle: jest.fn().mockResolvedValue(undefined),
      seek: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
    },
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
      userId="user-9"
      {...overrides}
    />,
  );
}

describe('RecordTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a loading placeholder until the recorder is ready', () => {
    mockUseVerseRecorder.mockReturnValue({
      ...baseRecorderState(),
      isReady: false,
    });
    renderTab();

    expect(screen.getByTestId('record-loading')).toBeTruthy();
    expect(screen.queryByTestId('record-start-button')).toBeNull();
    expect(screen.getByTestId('record-verse-reference')).toHaveTextContent(
      'Mark 14:3',
    );
  });

  it('disables record and shows a syncing hint when bibleTextId is null', () => {
    mockUseVerseRecorder.mockReturnValue(baseRecorderState());
    renderTab({ bibleTextIdForSelectedVerse: null });

    expect(
      screen.getByTestId('record-start-button').props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
    expect(screen.getByTestId('record-syncing-hint')).toBeTruthy();
  });

  it('renders the record UI immediately once the recorder is ready', () => {
    mockUseVerseRecorder.mockReturnValue(baseRecorderState());
    renderTab();

    expect(screen.queryByTestId('record-loading')).toBeNull();
    expect(screen.getByTestId('record-start-button')).toBeTruthy();
  });

  it('disables verse chevrons while recording even when navigation is possible', () => {
    mockUseVerseRecorder.mockReturnValue({
      ...baseRecorderState(),
      status: RecorderStatus.Recording,
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
        userId="user-9"
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

  it('shows a delete confirmation alert from the review controls', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUseVerseRecorder.mockReturnValue({
      ...baseRecorderState(),
      status: RecorderStatus.Review,
      currentRecording: reviewRecording(),
    });

    renderTab();
    fireEvent.press(screen.getByTestId('record-delete-button'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Delete draft?',
      expect.any(String),
      expect.any(Array),
    );

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
});
