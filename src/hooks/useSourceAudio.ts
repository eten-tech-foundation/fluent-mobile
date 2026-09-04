import { useCallback, useEffect, useRef, useState } from 'react';
import { useDraftingContext } from '../app/context/DraftingContext';
import { ChapterAssignmentData } from '../types/db/types';
import { isApiError } from '../types/api/errors';
import {
  usePlaybackEngine,
  type UsePlaybackEngineApi,
} from './usePlaybackEngine';
import {
  resolveMockChapterSourceAudio,
  type ChapterSourceAudio,
} from '../services/sourceAudio/resolveMockChapterSourceAudio';
import type { SourceAudioLoadState } from '../components/layout/SourceAudioPlayerBar';
import { logger } from '../utils/logger';

const log = logger.create('useSourceAudio');

/**
 * Dev preview mode: set to true to test the player with mock audio.
 * Set to false for production (will show "No source audio" until real API is integrated).
 */
const DEV_PREVIEW_ENABLED = true;

/**
 * Helper: Find verse at given position in milliseconds.
 */
function verseAtPositionMs(
  verseMarkers: Array<{ verseNumber: number; startMs: number }>,
  positionMs: number,
): number {
  if (verseMarkers.length === 0) return 1;

  // Find the last marker whose startMs is <= positionMs
  let activeVerse = verseMarkers[0].verseNumber;
  for (const marker of verseMarkers) {
    if (marker.startMs <= positionMs) {
      activeVerse = marker.verseNumber;
    } else {
      break;
    }
  }
  return activeVerse;
}

/**
 * Helper: Get start time in milliseconds for a verse.
 */
function verseStartMs(
  verseMarkers: Array<{ verseNumber: number; startMs: number }>,
  verseNumber: number,
): number {
  const marker = verseMarkers.find(m => m.verseNumber === verseNumber);
  return marker?.startMs ?? 0;
}

/**
 * Controls whether to attempt loading source audio.
 * Currently only supports dev preview mode for testing.
 * Real API integration will be added in a future update.
 */
let sourceAudioFetchEnabled = false;

function shouldAttemptSourceAudioLoad(): boolean {
  return DEV_PREVIEW_ENABLED || sourceAudioFetchEnabled;
}

/** @internal Unit tests only — enables the fetch path with mocked resolvers. */
export function __setSourceAudioFetchEnabledForTests(enabled: boolean): void {
  sourceAudioFetchEnabled = enabled;
}

export type UseSourceAudioArgs = {
  chapterData: ChapterAssignmentData;
  userId: number | null;
};

export type UseSourceAudioResult = {
  loadState: SourceAudioLoadState;
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
  unitLabel: string;
  sourceLabel: string;
  togglePlay: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  retry: () => void;
  pause: () => Promise<void>;
};

function formatUnitLabel(selectedVerse: number, totalVerses: number): string {
  if (totalVerses <= 0) {
    return `Verse ${selectedVerse}`;
  }
  return `Verse ${selectedVerse} / ${totalVerses}`;
}

export function useSourceAudio({
  chapterData,
  userId,
}: UseSourceAudioArgs): UseSourceAudioResult {
  const playback = usePlaybackEngine();
  const engineRef = useRef<UsePlaybackEngineApi>(playback);
  engineRef.current = playback;

  const {
    selectedVerse,
    verses,
    currentlyPlayingVerse,
    setCurrentlyPlayingVerse,
  } = useDraftingContext();

  const [loadState, setLoadState] = useState<SourceAudioLoadState>(
    shouldAttemptSourceAudioLoad() ? 'loading' : 'empty',
  );
  const [chapterAudio, setChapterAudio] = useState<ChapterSourceAudio | null>(
    null,
  );
  const loadRequestIdRef = useRef(0);
  const selectedVerseRef = useRef(selectedVerse);
  const loadedUriRef = useRef<string | null>(null);
  const highlightedVerseRef = useRef<number | null>(null);

  useEffect(() => {
    selectedVerseRef.current = selectedVerse;
  }, [selectedVerse]);

  useEffect(() => {
    return () => {
      highlightedVerseRef.current = null;
      setCurrentlyPlayingVerse(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadChapterAudio = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    if (shouldAttemptSourceAudioLoad()) {
      setLoadState('loading');
    }
    setChapterAudio(null);
    loadedUriRef.current = null;

    if (!chapterData.bookCode || userId === null || !chapterData.projectId) {
      log.warn('Source audio unavailable — missing chapter context', {
        bookCode: chapterData.bookCode,
        projectId: chapterData.projectId,
        userId,
      });
      setLoadState('empty');
      return;
    }

    const applyResolved = async (resolved: ChapterSourceAudio) => {
      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      setChapterAudio(resolved);
      loadedUriRef.current = resolved.uri;
      await engineRef.current.load(resolved.uri);
      const startMs = verseStartMs(
        resolved.verseMarkers,
        selectedVerseRef.current,
      );
      if (startMs > 0) {
        await engineRef.current.seek(startMs);
      }
      setLoadState('ready');
    };

    try {
      if (DEV_PREVIEW_ENABLED) {
        // Dev preview mode: use mock audio for testing without API
        await new Promise<void>(resolve => setTimeout(resolve, 400));
        await applyResolved(
          resolveMockChapterSourceAudio({ verseCount: verses.length }),
        );
        return;
      }

      // No source audio available without dev preview mode
      if (requestId !== loadRequestIdRef.current) {
        return;
      }
      setLoadState('empty');
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) {
        return;
      }
      if (isApiError(error) && error.status === 404) {
        setLoadState('empty');
        return;
      }
      log.error('Failed to resolve chapter source audio', { error });
      setLoadState('error');
    }
  }, [chapterData.bookCode, chapterData.projectId, userId, verses.length]);

  useEffect(() => {
    void loadChapterAudio();
    return () => {
      loadRequestIdRef.current += 1;
      void engineRef.current.stop();
    };
  }, [loadChapterAudio]);

  useEffect(() => {
    if (!chapterAudio || loadState !== 'ready') {
      return;
    }
    highlightedVerseRef.current = null;
    setCurrentlyPlayingVerse(null);
    const startMs = verseStartMs(chapterAudio.verseMarkers, selectedVerse);
    void engineRef.current.seek(startMs);
    void engineRef.current.pause();
  }, [chapterAudio, loadState, selectedVerse, setCurrentlyPlayingVerse]);

  useEffect(() => {
    if (playback.status !== 'playing' || !chapterAudio) {
      if (playback.status === 'idle' && highlightedVerseRef.current !== null) {
        highlightedVerseRef.current = null;
        setCurrentlyPlayingVerse(null);
      }
      return;
    }

    const syncHighlight = () => {
      const activeVerse = verseAtPositionMs(
        chapterAudio.verseMarkers,
        engineRef.current.positionMs,
      );
      if (activeVerse === highlightedVerseRef.current) {
        return;
      }
      highlightedVerseRef.current = activeVerse;
      setCurrentlyPlayingVerse(activeVerse);
    };

    syncHighlight();
    const intervalId = setInterval(syncHighlight, 250);
    return () => clearInterval(intervalId);
  }, [chapterAudio, playback.status, setCurrentlyPlayingVerse]);

  const togglePlay = useCallback(async () => {
    if (loadState !== 'ready' || !loadedUriRef.current) {
      return;
    }
    const engine = engineRef.current;
    if (engine.status === 'playing') {
      await engine.pause();
      return;
    }
    await engine.play(loadedUriRef.current);
  }, [loadState]);

  const pause = useCallback(async () => {
    await engineRef.current.pause();
  }, []);

  const seek = useCallback(
    async (positionMs: number) => {
      if (loadState !== 'ready' || !chapterAudio) {
        return;
      }
      await engineRef.current.seek(positionMs);
      const activeVerse = verseAtPositionMs(
        chapterAudio.verseMarkers,
        positionMs,
      );
      if (activeVerse !== null) {
        highlightedVerseRef.current = activeVerse;
        setCurrentlyPlayingVerse(activeVerse);
      }
    },
    [chapterAudio, loadState, setCurrentlyPlayingVerse],
  );

  const retry = useCallback(() => {
    void loadChapterAudio();
  }, [loadChapterAudio]);

  const sourceLabel =
    chapterData.bibleAbbreviation ?? chapterData.bibleName ?? 'Source';
  const isPlaying = playback.status === 'playing';
  const displayVerse =
    currentlyPlayingVerse !== null &&
    (playback.status === 'playing' || playback.status === 'paused')
      ? currentlyPlayingVerse
      : selectedVerse;
  const unitLabel = formatUnitLabel(displayVerse, verses.length);

  return {
    loadState,
    positionMs: playback.positionMs,
    durationMs: playback.durationMs,
    isPlaying,
    unitLabel,
    sourceLabel,
    togglePlay,
    seek,
    retry,
    pause,
  };
}
