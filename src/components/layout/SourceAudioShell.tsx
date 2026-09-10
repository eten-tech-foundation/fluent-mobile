import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDraftingContext } from '../../app/context/DraftingContext';
import { useDraftingUnit } from '../../hooks/useDraftingUnit';
import { useSourceAudio } from '../../hooks/useSourceAudio';
import type { ChapterAssignmentData } from '../../types/db/types';
import { SourceAudioPlayerBar } from './SourceAudioPlayerBar';
import type { DraftingTab } from './DraftingTabBar';

type DraftAudioBridge = {
  pausePlayback: () => Promise<void>;
};

type SourceAudioShellContextValue = {
  barVisible: boolean;
  sourceLabel: string;
  unitCaption: string;
  loadState: ReturnType<typeof useSourceAudio>['loadState'];
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
  isLoadingAudio: boolean;
  status: ReturnType<typeof useSourceAudio>['status'];
  handlePlayPause: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  retry: () => void;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  setRecordTabSourceEnabled: (enabled: boolean) => void;
  setDraftBridge: (bridge: DraftAudioBridge | null) => void;
};

const SourceAudioShellContext =
  createContext<SourceAudioShellContextValue | null>(null);

type SourceAudioProviderProps = {
  chapterData: ChapterAssignmentData;
  activeTab: DraftingTab;
  recordCaptureActive: boolean;
  children: React.ReactNode;
};

/**
 * Owns chapter source-audio playback for the drafting shell (#412).
 * Uses the real fetch/playback hook from #235 / #449.
 */
export function SourceAudioProvider({
  chapterData,
  activeTab,
  recordCaptureActive,
  children,
}: SourceAudioProviderProps) {
  const {
    selectedVerse,
    verses,
    currentlyPlayingVerse,
    setCurrentlyPlayingVerse,
  } = useDraftingContext();
  const { draftingUnit } = useDraftingUnit();
  const [recordTabSourceEnabled, setRecordTabSourceEnabledState] =
    useState(true);
  const pauseDraftPlaybackRef = useRef<() => Promise<void>>(async () => {});

  const barVisible =
    (activeTab === 'bible' || activeTab === 'record') && !recordCaptureActive;
  const enabled =
    barVisible && (activeTab !== 'record' || recordTabSourceEnabled);

  const sourceAudio = useSourceAudio({
    projectId: chapterData.projectId,
    bookCode: chapterData.bookCode,
    chapter: chapterData.chapterNumber,
    bibleId: chapterData.bibleId,
    languageCode: chapterData.sourceLanguageCode,
    verse: selectedVerse,
    enabled,
    onPlayingVerseChange: setCurrentlyPlayingVerse,
  });

  const setRecordTabSourceEnabled = useCallback((next: boolean) => {
    setRecordTabSourceEnabledState(next);
  }, []);

  const setDraftBridge = useCallback((bridge: DraftAudioBridge | null) => {
    pauseDraftPlaybackRef.current = bridge?.pausePlayback ?? (async () => {});
  }, []);

  const handlePlayPause = useCallback(async () => {
    if (sourceAudio.isPlaying) {
      await sourceAudio.pause();
      return;
    }
    await pauseDraftPlaybackRef.current();
    await sourceAudio.play();
  }, [sourceAudio]);

  useEffect(() => {
    if (!barVisible && sourceAudio.status !== 'idle') {
      void sourceAudio.pause();
    }
  }, [barVisible, sourceAudio.status, sourceAudio.pause]);

  const displayVerse =
    currentlyPlayingVerse !== null &&
    (sourceAudio.status === 'playing' || sourceAudio.status === 'paused')
      ? currentlyPlayingVerse
      : selectedVerse;
  const verseIndex = verses.findIndex(v => v.verseNumber === selectedVerse);

  const unitCaption =
    draftingUnit === 'pericope' && verses.length > 0 && verseIndex >= 0
      ? `Pericope ${verseIndex + 1} / ${verses.length}`
      : verses.length > 0
      ? `Verse ${displayVerse} / ${verses.length}`
      : `Verse ${displayVerse}`;

  const value = useMemo<SourceAudioShellContextValue>(
    () => ({
      barVisible,
      sourceLabel:
        chapterData.bibleAbbreviation?.trim() ||
        chapterData.bibleName?.trim() ||
        'Source',
      unitCaption,
      loadState: sourceAudio.loadState,
      positionMs: sourceAudio.positionMs,
      durationMs: sourceAudio.durationMs,
      isPlaying: sourceAudio.isPlaying,
      isLoadingAudio: sourceAudio.isLoadingAudio || false,
      status: sourceAudio.status,
      handlePlayPause,
      seek: sourceAudio.seek,
      retry: sourceAudio.retry,
      pause: sourceAudio.pause,
      stop: sourceAudio.stop,
      setRecordTabSourceEnabled,
      setDraftBridge,
    }),
    [
      barVisible,
      chapterData.bibleAbbreviation,
      chapterData.bibleName,
      currentlyPlayingVerse,
      displayVerse,
      draftingUnit,
      unitCaption,
      sourceAudio.loadState,
      sourceAudio.positionMs,
      sourceAudio.durationMs,
      sourceAudio.isPlaying,
      sourceAudio.isLoadingAudio,
      sourceAudio.status,
      sourceAudio.seek,
      sourceAudio.retry,
      sourceAudio.pause,
      sourceAudio.stop,
      handlePlayPause,
      setRecordTabSourceEnabled,
      setDraftBridge,
    ],
  );

  return (
    <SourceAudioShellContext.Provider value={value}>
      {children}
    </SourceAudioShellContext.Provider>
  );
}

/** Renders the shell player between tab content and the bottom tab bar. */
export function SourceAudioBarSlot() {
  const ctx = useContext(SourceAudioShellContext);

  if (!ctx?.barVisible) {
    return null;
  }

  return (
    <SourceAudioPlayerBar
      sourceLabel={ctx.sourceLabel}
      unitCaption={ctx.unitCaption}
      loadState={ctx.loadState}
      isPlaying={ctx.isPlaying}
      isLoadingAudio={ctx.isLoadingAudio}
      positionMs={ctx.positionMs}
      durationMs={ctx.durationMs}
      onPlayPause={() => {
        void ctx.handlePlayPause();
      }}
      onSeek={ms => {
        void ctx.seek(ms);
      }}
      onRetry={ctx.retry}
    />
  );
}

export function useSourceAudioControl(): Pick<
  SourceAudioShellContextValue,
  'pause' | 'stop' | 'status'
> | null {
  const ctx = useContext(SourceAudioShellContext);
  if (!ctx) {
    return null;
  }
  return { pause: ctx.pause, stop: ctx.stop, status: ctx.status };
}

type SourceAudioRecordTabIntegrationArgs = {
  sourceEnabled: boolean;
  verseAudioState: string;
  pauseDraftPlayback: () => Promise<void>;
};

/**
 * Record tab registers draft/source exclusivity with the shell player.
 * Keeps the same handler + effect pattern validated on #449.
 */
export function useSourceAudioRecordTabIntegration({
  sourceEnabled,
  verseAudioState,
  pauseDraftPlayback,
}: SourceAudioRecordTabIntegrationArgs): void {
  const ctx = useContext(SourceAudioShellContext);
  const pauseDraftPlaybackRef = useRef(pauseDraftPlayback);
  const stopSourceRef = useRef(ctx?.stop ?? (async () => {}));
  const isPlaying = ctx?.isPlaying ?? false;
  const status = ctx?.status ?? 'idle';

  pauseDraftPlaybackRef.current = pauseDraftPlayback;
  stopSourceRef.current = ctx?.stop ?? (async () => {});

  useEffect(() => {
    ctx?.setRecordTabSourceEnabled(sourceEnabled);
    return () => ctx?.setRecordTabSourceEnabled(true);
  }, [ctx, sourceEnabled]);

  useEffect(() => {
    ctx?.setDraftBridge({ pausePlayback: pauseDraftPlayback });
    return () => ctx?.setDraftBridge(null);
  }, [ctx, pauseDraftPlayback]);

  useEffect(() => {
    if (!isPlaying) return;
    if (verseAudioState !== 'playing') return;
    void pauseDraftPlaybackRef.current();
  }, [isPlaying, verseAudioState]);

  useEffect(() => {
    const draftOwnsAudio =
      verseAudioState === 'playing' || verseAudioState === 'recording';
    if (!draftOwnsAudio) return;
    if (status === 'idle') return;
    void stopSourceRef.current();
  }, [verseAudioState, status]);
}
