import React from 'react';
import { Alert } from 'react-native';
import {
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react-native';
import { RecordTab } from './RecordTab';
import { DraftingProvider } from '../context/DraftingContext';
import type { useVerseAudio } from '../../hooks/useVerseAudio';
import type { Recording } from '../../types/db/types';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ chapterName: 'Mark 14' }),
}));

jest.mock('../../db/queries', () => ({
  getBibleTextId: jest.fn(async () => 42),
}));

jest.mock('../../audio/micPermission', () => ({
  requestMicPermission: jest.fn(async () => 'granted'),
}));

type VerseAudioApi = ReturnType<typeof useVerseAudio>;

function makeTake(overrides: Partial<Recording> = {}): Recording {
  return {
    id: 'rec_1',
    bibleTextId: 42,
    localFilePath: 'file:///take.m4a',
    takeNumber: 1,
    isSelected: true,
    durationMs: 13000,
    syncStatus: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Recording;
}

const idleAudio: VerseAudioApi = {
  state: 'idle',
  takes: [],
  selectedTake: null,
  canRecordNewTake: true,
  playingTakeId: null,
  loadedTakeId: null,
  errorMessage: null,
  positionMs: 0,
  durationMs: 0,
  start: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  stop: jest.fn(),
  playTake: jest.fn(),
  seek: jest.fn(),
  pausePlayback: jest.fn(),
  selectTake: jest.fn(),
  deleteTake: jest.fn(),
};

const mockUseVerseAudio = jest.fn((): VerseAudioApi => idleAudio);

jest.mock('../../hooks/useVerseAudio', () => ({
  useVerseAudio: () => mockUseVerseAudio(),
}));

const chapterData = {
  id: 1,
  bibleId: 1,
  bookId: 1,
  chapterNumber: 14,
  bibleName: 'BSB',
  bookName: 'Mark',
} as never;

const verses = [
  {
    bibleId: 1,
    bookId: 1,
    chapterNumber: 14,
    verseNumber: 3,
    text: 'Source text',
  },
];

function renderTab(onCaptureActiveChange?: (active: boolean) => void) {
  return render(
    <DraftingProvider verses={verses} initialVerse={3}>
      <RecordTab
        chapterData={chapterData}
        onCaptureActiveChange={onCaptureActiveChange}
      />
    </DraftingProvider>,
  );
}

describe('RecordTab', () => {
  beforeEach(() => {
    // idleAudio's jest.fn()s are shared references across every test (via
    // `{...idleAudio, ...}` spreads) — clear call history each test or an
    // earlier test's call (e.g. deleteTake('rec_1')) leaks into the next
    // test's `.not.toHaveBeenCalled()` assertion.
    jest.clearAllMocks();
    mockUseVerseAudio.mockReturnValue(idleAudio);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('renders idle design chrome: verse nav, record, source link, source audio', async () => {
    renderTab();

    expect(screen.getByTestId('record-tab')).toBeTruthy();
    expect(screen.getByTestId('record-verse-reference')).toBeTruthy();
    expect(screen.getByTestId('record-start-button')).toBeTruthy();
    expect(screen.getByText('Record Mark 14:3')).toBeTruthy();
    expect(screen.getByTestId('record-play-idle-placeholder')).toBeTruthy();
    expect(screen.getByTestId('record-source-toggle')).toBeTruthy();
    expect(screen.getByText('View source text')).toBeTruthy();
    expect(screen.getByTestId('source-audio-bar')).toBeTruthy();
    expect(screen.getByTestId('source-audio-label')).toHaveTextContent(
      'No source audio',
    );
    expect(screen.queryByTestId('source-audio-time-stub')).toBeNull();
    expect(screen.queryByTestId('record-take-list')).toBeNull();

    await waitFor(() => {
      expect(screen.queryByTestId('record-syncing-hint')).toBeNull();
    });
  });

  it('renders review chrome with a single take row and Record New Take', () => {
    const take = makeTake();
    mockUseVerseAudio.mockReturnValue({
      ...idleAudio,
      state: 'recorded',
      takes: [take],
      selectedTake: take,
      positionMs: 0,
      durationMs: 0,
    });

    renderTab();

    expect(screen.getByTestId('record-take-row')).toBeTruthy();
    expect(screen.getByTestId('record-take-badge')).toHaveTextContent('Take 1');
    expect(screen.getByTestId('record-play-button')).toBeTruthy();
    expect(screen.getByTestId('record-take-time')).toBeTruthy();
    // Not the loaded take (playingTakeId is null), so position falls back to
    // 0 and duration falls back to the take's stored duration — rendered as
    // one combined "position / duration" label, not duration alone.
    expect(screen.getByText('0:00 / 0:13')).toBeTruthy();
    expect(screen.getByTestId('record-delete-button')).toBeTruthy();
    expect(screen.getByTestId('record-new-take-button')).toBeTruthy();
    expect(screen.getByText('Record New Take')).toBeTruthy();
  });

  it('renders one card per take, in list order, with only the latest marked selected', () => {
    const take1 = makeTake({ id: 'rec_1', takeNumber: 1, isSelected: false });
    const take2 = makeTake({ id: 'rec_2', takeNumber: 2, isSelected: true });
    mockUseVerseAudio.mockReturnValue({
      ...idleAudio,
      state: 'recorded',
      takes: [take1, take2],
      selectedTake: take2,
    });

    renderTab();

    const badges = screen.getAllByTestId('record-take-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent('Take 1');
    expect(badges[1]).toHaveTextContent('Take 2');

    expect(
      screen.getByLabelText('Select this take as active draft'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Selected take')).toBeTruthy();
  });

  it('selecting an unselected take calls selectTake with its id', () => {
    const take1 = makeTake({ id: 'rec_1', takeNumber: 1, isSelected: false });
    const take2 = makeTake({ id: 'rec_2', takeNumber: 2, isSelected: true });
    mockUseVerseAudio.mockReturnValue({
      ...idleAudio,
      state: 'recorded',
      takes: [take1, take2],
      selectedTake: take2,
    });

    renderTab();

    fireEvent.press(screen.getByLabelText('Select this take as active draft'));
    expect(idleAudio.selectTake).toHaveBeenCalledWith('rec_1');
  });

  it('deletes a non-selected take immediately, with no confirmation prompt', () => {
    const take1 = makeTake({ id: 'rec_1', takeNumber: 1, isSelected: false });
    const take2 = makeTake({ id: 'rec_2', takeNumber: 2, isSelected: true });
    mockUseVerseAudio.mockReturnValue({
      ...idleAudio,
      state: 'recorded',
      takes: [take1, take2],
      selectedTake: take2,
    });

    renderTab();

    const deleteButtons = screen.getAllByTestId('record-delete-button');
    fireEvent.press(deleteButtons[0]!); // take 1, not selected

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(idleAudio.deleteTake).toHaveBeenCalledWith('rec_1');
  });

  it('confirms before deleting the selected take, and only deletes on confirm', () => {
    const take1 = makeTake({ id: 'rec_1', takeNumber: 1, isSelected: false });
    const take2 = makeTake({ id: 'rec_2', takeNumber: 2, isSelected: true });
    mockUseVerseAudio.mockReturnValue({
      ...idleAudio,
      state: 'recorded',
      takes: [take1, take2],
      selectedTake: take2,
    });

    renderTab();

    const deleteButtons = screen.getAllByTestId('record-delete-button');
    fireEvent.press(deleteButtons[1]!); // take 2, selected

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(idleAudio.deleteTake).not.toHaveBeenCalled();

    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0] as [
      string,
      string,
      { text: string; onPress?: () => void }[],
    ];
    const confirmButton = buttons.find(b => b.text === 'Delete');
    confirmButton?.onPress?.();

    expect(idleAudio.deleteTake).toHaveBeenCalledWith('rec_2');
  });

  it('plays the tapped take and pauses when the same playing take is tapped again', () => {
    const take1 = makeTake({ id: 'rec_1', takeNumber: 1, isSelected: false });
    const take2 = makeTake({ id: 'rec_2', takeNumber: 2, isSelected: true });
    mockUseVerseAudio.mockReturnValue({
      ...idleAudio,
      state: 'recorded',
      takes: [take1, take2],
      selectedTake: take2,
      playingTakeId: null,
    });

    const { rerender } = renderTab();

    const playButtons = screen.getAllByTestId('record-play-button');
    fireEvent.press(playButtons[0]!); // play take 1
    expect(idleAudio.playTake).toHaveBeenCalledWith(take1);

    // Now simulate take 1 actually loaded + playing.
    mockUseVerseAudio.mockReturnValue({
      ...idleAudio,
      state: 'playing',
      takes: [take1, take2],
      selectedTake: take2,
      playingTakeId: 'rec_1',
      loadedTakeId: 'rec_1',
    });
    rerender(
      <DraftingProvider verses={verses} initialVerse={3}>
        <RecordTab chapterData={chapterData} />
      </DraftingProvider>,
    );

    const playButtonsAfter = screen.getAllByTestId('record-play-button');
    fireEvent.press(playButtonsAfter[0]!); // tap the same (now playing) take
    expect(idleAudio.pausePlayback).toHaveBeenCalled();
    // Tapping a different, non-loaded take's play button still calls playTake.
    fireEvent.press(playButtonsAfter[1]!);
    expect(idleAudio.playTake).toHaveBeenCalledWith(take2);
    // Review scrub surface (#176) — only the loaded take's waveform is seekable.
    expect(screen.getByLabelText('Draft waveform scrubber')).toBeTruthy();
  });

  it('keeps the loaded take scrubbable after playback reaches the end', () => {
    const take = makeTake();
    mockUseVerseAudio.mockReturnValue({
      ...idleAudio,
      state: 'recorded',
      takes: [take],
      selectedTake: take,
      // Natural end clears playingTakeId; the take is still in the player.
      playingTakeId: null,
      loadedTakeId: 'rec_1',
    });

    renderTab();

    const scrubber = screen.getByLabelText('Draft waveform scrubber');
    fireEvent(scrubber, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 28 } },
    });
    fireEvent(scrubber, 'responderGrant', {
      nativeEvent: { locationX: 50 },
    });
    expect(idleAudio.seek).toHaveBeenCalledWith(6500);
  });

  it('scrubs the selected take before it has ever been played', () => {
    const take = makeTake({ durationMs: 13000 });
    mockUseVerseAudio.mockReturnValue({
      ...idleAudio,
      state: 'recorded',
      takes: [take],
      selectedTake: take,
      // Freshly recorded: nothing is in the player yet.
      playingTakeId: null,
      loadedTakeId: null,
    });

    renderTab();

    const scrubber = screen.getByLabelText('Draft waveform scrubber');
    fireEvent(scrubber, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 28 } },
    });
    fireEvent(scrubber, 'responderGrant', {
      nativeEvent: { locationX: 50 },
    });
    expect(idleAudio.seek).toHaveBeenCalledWith(6500);
  });

  it('notifies captureActive during recording and clears after stop', async () => {
    const onCaptureActiveChange = jest.fn();

    mockUseVerseAudio.mockReturnValue({
      ...idleAudio,
      state: 'recording',
    });

    const { rerender } = renderTab(onCaptureActiveChange);

    expect(onCaptureActiveChange).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('playback-progress-animated')).toBeTruthy();

    const take = makeTake({ durationMs: 1000 });
    mockUseVerseAudio.mockReturnValue({
      ...idleAudio,
      state: 'recorded',
      takes: [take],
      selectedTake: take,
      durationMs: 1000,
    });
    rerender(
      <DraftingProvider verses={verses} initialVerse={3}>
        <RecordTab
          chapterData={chapterData}
          onCaptureActiveChange={onCaptureActiveChange}
        />
      </DraftingProvider>,
    );

    await waitFor(() => {
      expect(onCaptureActiveChange).toHaveBeenCalledWith(false);
    });
  });
});
