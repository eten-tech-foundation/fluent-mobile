import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { RecordTab } from './RecordTab';
import { DraftingProvider } from '../context/DraftingContext';
import type { useVerseAudio } from '../../hooks/useVerseAudio';

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { chapterName: 'Mark 14' } }),
}));

type VerseAudioApi = ReturnType<typeof useVerseAudio>;

const idleAudio: VerseAudioApi = {
  state: 'idle',
  latest: null,
  errorMessage: null,
  positionMs: 0,
  durationMs: 0,
  start: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  stop: jest.fn(),
  play: jest.fn(),
  seek: jest.fn(),
  pausePlayback: jest.fn(),
  deleteCurrent: jest.fn(),
};

const mockUseVerseAudio = jest.fn((): VerseAudioApi => idleAudio);

jest.mock('../../hooks/useVerseAudio', () => ({
  useVerseAudio: () => mockUseVerseAudio(),
}));

jest.mock('../../db/queries', () => ({
  getBibleTextId: jest.fn(async () => 42),
}));

jest.mock('../../audio/micPermission', () => ({
  requestMicPermission: jest.fn(async () => 'granted'),
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

describe('RecordTab', () => {
  beforeEach(() => {
    mockUseVerseAudio.mockReturnValue(idleAudio);
  });

  it('renders idle design chrome: verse nav, record, source link, source audio', async () => {
    render(
      <DraftingProvider verses={verses} initialVerse={3}>
        <RecordTab chapterData={chapterData} />
      </DraftingProvider>,
    );

    expect(screen.getByTestId('record-tab')).toBeTruthy();
    expect(screen.getByTestId('record-verse-reference')).toBeTruthy();
    expect(screen.getByTestId('record-start-button')).toBeTruthy();
    expect(screen.getByText('Record Mark 14:3')).toBeTruthy();
    expect(screen.getByTestId('record-play-idle-placeholder')).toBeTruthy();
    expect(screen.getByTestId('record-source-toggle')).toBeTruthy();
    expect(screen.getByText('View source text')).toBeTruthy();
    expect(screen.getByTestId('source-audio-bar')).toBeTruthy();
    // Stub defaults to empty until #235 wires real source audio.
    expect(screen.getByTestId('source-audio-label')).toHaveTextContent(
      'No source audio',
    );
    expect(screen.queryByTestId('source-audio-time-stub')).toBeNull();

    await waitFor(() => {
      expect(screen.queryByTestId('record-syncing-hint')).toBeNull();
    });
  });

  it('renders has-draft chrome with take row and Record New Take', () => {
    mockUseVerseAudio.mockReturnValue({
      ...idleAudio,
      state: 'recorded',
      latest: {
        id: 'rec_1',
        bibleTextId: 42,
        localFilePath: 'file:///take.m4a',
        takeNumber: 1,
        isLatest: true,
        durationMs: 13000,
        syncStatus: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      positionMs: 0,
      durationMs: 13000,
    });

    render(
      <DraftingProvider verses={verses} initialVerse={3}>
        <RecordTab chapterData={chapterData} />
      </DraftingProvider>,
    );

    expect(screen.getByTestId('record-take-row')).toBeTruthy();
    expect(screen.getByTestId('record-take-badge')).toBeTruthy();
    expect(screen.getByTestId('record-play-button')).toBeTruthy();
    expect(screen.getByTestId('record-take-time')).toBeTruthy();
    expect(screen.getByText('0:00 / 0:13')).toBeTruthy();
    expect(screen.getByTestId('record-delete-button')).toBeTruthy();
    expect(screen.getByTestId('record-new-take-button')).toBeTruthy();
    expect(screen.getByText('Record New Take')).toBeTruthy();
    expect(screen.getByTestId('source-audio-label')).toHaveTextContent(
      'No source audio',
    );
    // Review scrub surface (#176) — waveform accepts seek gestures.
    expect(screen.getByLabelText('Draft waveform scrubber')).toBeTruthy();
  });

  it('notifies captureActive during recording and clears after stop', async () => {
    const onCaptureActiveChange = jest.fn();

    mockUseVerseAudio.mockReturnValue({
      ...idleAudio,
      state: 'recording',
    });

    const { rerender } = render(
      <DraftingProvider verses={verses} initialVerse={3}>
        <RecordTab
          chapterData={chapterData}
          onCaptureActiveChange={onCaptureActiveChange}
        />
      </DraftingProvider>,
    );

    expect(onCaptureActiveChange).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('playback-progress-animated')).toBeTruthy();

    mockUseVerseAudio.mockReturnValue({
      ...idleAudio,
      state: 'recorded',
      latest: {
        id: 'rec_1',
        bibleTextId: 42,
        localFilePath: 'file:///take.m4a',
        takeNumber: 1,
        isLatest: true,
        durationMs: 1000,
        syncStatus: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
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
