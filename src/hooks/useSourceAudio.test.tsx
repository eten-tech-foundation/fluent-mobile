import React, { type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  DraftingProvider,
  useDraftingContext,
} from '../app/context/DraftingContext';
import {
  __setSourceAudioFetchEnabledForTests,
  useSourceAudio,
} from './useSourceAudio';
import type { ChapterAssignmentData } from '../types/db/types';

const mockResolveChapterSourceAudio = jest.fn();
const mockGetPrepareOfflineProjectContext = jest.fn();
const mockPlaybackLoad = jest.fn();
const mockPlaybackSeek = jest.fn();
const mockPlaybackPause = jest.fn();
const mockPlaybackPlay = jest.fn();
const mockPlaybackStop = jest.fn();

const playbackState = {
  status: 'idle' as 'idle' | 'playing' | 'paused',
  positionMs: 0,
  durationMs: 0,
};

jest.mock('../services/sourceAudio/resolveMockChapterSourceAudio', () => ({
  resolveMockChapterSourceAudio: jest.fn(({ verseCount = 3 }) => ({
    uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    verseMarkers: Array.from({ length: verseCount }, (_, index) => ({
      verseNumber: index + 1,
      startMs: index * 5000,
    })),
  })),
}));

jest.mock('../db/queries.prepareOffline', () => ({
  getPrepareOfflineProjectContext: (...args: unknown[]) =>
    mockGetPrepareOfflineProjectContext(...args),
}));

jest.mock('../db/queries', () => ({
  getRecordedVerseNumbers: jest.fn(async () => new Set()),
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: () => '1',
  getUserIdSync: () => '1',
}));

jest.mock('./usePlaybackEngine', () => ({
  usePlaybackEngine: () => ({
    play: async (...args: unknown[]) => {
      playbackState.status = 'playing';
      return mockPlaybackPlay(...args);
    },
    pause: async (...args: unknown[]) => {
      playbackState.status = 'paused';
      return mockPlaybackPause(...args);
    },
    stop: async (...args: unknown[]) => {
      playbackState.status = 'idle';
      return mockPlaybackStop(...args);
    },
    load: mockPlaybackLoad,
    seek: mockPlaybackSeek,
    get status() {
      return playbackState.status;
    },
    get positionMs() {
      return playbackState.positionMs;
    },
    get durationMs() {
      return playbackState.durationMs;
    },
  }),
}));

const verses = [
  {
    bibleId: 1,
    bookId: 40,
    chapterNumber: 14,
    verseNumber: 1,
    text: 'Verse one',
  },
  {
    bibleId: 1,
    bookId: 40,
    chapterNumber: 14,
    verseNumber: 2,
    text: 'Verse two',
  },
  {
    bibleId: 1,
    bookId: 40,
    chapterNumber: 14,
    verseNumber: 3,
    text: 'Verse three',
  },
];

const chapterData: ChapterAssignmentData = {
  id: 1,
  projectUnitId: 1,
  projectId: 1,
  bibleId: 1,
  bookId: 40,
  chapterNumber: 14,
  bibleAbbreviation: 'BSB',
  bibleName: 'Berean Standard Bible',
  bookCode: 'MRK',
  status: 'unassigned', // Required field
  hasConflict: false, // Required field
};

function wrapper({
  children,
  initialVerse = 1,
}: {
  children: ReactNode;
  initialVerse?: number;
}) {
  return (
    <DraftingProvider verses={verses} initialVerse={initialVerse}>
      {children}
    </DraftingProvider>
  );
}

describe('useSourceAudio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setSourceAudioFetchEnabledForTests(false);
    playbackState.status = 'idle';
    playbackState.positionMs = 0;
    playbackState.durationMs = 0;
    mockGetPrepareOfflineProjectContext.mockResolvedValue({
      sourceLanguageCode: 'eng',
    });
    mockResolveChapterSourceAudio.mockResolvedValue({
      uri: 'https://audio.test/ch14.mp3',
      verseMarkers: [
        { verseNumber: 1, startMs: 0 },
        { verseNumber: 2, startMs: 5000 },
        { verseNumber: 3, startMs: 12000 },
      ],
    });
    mockPlaybackLoad.mockResolvedValue(undefined);
    mockPlaybackSeek.mockResolvedValue(undefined);
    mockPlaybackPause.mockResolvedValue(undefined);
    mockPlaybackPlay.mockResolvedValue(undefined);
    mockPlaybackStop.mockResolvedValue(undefined);
  });

  it('shows mock source audio in dev preview mode', async () => {
    const { result } = renderHook(
      () => useSourceAudio({ chapterData, userId: 7 }),
      { wrapper: ({ children }) => wrapper({ children }) },
    );

    // With dev preview enabled, we load mock data
    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    expect(mockResolveChapterSourceAudio).not.toHaveBeenCalled();
    expect(result.current.unitLabel).toBe('Verse 1 / 3');
    expect(result.current.sourceLabel).toBe('BSB');
  });

  it('binds unit counter to the selected verse (dev preview mode)', async () => {
    const { result } = renderHook(
      () => useSourceAudio({ chapterData, userId: 7 }),
      {
        wrapper: ({ children }) => wrapper({ children, initialVerse: 2 }),
      },
    );

    // With dev preview enabled, loads mock data
    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    expect(result.current.unitLabel).toBe('Verse 2 / 3');
  });

  it('loads mock chapter audio and seeks to the selected verse (dev preview mode)', async () => {
    __setSourceAudioFetchEnabledForTests(true);

    const { result } = renderHook(
      () => useSourceAudio({ chapterData, userId: 7 }),
      {
        wrapper: ({ children }) => wrapper({ children, initialVerse: 2 }),
      },
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    // In dev preview mode, we use mock data
    expect(mockPlaybackLoad).toHaveBeenCalledWith(
      'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    );
    expect(mockPlaybackSeek).toHaveBeenCalledWith(5000);
    expect(result.current.unitLabel).toBe('Verse 2 / 3');
  });

  it('seeks and pauses when the selected verse changes after load', async () => {
    __setSourceAudioFetchEnabledForTests(true);

    let setSelectedVerse: ((verseNumber: number) => void) | undefined;

    function SelectionBridge({ children }: { children: ReactNode }) {
      const ctx = useDraftingContext();
      setSelectedVerse = ctx.setSelectedVerse;
      return children;
    }

    const { result } = renderHook(
      () => useSourceAudio({ chapterData, userId: 7 }),
      {
        wrapper: ({ children }) => (
          <DraftingProvider verses={verses} initialVerse={1}>
            <SelectionBridge>{children}</SelectionBridge>
          </DraftingProvider>
        ),
      },
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    mockPlaybackSeek.mockClear();
    mockPlaybackPause.mockClear();

    act(() => {
      setSelectedVerse?.(3);
    });

    await waitFor(() => {
      expect(mockPlaybackSeek).toHaveBeenCalledWith(10000);
    });
    expect(mockPlaybackPause).toHaveBeenCalled();
  });

  it('updates unit counter from the active verse while playback is paused', async () => {
    __setSourceAudioFetchEnabledForTests(true);

    const { result } = renderHook(
      () => useSourceAudio({ chapterData, userId: 7 }),
      { wrapper: ({ children }) => wrapper({ children, initialVerse: 1 }) },
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    playbackState.status = 'paused';

    await act(async () => {
      await result.current.seek(7000);
    });

    await waitFor(() => {
      expect(result.current.unitLabel).toBe('Verse 2 / 3');
    });
  });
});
