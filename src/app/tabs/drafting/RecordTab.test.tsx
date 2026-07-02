import React from 'react';
import { Alert } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { RecordTab } from './RecordTab';
import type { VerseData } from '../../../types/db/types';

const mockUseRecorder = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    addListener: jest.fn(() => jest.fn()),
    dispatch: jest.fn(),
    goBack: jest.fn(),
  }),
}));

jest.mock('../../../hooks/useRecorder', () => ({
  useRecorder: () => mockUseRecorder(),
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

  it('renders the idle record button with a label and disabled play hint', () => {
    mockUseRecorder.mockReturnValue(baseRecorderState());
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
    mockUseRecorder.mockReturnValue({
      ...baseRecorderState(),
      status: 'recording',
      elapsedMs: 65_000,
    });
    renderTab();

    expect(screen.getByTestId('record-duration')).toHaveTextContent('1:05');
    expect(screen.getByTestId('record-pause-button')).toBeTruthy();
    expect(screen.getByTestId('record-stop-button')).toBeTruthy();
    expect(screen.getByTestId('record-tip')).toHaveTextContent(
      'Tap pause to study the source, stop to finish.',
    );
  });

  it('shows the paused tip instead of the recording tip while paused', () => {
    mockUseRecorder.mockReturnValue({
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
    mockUseRecorder.mockReturnValue({
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
      currentRecording: {
        id: 'rec-1',
        bibleTextId: 42,
        localFilePath: '/tmp/rec-1.m4a',
        takeNumber: 1,
        isLatest: true,
        syncStatus: 'pending' as const,
        createdAt: 'x',
        updatedAt: 'x',
      },
    };
    mockUseRecorder.mockReturnValue(state);

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

  it('disables prev on the first verse and next on the last verse', () => {
    mockUseRecorder.mockReturnValue(baseRecorderState());
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
    mockUseRecorder.mockReturnValue({
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
    mockUseRecorder.mockReturnValue({
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
    mockUseRecorder.mockReturnValue({
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

  it('source text accordion is collapsed by default and toggles open', () => {
    mockUseRecorder.mockReturnValue(baseRecorderState());
    renderTab();

    expect(screen.queryByTestId('record-source-body')).toBeNull();
    fireEvent.press(screen.getByTestId('record-source-toggle'));
    expect(screen.getByTestId('record-source-body')).toHaveTextContent('v3');
  });
});
