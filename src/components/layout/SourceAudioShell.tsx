import React, { createContext, useContext } from 'react';
import { ChapterAssignmentData } from '../../types/db/types';
import {
  useSourceAudio,
  type UseSourceAudioResult,
} from '../../hooks/useSourceAudio';
import { SourceAudioPlayerBar } from './SourceAudioPlayerBar';
import type { DraftingTab } from './DraftingTabBar';

type SourceAudioContextValue = UseSourceAudioResult | null;

const SourceAudioContext = createContext<SourceAudioContextValue>(null);

type SourceAudioProviderProps = {
  chapterData: ChapterAssignmentData;
  userId: number | null;
  children: React.ReactNode;
};

/**
 * Owns source-audio playback for the drafting shell (#412).
 */
export function SourceAudioProvider({
  chapterData,
  userId,
  children,
}: SourceAudioProviderProps) {
  const sourceAudio = useSourceAudio({ chapterData, userId });

  return (
    <SourceAudioContext.Provider value={sourceAudio}>
      {children}
    </SourceAudioContext.Provider>
  );
}

type SourceAudioBarSlotProps = {
  activeTab: DraftingTab;
  recordCaptureActive: boolean;
};

/** Renders the shell player between tab content and the bottom tab bar. */
export function SourceAudioBarSlot({
  activeTab,
  recordCaptureActive,
}: SourceAudioBarSlotProps) {
  const sourceAudio = useContext(SourceAudioContext);

  if (!sourceAudio) {
    return null;
  }

  const visibleOnTab = activeTab === 'bible' || activeTab === 'record';
  if (!visibleOnTab || recordCaptureActive) {
    return null;
  }

  return (
    <SourceAudioPlayerBar
      sourceLabel={sourceAudio.sourceLabel}
      unitLabel={sourceAudio.unitLabel}
      loadState={sourceAudio.loadState}
      positionMs={sourceAudio.positionMs}
      durationMs={sourceAudio.durationMs}
      isPlaying={sourceAudio.isPlaying}
      onTogglePlay={sourceAudio.togglePlay}
      onSeek={sourceAudio.seek}
      onRetry={sourceAudio.retry}
    />
  );
}

export function useSourceAudioControl(): Pick<
  UseSourceAudioResult,
  'pause'
> | null {
  const sourceAudio = useContext(SourceAudioContext);
  if (!sourceAudio) {
    return null;
  }
  return { pause: sourceAudio.pause };
}
