import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DraftingProvider } from '../../app/context/DraftingContext';
import type { ChapterAssignmentData } from '../../types/db/types';
import {
  SourceAudioBarSlot,
  SourceAudioProvider,
  useSourceAudioRecordTabIntegration,
} from './SourceAudioShell';

jest.mock('../../db/queries', () => ({
  getRecordedVerseNumbers: jest.fn(async () => new Set()),
  getPericopesForChapter: jest.fn(async () => []),
  getSelectedTakeCoverages: jest.fn(async () => []),
}));

jest.mock('../../db/repository', () => ({
  getProjectPericopeSetId: jest.fn(async () => null),
}));

jest.mock('../../hooks/useDraftingUnit', () => ({
  useDraftingUnit: () => ({
    draftingUnit: 'verse',
    setDraftingUnit: jest.fn(),
  }),
}));

const mockUseSourceAudio = jest.fn();
const mockPause = jest.fn().mockResolvedValue(undefined);
const mockStop = jest.fn().mockResolvedValue(undefined);
const mockPlay = jest.fn().mockResolvedValue(undefined);

jest.mock('../../hooks/useSourceAudio', () => ({
  useSourceAudio: (...args: unknown[]) => mockUseSourceAudio(...args),
}));

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
  status: 'unassigned',
  hasConflict: false,
};

const verses = [
  {
    bibleId: 1,
    bookId: 40,
    chapterNumber: 14,
    verseNumber: 3,
    text: 'Verse three',
  },
  {
    bibleId: 1,
    bookId: 40,
    chapterNumber: 14,
    verseNumber: 4,
    text: 'Verse four',
  },
  {
    bibleId: 1,
    bookId: 40,
    chapterNumber: 14,
    verseNumber: 5,
    text: 'Verse five',
  },
];

function renderSlot(
  activeTab: 'bible' | 'record' | 'resources',
  recordCaptureActive = false,
) {
  mockUseSourceAudio.mockReturnValue({
    loadState: 'ready',
    status: 'idle',
    positionMs: 0,
    durationMs: 60000,
    isPlaying: false,
    verseTimestamps: undefined,
    play: mockPlay,
    pause: mockPause,
    seek: jest.fn(),
    stop: mockStop,
    retry: jest.fn(),
  });

  return render(
    <DraftingProvider verses={verses} initialVerse={3}>
      <SourceAudioProvider
        chapterData={chapterData}
        activeTab={activeTab}
        recordCaptureActive={recordCaptureActive}
      >
        <SourceAudioBarSlot />
      </SourceAudioProvider>
    </DraftingProvider>,
  );
}

describe('SourceAudioBarSlot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the player on the Bible tab', () => {
    renderSlot('bible');
    expect(screen.getByTestId('source-audio-bar')).toBeTruthy();
    expect(screen.getByTestId('source-audio-label')).toHaveTextContent(
      'BSB Source Audio · Verse 3 / 3',
    );
  });

  it('shows the player on the Record tab', () => {
    renderSlot('record');
    expect(screen.getByTestId('source-audio-bar')).toBeTruthy();
  });

  it('hides the player on the Resources tab', () => {
    renderSlot('resources');
    expect(screen.queryByTestId('source-audio-bar')).toBeNull();
  });

  it('hides the player while recording is active', () => {
    renderSlot('record', true);
    expect(screen.queryByTestId('source-audio-bar')).toBeNull();
  });

  it('wires useSourceAudio to the selected drafting verse', () => {
    renderSlot('bible');
    expect(mockUseSourceAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 1,
        bookCode: 'MRK',
        chapter: 14,
        bibleId: 1,
        languageCode: undefined,
        verse: 3,
        enabled: true,
      }),
    );
  });
});

function IntegrationProbe({
  sourceEnabled,
  verseAudioState,
  pauseDraftPlayback = jest.fn().mockResolvedValue(undefined),
}: {
  sourceEnabled: boolean;
  verseAudioState: string;
  pauseDraftPlayback?: () => Promise<void>;
}) {
  useSourceAudioRecordTabIntegration({
    sourceEnabled,
    verseAudioState,
    pauseDraftPlayback,
  });
  return null;
}

describe('useSourceAudioRecordTabIntegration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stops source audio when draft take playback starts', () => {
    mockUseSourceAudio.mockReturnValue({
      loadState: 'ready',
      status: 'playing',
      positionMs: 0,
      durationMs: 60000,
      isPlaying: true,
      play: mockPlay,
      pause: mockPause,
      seek: jest.fn(),
      stop: mockStop,
      retry: jest.fn(),
    });

    render(
      <DraftingProvider verses={verses} initialVerse={3}>
        <SourceAudioProvider
          chapterData={chapterData}
          activeTab="record"
          recordCaptureActive={false}
        >
          <IntegrationProbe sourceEnabled={true} verseAudioState="playing" />
        </SourceAudioProvider>
      </DraftingProvider>,
    );

    expect(mockStop).toHaveBeenCalled();
  });

  it('does not re-enable source audio on positionMs ticks while disabled (#596)', () => {
    // Context value used to change every positionMs tick; effects depended on
    // `ctx` and toggled recordTabSourceEnabled in cleanup/setup → depth error.
    // On the Record tab, enabled mirrors recordTabSourceEnabled — assert it
    // stays false across ticks instead of flipping true↔false.
    let positionMs = 0;
    mockUseSourceAudio.mockImplementation(() => ({
      loadState: 'ready',
      status: 'idle',
      get positionMs() {
        return positionMs;
      },
      durationMs: 60000,
      isPlaying: false,
      play: mockPlay,
      pause: mockPause,
      seek: jest.fn(),
      stop: mockStop,
      retry: jest.fn(),
    }));

    const pauseDraft = jest.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <DraftingProvider verses={verses} initialVerse={3}>
        <SourceAudioProvider
          chapterData={chapterData}
          activeTab="record"
          recordCaptureActive={false}
        >
          <IntegrationProbe
            sourceEnabled={false}
            verseAudioState="recording"
            pauseDraftPlayback={pauseDraft}
          />
        </SourceAudioProvider>
      </DraftingProvider>,
    );

    mockUseSourceAudio.mockClear();

    for (let i = 1; i <= 50; i += 1) {
      positionMs = i * 100;
      rerender(
        <DraftingProvider verses={verses} initialVerse={3}>
          <SourceAudioProvider
            chapterData={chapterData}
            activeTab="record"
            recordCaptureActive={false}
          >
            <IntegrationProbe
              sourceEnabled={false}
              verseAudioState="recording"
              pauseDraftPlayback={pauseDraft}
            />
          </SourceAudioProvider>
        </DraftingProvider>,
      );
    }

    const enabledFlags = mockUseSourceAudio.mock.calls.map(
      call => (call[0] as { enabled?: boolean }).enabled,
    );
    expect(enabledFlags.length).toBeGreaterThan(0);
    expect(enabledFlags.every(flag => flag === false)).toBe(true);
  });
});
