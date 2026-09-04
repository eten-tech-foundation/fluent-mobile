import { useCallback, useEffect, useRef, useState } from 'react';
import { FluentAPI } from '../services/api';
import { isApiError } from '../types/api/errors';
import type { ApiSourceAudioResponse } from '../types/api/sourceAudio';
import { logger } from '../utils/logger';
import type { SourceAudioLoadState } from '../types/sourceAudio';
import { usePlaybackEngine } from './usePlaybackEngine';
import {
  chapterSourceAudioCacheKey,
  resolveSourceAudioUri,
  verseStartMs,
} from './sourceAudioHelpers';

const log = logger.create('useSourceAudio');

export type UseSourceAudioArgs = {
  projectId: number | null;
  bookCode: string | undefined;
  chapter: number;
  bibleId: number;
  languageCode: string | undefined;
  verse: number;
  enabled?: boolean;
  onPlayingVerseChange?: (verse: number | null) => void;
  fetchChapterSourceAudio?: typeof FluentAPI.getChapterSourceAudio;
};

/**
 * Chapter-level source/reference audio for the drafting dock (#235).
 * Own playback engine — distinct from draft takes in useVerseAudio.
 */
export function useSourceAudio({
  projectId,
  bookCode,
  chapter,
  bibleId,
  languageCode,
  verse,
  enabled = true,
  onPlayingVerseChange,
  fetchChapterSourceAudio = FluentAPI.getChapterSourceAudio,
}: UseSourceAudioArgs) {
  const playback = usePlaybackEngine();
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  const [loadState, setLoadState] = useState<SourceAudioLoadState>('empty');
  const [uri, setUri] = useState<string | null>(null);
  const [verseTimestamps, setVerseTimestamps] =
    useState<ApiSourceAudioResponse['verseTimestamps']>(undefined);
  const [dblAudioBibleId, setDblAudioBibleId] = useState<string | undefined>();
  const [retryToken, setRetryToken] = useState(0);

  const requestIdRef = useRef(0);
  const responseCacheRef = useRef<Map<string, ApiSourceAudioResponse>>(
    new Map(),
  );
  const uriRef = useRef<string | null>(null);
  const verseRef = useRef(verse);
  const timestampsRef = useRef(verseTimestamps);
  const dblIdRef = useRef(dblAudioBibleId);
  const onPlayingVerseChangeRef = useRef(onPlayingVerseChange);
  const prevStatusRef = useRef(playback.status);
  const chapterKeyRef = useRef<string | null>(null);
  /** Avoid double-seek when play() already sought before status becomes playing. */
  const playingVerseRef = useRef<number | null>(null);

  uriRef.current = uri;
  verseRef.current = verse;
  timestampsRef.current = verseTimestamps;
  dblIdRef.current = dblAudioBibleId;
  onPlayingVerseChangeRef.current = onPlayingVerseChange;

  const applyResponse = useCallback((data: ApiSourceAudioResponse) => {
    const resolved = resolveSourceAudioUri(data);
    setVerseTimestamps(data.verseTimestamps);
    setDblAudioBibleId(resolved?.item.dblAudioBibleId);
    setUri(resolved?.uri ?? null);
    setLoadState(resolved ? 'ready' : 'empty');
  }, []);

  const stopAndClearPlaying = useCallback(async () => {
    playingVerseRef.current = null;
    await playbackRef.current.stop();
    onPlayingVerseChangeRef.current?.(null);
  }, []);

  const resetLoadChrome = useCallback((next: SourceAudioLoadState) => {
    chapterKeyRef.current = null;
    setLoadState(next);
    setUri(null);
    setVerseTimestamps(undefined);
    setDblAudioBibleId(undefined);
  }, []);

  useEffect(() => {
    if (!enabled) {
      resetLoadChrome('empty');
      void stopAndClearPlaying();
      return;
    }

    if (projectId === null || projectId <= 0 || !bookCode?.trim()) {
      resetLoadChrome('empty');
      void stopAndClearPlaying();
      return;
    }

    // Language ISO may still be backfilling — don't claim "No source audio".
    if (!languageCode?.trim()) {
      resetLoadChrome('loading');
      void stopAndClearPlaying();
      return;
    }

    const cacheKey = chapterSourceAudioCacheKey({
      projectId,
      bookCode,
      chapter,
      bibleId,
      languageCode,
    });

    if (chapterKeyRef.current !== cacheKey) {
      chapterKeyRef.current = cacheKey;
      void stopAndClearPlaying();
    }

    const cached = responseCacheRef.current.get(cacheKey);
    if (cached) {
      applyResponse(cached);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoadState('loading');
    setUri(null);
    setVerseTimestamps(undefined);
    setDblAudioBibleId(undefined);

    (async () => {
      try {
        const data = await fetchChapterSourceAudio({
          projectId,
          bookCode,
          chapter,
          languageCode,
          bibleId,
        });
        if (requestId !== requestIdRef.current) return;
        responseCacheRef.current.set(cacheKey, data);
        applyResponse(data);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        log.error('Failed to load source audio', {
          error: isApiError(error) ? error.message : error,
        });
        setUri(null);
        setVerseTimestamps(undefined);
        setDblAudioBibleId(undefined);
        setLoadState('error');
      }
    })();
  }, [
    applyResponse,
    bibleId,
    bookCode,
    chapter,
    enabled,
    fetchChapterSourceAudio,
    languageCode,
    projectId,
    resetLoadChrome,
    retryToken,
    stopAndClearPlaying,
  ]);

  useEffect(() => {
    return () => {
      playingVerseRef.current = null;
      void playbackRef.current.stop();
      onPlayingVerseChangeRef.current?.(null);
    };
  }, []);

  // While already playing, verse change seeks to that verse's start.
  useEffect(() => {
    if (playback.status !== 'playing' || !uri) {
      if (playback.status !== 'playing') {
        playingVerseRef.current = null;
      }
      return;
    }
    if (playingVerseRef.current === verse) return;
    playingVerseRef.current = verse;
    const startMs = verseStartMs(verse, verseTimestamps, dblAudioBibleId);
    void playbackRef.current.seek(startMs);
    onPlayingVerseChangeRef.current?.(verse);
  }, [verse, playback.status, uri, verseTimestamps, dblAudioBibleId]);

  // Natural end clears Bible-tab highlight.
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = playback.status;
    if (prev === 'playing' && playback.status === 'idle') {
      playingVerseRef.current = null;
      onPlayingVerseChangeRef.current?.(null);
    }
  }, [playback.status]);

  const play = useCallback(async () => {
    const currentUri = uriRef.current;
    if (!currentUri) return;
    const startMs = verseStartMs(
      verseRef.current,
      timestampsRef.current,
      dblIdRef.current,
    );
    playingVerseRef.current = verseRef.current;
    // Load + seek before play so verse starts do not briefly sound from 0:00.
    await playbackRef.current.load(currentUri);
    if (startMs > 0) {
      await playbackRef.current.seek(startMs);
    }
    await playbackRef.current.play(currentUri);
    onPlayingVerseChangeRef.current?.(verseRef.current);
  }, []);

  const pause = useCallback(async () => {
    playingVerseRef.current = null;
    await playbackRef.current.pause();
    onPlayingVerseChangeRef.current?.(null);
  }, []);

  const seek = useCallback(async (ms: number) => {
    const currentUri = uriRef.current;
    if (!currentUri) return;
    if (playbackRef.current.status === 'idle') {
      await playbackRef.current.load(currentUri);
    }
    await playbackRef.current.seek(ms);
  }, []);

  const stop = useCallback(async () => {
    await stopAndClearPlaying();
  }, [stopAndClearPlaying]);

  const retry = useCallback(() => {
    if (projectId !== null && bookCode && languageCode) {
      responseCacheRef.current.delete(
        chapterSourceAudioCacheKey({
          projectId,
          bookCode,
          chapter,
          bibleId,
          languageCode,
        }),
      );
    }
    setRetryToken(t => t + 1);
  }, [bibleId, bookCode, chapter, languageCode, projectId]);

  return {
    loadState,
    status: playback.status,
    positionMs: playback.positionMs,
    durationMs: playback.durationMs,
    isPlaying: playback.status === 'playing',
    play,
    pause,
    seek,
    stop,
    retry,
  };
}
