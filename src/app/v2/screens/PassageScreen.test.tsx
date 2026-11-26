import React from 'react';
import { Alert, BackHandler, StyleSheet } from 'react-native';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import PassageScreen from './PassageScreen';
import { useAccountActions } from '../../../hooks/useAccountActions';
import type { TranslationNoteItem } from '../../../types/resources/translationNotes';
import type { TranslationNotesLoadState } from '../../../hooks/useTranslationNotesForUnit';
import type { Passage, PassageDownload } from '../../../hooks/usePassage';
import { UNDO_MS } from '../../../hooks/usePendingDelete';
import { hrefs } from '../../../navigation/hrefs';
import {
  getRecordCaptureGate,
  resetRecordCaptureGateForTests,
  setRecordCaptureGate,
} from '../../../navigation/recordCaptureGate';
import { logger } from '../../../utils/logger';
import { getStageAdvanceDestination } from '../../../utils/stageAdvancement';

const mockAddListener = jest.fn(
  (
    _event: string,
    _listener: (event: { preventDefault: () => void }) => void,
  ) => jest.fn(),
);

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDownload = jest.fn();
const mockStart = jest.fn(async () => {});
const mockStop = jest.fn(async () => {});
const mockPause = jest.fn(async () => {});
const mockResume = jest.fn(async () => {});
const mockDiscard = jest.fn(async () => {});
const publishedControls = {
  resume: mockResume,
  discardCapture: mockDiscard,
};
const mockEnsureMic = jest.fn(async () => true);
const mockPlayTake = jest.fn(async () => {});
const mockPlayStitched = jest.fn(async (_row: unknown) => {});
const mockPauseTake = jest.fn(async () => {});
const mockStopPlayback = jest.fn(async () => {});
const mockDeleteTake = jest.fn(async (_id: string) => {});
const mockSelectTake = jest.fn(async (_id: string) => true);
const mockSetCanonical = jest.fn(async (_id: string) => true);
const mockBlockReplacement = jest.fn(async (_id: string) => false);
type MockTake = {
  id: string;
  takeNumber: number;
  granularity: string;
  isSelected: boolean;
  isCanonical?: boolean;
  syncStatus?: string;
  durationMs: number;
  startChapter?: number;
  startVerse?: number;
  endChapter?: number;
  endVerse?: number;
  localFilePath?: string;
};
const mockSessionArgs = jest.fn();
const mockReload = jest.fn();
const sessionDefaults = {
  state: 'idle' as string,
  captureActive: false,
  isTaken: false,
  stageLocked: false,
  captureDisabled: false,
  drafterCaptureBlocked: false,
  canRecordNewTake: true,
  pericopeUnavailable: false,
  takes: [] as MockTake[],
  allTakes: [] as Record<string, unknown>[],
  captureBibleTextId: 1022 as number | null,
  playingTakeId: null as string | null,
  positionMs: 0,
  hasMultipleRecorders: false,
};
let mockSession = { ...sessionDefaults };
const mockSeekTake = jest.fn(async () => {});
const take = (n: number): MockTake => ({
  id: `t${n}`,
  takeNumber: n,
  granularity: 'pericope',
  isSelected: false,
  durationMs: 10000,
  startChapter: 14,
  endChapter: 14,
});
let mockPassage: Passage = { status: 'loading' };
let mockDownloadState: PassageDownload = 'idle';
let mockReduceMotion = false;
let mockFocused = true;
let mockNotes: TranslationNoteItem[] = [];
let mockNotesFailed = false;
/** Overrides `mockNotes` / `mockNotesFailed` with an exact loader state. */
let mockNotesState: TranslationNotesLoadState | null = null;
const mockNotesRetry = jest.fn();
let mockOnline = true;
const mockNotesFor = jest.fn(
  (_args: { projectId: number | null; isOnline?: boolean }) => {},
);
const baseParams = {
  chapterId: '5',
  anchorVerse: '22',
  projectId: '9',
  projectUnitId: '3',
  chapterName: 'Mark 14',
  projectName: 'Mark Telugu',
  milestoneName: 'Gospels Phase 1',
  language: 'Telugu',
};
let mockParams: Record<string, string> = { ...baseParams };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => mockFocused,
  useNavigation: () => ({
    addListener: mockAddListener,
    isFocused: () => mockFocused,
  }),
}));

jest.mock('../../../hooks/useRecordSession', () => {
  const React = require('react');
  return {
    useRecordSession: (args: {
      selectedVerse: number;
      draftingUnit: string;
      onCaptureActiveChange?: (active: boolean) => void;
      onRegisterCaptureControls?: (
        controls: {
          resume: () => Promise<void>;
          discardCapture: () => Promise<void>;
        } | null,
      ) => void;
    }) => {
      mockSessionArgs(args);
      const blocked =
        mockSession.captureActive || mockSession.state === 'saving';
      const onCaptureActiveChange = args.onCaptureActiveChange;
      const onRegisterCaptureControls = args.onRegisterCaptureControls;
      React.useEffect(() => {
        onCaptureActiveChange?.(blocked);
        onRegisterCaptureControls?.(
          mockSession.captureActive ? publishedControls : null,
        );
      }, [blocked, onCaptureActiveChange, onRegisterCaptureControls]);
      return {
        verseAudio: {
          state: mockSession.state,
          takes: mockSession.takes,
          deleteTake: mockDeleteTake,
          playingTakeId: mockSession.playingTakeId,
          positionMs: mockSession.positionMs,
          selectedTake: mockSession.takes.find(t => t.isSelected) ?? null,
          start: mockStart,
          stop: mockStop,
          pause: mockPause,
          resume: mockResume,
          discardCapture: mockDiscard,
          pausePlayback: mockPauseTake,
          stopPlayback: mockStopPlayback,
          playTake: mockPlayTake,
          playStitched: mockPlayStitched,
          seekStitched: jest.fn(),
          stitchPositionMs: 0,
          selectTake: mockSelectTake,
          setCanonical: mockSetCanonical,
          blockUnsupportedReplacement: mockBlockReplacement,
          ownCanonicalTakeId: null,
          allTakes: mockSession.allTakes,
          hasMultipleRecorders: mockSession.hasMultipleRecorders,
          loadedTakeId: null,
          playbackStatus: 'idle',
          durationMs: 0,
          seek: mockSeekTake,
          getMetering: () => null,
          canRecordNewTake: mockSession.canRecordNewTake,
        },
        effectiveUnit: 'pericope',
        elapsedMs: 13000,
        setElapsedMs: jest.fn(),
        captureActive: mockSession.captureActive,
        syncingMessage: null,
        isTaken: mockSession.isTaken,
        stageLocked: mockSession.stageLocked,
        drafterCaptureBlocked: mockSession.drafterCaptureBlocked,
        captureDisabled: mockSession.captureDisabled,
        pericopeUnavailable: mockSession.pericopeUnavailable,
        activeRecordingUnit: { coveredViews: [] },
        ensureMic: mockEnsureMic,
        resetCapture: jest.fn(),
        captureBibleTextId: mockSession.captureBibleTextId,
      };
    },
  };
});

jest.mock('../../../utils/parseUserId', () => ({ parseUserId: () => 7 }));

const mockMissingAudio = new Set<string>();
jest.mock('../../../utils/audioStorage', () => ({
  ...jest.requireActual('../../../utils/audioStorage'),
  fileExists: async (path: string) => !mockMissingAudio.has(path),
  fileSize: async () => 1000,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReduceMotion,
}));

jest.mock('react-native-gesture-handler', () => {
  const pan = {
    withTestId: () => pan,
    enabled: () => pan,
    activeOffsetX: () => pan,
    activeOffsetY: () => pan,
    failOffsetY: () => pan,
    activateAfterLongPress: () => pan,
    onStart: () => pan,
    onUpdate: () => pan,
    onEnd: () => pan,
  };
  const Pass = ({ children }: { children: React.ReactNode }) => children;
  return {
    Gesture: { Pan: () => pan, Tap: () => pan, Race: () => pan },
    GestureDetector: Pass,
    GestureHandlerRootView: Pass,
  };
});

/** Paused-take markers as stored, for a page opened to recover one. */
let mockStoredMarkers: unknown[] = [];
jest.mock('../../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn((key: string) =>
      key === 'paused_take_markers_v1'
        ? JSON.stringify(mockStoredMarkers)
        : undefined,
    ),
    setItemSync: jest.fn(),
  },
}));

const mockOpenSync = jest.fn();
const mockRefreshSync = jest.fn();
const mockUseHeaderSync = jest.fn((_args: unknown) => ({
  status: 'online_synced',
  failedErrorText: null,
  openSync: mockOpenSync,
  refresh: mockRefreshSync,
}));
jest.mock('../../../hooks/useHeaderSync', () => ({
  useHeaderSync: (args: unknown) => mockUseHeaderSync(args),
}));

let mockDraftingUnit: 'pericope' | 'verse' = 'pericope';
jest.mock('../../../hooks/useDraftingUnit', () => ({
  useDraftingUnit: () => ({ draftingUnit: mockDraftingUnit }),
}));

const mockUnuploadable = jest.fn(async () => false);
jest.mock('../../../db/queries', () => ({
  chapterHasUnuploadableSelectedTakes: () => mockUnuploadable(),
}));

let mockStageSend: unknown = null;
const mockSendToStage = jest.fn();
jest.mock('../../../services/stageSend', () => ({
  StageSendBlockedError: class extends Error {},
  readStageSend: async () => mockStageSend,
  sendChapterToStage: (...args: unknown[]) => mockSendToStage(...args),
}));

let mockObserverGrant = false;
let mockTranslatorGrant = false;
jest.mock('../../../services/userOrgGrants', () => ({
  hasProjectObserverGrant: () => mockObserverGrant,
}));
jest.mock('../../../utils/myWorkDraftDownload', () => ({
  hasProjectTranslatorGrant: () => mockTranslatorGrant,
}));

jest.mock('../../../hooks/useHaptics', () => ({
  useHaptics: () => ({
    press: jest.fn(),
    toggle: jest.fn(),
    dragStart: jest.fn(),
    dragEnd: jest.fn(),
  }),
}));

jest.mock('../../../assets/icons/trash-open.svg', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return () => MockReact.createElement(View);
});

jest.mock('../../../hooks/useTranslationNotesForUnit', () => ({
  useTranslationNotesForUnit: (args: {
    projectId: number | null;
    isOnline?: boolean;
  }) => {
    mockNotesFor(args);
    return {
      state:
        mockNotesState ??
        (mockNotesFailed
          ? { status: 'error', message: 'Notes failed', failedRefs: [] }
          : {
              status: 'ready',
              notes: mockNotes,
              failedRefs: [],
              unavailableOfflineRefs: [],
            }),
      retry: mockNotesRetry,
    };
  },
}));

const mockLoadQuestions = jest.fn(
  async (_args: { projectId: number | null }): Promise<unknown[]> => [],
);

jest.mock('../../../services/translationQuestions', () => ({
  loadTranslationQuestionsForUnit: (args: { projectId: number | null }) =>
    mockLoadQuestions(args),
}));

// Outside the Resources tests no image load settles, so the card's previews
// can't update state after a test ends; those tests opt into results.
const loadNever = (_args: { projectId: number | null }): Promise<unknown[]> =>
  new Promise(() => {});
const loadNoImages = (args: { projectId: number | null }): Promise<unknown[]> =>
  args.projectId === null ? new Promise(() => {}) : Promise.resolve([]);
const mockLoadImages = jest.fn(loadNever);

jest.mock('../../../services/imagesMaps', () => ({
  loadImagesMapsForUnit: (args: { projectId: number | null }) =>
    mockLoadImages(args),
}));

jest.mock('../../../hooks/useResourcesInventory', () => ({
  useResourcesInventory: () => ({
    inventoryVersion: 0,
    downloadedSections: [],
    getResourceStatus: () => 'available',
  }),
}));

const mockUsePassage = jest.fn();
jest.mock('../../../hooks/usePassage', () => ({
  usePassage: (...args: unknown[]) => {
    mockUsePassage(...args);
    return {
      passage: mockPassage,
      download: mockDownload,
      downloadState: mockDownloadState,
      reload: mockReload,
    };
  },
}));

const mockPlaySource = jest.fn(async () => {});
const mockPauseSource = jest.fn(async () => {});
const mockSeekSource = jest.fn(async (_ms: number) => {});
const mockRetrySource = jest.fn();
type MockLoadState = 'loading' | 'ready' | 'empty' | 'error';
const sourceDefaults = {
  loadState: 'ready' as MockLoadState,
  status: 'idle',
  positionMs: 0,
  durationMs: 0,
  isPlaying: false,
  isLoadingAudio: false,
  play: mockPlaySource,
  pause: mockPauseSource,
  seek: mockSeekSource,
  stop: jest.fn(async () => {}),
  retry: mockRetrySource,
  verseTimestamps: undefined as
    | { verse: number; startSeconds: number }[]
    | undefined,
};
let mockSource = { ...sourceDefaults };
const mockUseSourceAudio = jest.fn((_args: unknown) => mockSource);

jest.mock('../../../hooks/useSourceAudio', () => ({
  useSourceAudio: (args: unknown) => mockUseSourceAudio(args),
}));

jest.mock('../../../hooks/useConnectivity', () => ({
  useConnectivity: () => ({ isOnline: mockOnline, hasResolved: true }),
}));

const ready: Extract<Passage, { status: 'ready' }> = {
  status: 'ready',
  title: 'The Last Supper',
  wholeChapter: false,
  reference: 'Mark 14:22–25',
  verses: [
    {
      chapterNumber: 14,
      verseNumber: 22,
      text: 'While they were eating',
      recorded: 'passage',
    },
    {
      chapterNumber: 14,
      verseNumber: 23,
      text: 'Then he took a cup',
      recorded: 'passage',
    },
  ],
  downloaded: true,
  recordedStatus: 'recorded',
  assignment: {
    id: 5,
    projectId: 9,
    bibleId: 4,
    bookCode: 'MRK',
    chapterNumber: 14,
    sourceLanguageCode: 'tel',
  } as Extract<Passage, { status: 'ready' }>['assignment'],
  chapterVerseCount: 72,
  waitingToSend: false,
  takes: [
    {
      id: 'a',
      takeNumber: 1,
      selected: false,
      recordedAt: '2026-10-19T10:00:00Z',
    },
    {
      id: 'b',
      takeNumber: 2,
      selected: true,
      recordedAt: '2026-10-20T10:00:00Z',
    },
  ],
};

const hidden = { includeHiddenElements: true };

const settle = async () => {
  await act(() => jest.advanceTimersByTime(1000));
};

/**
 * Renders under fake timers and lets the mount animations finish, as they
 * would before a tap; a pending one would otherwise close the title's sheet.
 */
async function renderSettled() {
  jest.useFakeTimers();
  await render(<PassageScreen />);
  await settle();
}

const titleCopies = () =>
  within(screen.getByTestId('passage-title')).getAllByText(
    'The Last Supper',
    hidden,
  );

/** A 360-wide header, with the title at the given width. */
async function layOutTitle(titleWidth: number) {
  await fireEvent(screen.getByTestId('passage-header'), 'layout', {
    nativeEvent: { layout: { width: 360, height: 72 } },
  });
  await fireEvent(titleCopies()[0], 'layout', {
    nativeEvent: { layout: { width: titleWidth, height: 16 } },
  });
}

function tickerOffset(): number {
  const { transform } = getAnimatedStyle(
    screen.getByTestId('passage-title-ticker', hidden),
  ) as { transform: { translateX: number }[] };
  return transform[0].translateX;
}

describe('PassageScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRecordCaptureGateForTests();
    mockSession = { ...sessionDefaults };
    mockMissingAudio.clear();
    mockParams = { ...baseParams };
    mockPassage = ready;
    mockDownloadState = 'idle';
    mockRefreshSync.mockClear();
    mockSource = { ...sourceDefaults };
    mockReduceMotion = false;
    mockFocused = true;
    mockNotes = [];
    mockNotesFailed = false;
    mockNotesState = null;
    mockOnline = true;
    mockDraftingUnit = 'pericope';
    mockUnuploadable.mockResolvedValue(false);
    mockObserverGrant = false;
    mockTranslatorGrant = false;
    mockLoadQuestions.mockResolvedValue([]);
    mockLoadImages.mockImplementation(loadNever);
    mockStageSend = null;
    mockStoredMarkers = [];
  });

  afterEach(() => {
    jest.useRealTimers();
    logger.reset();
  });

  it("opens the book page at this chapter from the title's sheet", async () => {
    await renderSettled();
    expect(screen.queryByTestId('passage-book')).toBeNull();

    await fireEvent.press(
      screen.getByRole('button', { name: 'The Last Supper. Show details.' }),
    );
    await settle();
    expect(
      within(screen.getByTestId('passage-title-sheet')).getByRole('header', {
        name: 'The Last Supper',
      }),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Mark 14 · Gospels Phase 1. Open book page.',
      }),
    );
    await settle();

    expect(screen.queryByTestId('passage-title-sheet')).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(
      hrefs.chapters({
        projectId: 9,
        projectUnitId: 3,
        projectName: 'Mark Telugu',
        milestoneName: 'Gospels Phase 1',
        language: 'Telugu',
        focusChapterId: 5,
      }),
    );
  });

  it('goes back to the book page it came from instead of stacking another', async () => {
    mockParams = { ...baseParams, from: 'book' };
    await renderSettled();

    await fireEvent.press(screen.getByTestId('passage-title'));
    await fireEvent.press(screen.getByTestId('passage-book'));
    await settle();

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('runs a title too long for the header as a ticker, after a pause', async () => {
    await renderSettled();
    await layOutTitle(400);

    expect(titleCopies()).toHaveLength(2);
    expect(
      within(screen.getByTestId('passage-title')).queryAllByText(
        'The Last Supper',
      ),
    ).toHaveLength(0);
    await act(() => jest.advanceTimersByTime(1500));
    expect(tickerOffset()).toBe(0);
    await act(() => jest.advanceTimersByTime(1500));
    expect(tickerOffset()).toBeLessThan(0);
  });

  it('stops the ticker while another screen covers the player', async () => {
    await renderSettled();
    await layOutTitle(400);
    await act(() => jest.advanceTimersByTime(3000));
    expect(tickerOffset()).toBeLessThan(0);

    mockFocused = false;
    await screen.rerender(<PassageScreen />);
    await act(() => jest.advanceTimersByTime(3000));

    expect(tickerOffset()).toBe(0);
  });

  it('leaves a title that fits where it is', async () => {
    await renderSettled();
    await layOutTitle(200);
    await act(() => jest.advanceTimersByTime(3000));

    expect(titleCopies()).toHaveLength(1);
    expect(tickerOffset()).toBe(0);
  });

  it('shows a finished chapter as peer checked, with no Record', async () => {
    mockPassage = {
      ...ready,
      recordedStatus: 'none',
      takes: [],
      assignment: { ...ready.assignment, status: 'complete' },
    };
    await render(<PassageScreen />);

    expect(screen.getByTestId('passage-takes-meta').props.children).toBe(
      "Peer checked · Takes aren't on this phone",
    );
    expect(screen.queryByTestId('passage-record')).toBeNull();
    expect(screen.getByLabelText('Listen')).toBeTruthy();
  });

  it('keeps a long title still when motion is reduced', async () => {
    mockReduceMotion = true;
    await renderSettled();
    await layOutTitle(400);
    await act(() => jest.advanceTimersByTime(3000));

    expect(titleCopies()).toHaveLength(1);
    expect(screen.queryByTestId('passage-title-ticker', hidden)).toBeNull();
  });

  it('puts the script, its actions and takes in the hero, with no steps', async () => {
    await render(<PassageScreen />);

    expect(
      screen.getByRole('button', { name: 'The Last Supper. Show details.' }),
    ).toBeTruthy();
    expect(screen.getAllByText('Mark 14:22–25', hidden).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByLabelText('Listen')).toBeTruthy();
    expect(screen.getByLabelText('Record a take')).toBeTruthy();
    expect(screen.getByTestId('passage-takes-meta').props.children).toMatch(
      /^2 takes · /,
    );
    // The FIA steps have no audio anywhere yet (Q11), so they're hidden.
    expect(screen.queryByText('Listening materials', hidden)).toBeNull();
    expect(screen.queryByText('Hear & Heart', hidden)).toBeNull();
    expect(screen.queryByTestId('passage-pages', hidden)).toBeNull();
  });

  it('shows the verses that are on the phone when some are missing', async () => {
    mockPassage = {
      ...ready,
      downloaded: false,
      verses: [ready.verses[0], { ...ready.verses[1], text: '' }],
    };
    await render(<PassageScreen />);

    expect(screen.getByText(/While they were eating/)).toBeTruthy();
    expect(screen.getByText('The text isn’t on this phone yet.')).toBeTruthy();
  });

  it('highlights the verse the source audio is on', async () => {
    await render(<PassageScreen />);
    const { onPlayingVerseChange } = mockUseSourceAudio.mock.calls.at(
      -1,
    )?.[0] as { onPlayingVerseChange: (verse: number | null) => void };

    await act(() => onPlayingVerseChange(23));

    expect(screen.getByTestId('passage-script-playing')).toHaveTextContent(
      /Then he took a cup/,
    );
  });

  it('plays this chapter from Listen and pauses on the next press', async () => {
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-listen'));

    expect(mockUseSourceAudio.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        projectId: 9,
        bookCode: 'MRK',
        chapter: 14,
        bibleId: 4,
        languageCode: 'tel',
        verse: 22,
        enabled: true,
        isOnline: true,
        userId: 7,
      }),
    );
    expect(screen.getByLabelText('Play source audio')).toBeTruthy();
    expect(screen.getByLabelText('Close the player')).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Play source audio'));
    });

    expect(mockPauseTake).toHaveBeenCalled();
    expect(mockPlaySource).toHaveBeenCalledTimes(1);
    expect(mockPauseTake.mock.invocationCallOrder[0]).toBeLessThan(
      mockPlaySource.mock.invocationCallOrder[0],
    );
    expect(mockPush).not.toHaveBeenCalled();

    mockSource = {
      ...mockSource,
      isPlaying: true,
      positionMs: 2500,
      durationMs: 10000,
    };
    await screen.rerender(<PassageScreen />);

    expect(
      screen.getByTestId('passage-waveform').props.accessibilityValue,
    ).toMatchObject({ now: 25 });
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Pause source audio'));
    });
    expect(mockPauseSource).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('seeks the source chapter from the script waveform', async () => {
    mockSource = { ...mockSource, durationMs: 10000 };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-listen'));

    expect(screen.getByTestId('passage-waveform').props.accessibilityRole).toBe(
      'adjustable',
    );
    await fireEvent(
      screen.getByLabelText('Mark 14:22–25 playback'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } },
    );

    expect(mockSeekSource).toHaveBeenCalledWith(500);
  });

  it('scrubs and shows progress through the passage, not the chapter', async () => {
    mockSource = {
      ...mockSource,
      durationMs: 100000,
      positionMs: 30000,
      verseTimestamps: [
        { verse: 22, startSeconds: 20 },
        { verse: 23, startSeconds: 30 },
        { verse: 24, startSeconds: 40 },
      ],
    };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-listen'));

    // Verses 22–23 run 20s to 40s, where verse 24 starts; a step is 5%.
    expect(
      screen.getByTestId('passage-waveform').props.accessibilityValue,
    ).toMatchObject({ now: 50 });
    await fireEvent(
      screen.getByLabelText('Mark 14:22–25 playback'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } },
    );
    expect(mockSeekSource).toHaveBeenCalledWith(31000);
  });

  it('stops Listen when it reaches the end of the passage', async () => {
    const playing = {
      ...mockSource,
      isPlaying: true,
      durationMs: 100000,
      positionMs: 39000,
      verseTimestamps: [
        { verse: 22, startSeconds: 20 },
        { verse: 24, startSeconds: 40 },
      ],
    };
    mockSource = playing;
    const { rerender } = await render(<PassageScreen />);
    expect(mockPauseSource).not.toHaveBeenCalled();

    mockSource = { ...playing, positionMs: 40000 };
    await rerender(<PassageScreen />);

    expect(mockPauseSource).toHaveBeenCalledTimes(1);
  });

  it('keeps playing a replay while the position still reads the old end', async () => {
    const ended = {
      ...mockSource,
      durationMs: 100000,
      positionMs: 40000,
      verseTimestamps: [
        { verse: 22, startSeconds: 20 },
        { verse: 24, startSeconds: 40 },
      ],
    };
    mockSource = ended;
    const { rerender } = await render(<PassageScreen />);

    mockSource = { ...ended, isPlaying: true };
    await rerender(<PassageScreen />);
    mockSource = { ...ended, isPlaying: true, positionMs: 20000 };
    await rerender(<PassageScreen />);

    expect(mockPauseSource).not.toHaveBeenCalled();
  });

  it('does not play or leave when source audio is missing', async () => {
    mockSource = { ...mockSource, loadState: 'empty' };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-listen'));

    expect(
      screen.getByTestId('passage-key-listen').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByLabelText('No source audio'));
    expect(mockPlaySource).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('retries a failed source load without leaving the passage', async () => {
    mockSource = { ...mockSource, loadState: 'error' };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-listen'));

    await fireEvent.press(screen.getByLabelText('Retry loading source audio'));
    expect(mockRetrySource).toHaveBeenCalledTimes(1);
    expect(mockPlaySource).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('plays a take in Record and does not open Legacy drafting', async () => {
    mockSession = { ...mockSession, takes: [take(1)] };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));

    expect(mockUseSourceAudio.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ enabled: false }),
    );
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Play take'));
    });

    expect(mockPlayTake).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      undefined,
    );
    expect(mockPlaySource).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  describe('when Passage loses its route with a take playing', () => {
    const playing = () => {
      mockSession = {
        ...mockSession,
        takes: [{ ...take(1), isSelected: true }],
        state: 'playing',
        playingTakeId: 't1',
        positionMs: 4000,
      };
    };
    const stopped = () => {
      mockSession = { ...mockSession, state: 'recorded', playingTakeId: null };
    };
    async function openRecord() {
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      // The collapsed first render paused the take, as Record was hidden.
      mockPauseTake.mockClear();
    }

    it('stops review before Book is pushed over the open player', async () => {
      playing();
      await openRecord();

      await fireEvent.press(screen.getByTestId('passage-title'));
      await fireEvent.press(screen.getByTestId('passage-book'));

      expect(mockStopPlayback).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockStopPlayback.mock.invocationCallOrder[0]).toBeLessThan(
        mockPush.mock.invocationCallOrder[0],
      );
      expect(mockPauseTake).not.toHaveBeenCalled();
    });

    it('stops review before going back to the book page it came from', async () => {
      mockParams = { ...baseParams, from: 'book' };
      playing();
      await openRecord();

      await fireEvent.press(screen.getByTestId('passage-title'));
      await fireEvent.press(screen.getByTestId('passage-book'));

      expect(mockStopPlayback).toHaveBeenCalled();
      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockStopPlayback.mock.invocationCallOrder[0]).toBeLessThan(
        mockBack.mock.invocationCallOrder[0],
      );
    });

    it('stops review on Back', async () => {
      playing();
      await render(<PassageScreen />);

      await fireEvent.press(screen.getByTestId('passage-back', hidden));

      expect(mockStopPlayback).toHaveBeenCalled();
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('stops review when covered while still mounted, and waits for Play on return', async () => {
      playing();
      await openRecord();

      mockFocused = false;
      await screen.rerender(<PassageScreen />);
      expect(mockStopPlayback).toHaveBeenCalledTimes(1);

      stopped();
      await screen.rerender(<PassageScreen />);
      // Covered again before coming back: stopping twice is harmless.
      mockFocused = true;
      await screen.rerender(<PassageScreen />);
      mockFocused = false;
      await screen.rerender(<PassageScreen />);
      mockFocused = true;
      await screen.rerender(<PassageScreen />);
      expect(mockStopPlayback).toHaveBeenCalledTimes(2);
      expect(mockPlayTake).not.toHaveBeenCalled();

      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-play'));
      });
      expect(mockPlayTake).toHaveBeenCalledTimes(1);
      expect(mockPlayTake).toHaveBeenCalledWith(
        expect.objectContaining({ id: 't1' }),
        4000,
      );
    });

    it('keeps the spot a take was loading from when the route goes first', async () => {
      playing();
      await openRecord();
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-play'));
      });
      expect(mockPauseTake).toHaveBeenCalled();
      stopped();
      await screen.rerender(<PassageScreen />);
      let finishLoad = () => {};
      mockPlayTake.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            finishLoad = resolve;
          }),
      );
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-play'));
      });
      expect(mockPlayTake).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 't1' }),
        4000,
      );

      mockFocused = false;
      await screen.rerender(<PassageScreen />);
      expect(mockStopPlayback).toHaveBeenCalledTimes(1);
      await act(async () => finishLoad());
      mockFocused = true;
      await screen.rerender(<PassageScreen />);

      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-play'));
      });
      expect(mockPlayTake).toHaveBeenCalledTimes(2);
      expect(mockPlayTake).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 't1' }),
        4000,
      );
    });

    it('leaves a take saving alone', async () => {
      mockSession = { ...mockSession, state: 'saving', captureActive: false };
      await openRecord();

      mockFocused = false;
      await screen.rerender(<PassageScreen />);

      expect(mockStopPlayback).not.toHaveBeenCalled();
    });

    it('leaves a take being recorded to the capture guard', async () => {
      mockSession = { ...mockSession, state: 'recording', captureActive: true };
      await openRecord();

      mockFocused = false;
      await screen.rerender(<PassageScreen />);

      expect(mockStopPlayback).not.toHaveBeenCalled();
      expect(mockDiscard).not.toHaveBeenCalled();
      expect(mockStop).not.toHaveBeenCalled();
    });

    it('still pauses review when Record closes', async () => {
      playing();
      await openRecord();

      await fireEvent.press(screen.getByTestId('passage-close'));

      await waitFor(() => expect(mockPauseTake).toHaveBeenCalled());
      expect(mockStopPlayback).not.toHaveBeenCalled();
    });
  });

  it('keeps source audio off while a take capture is active', async () => {
    mockSession = { ...mockSession, state: 'recording', captureActive: true };
    await render(<PassageScreen />);

    expect(mockUseSourceAudio.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ enabled: false }),
    );
  });

  it('shows Eject when a take is recovered after Listen opened', async () => {
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-listen'));
    expect(screen.queryByLabelText('Finish take')).toBeNull();

    mockSession = { ...mockSession, state: 'paused', captureActive: true };
    await screen.rerender(<PassageScreen />);

    expect(screen.getByLabelText('Finish take')).toBeTruthy();
    expect(screen.queryByLabelText('Play source audio')).toBeNull();
  });

  it('refreshes the sync cloud after the passage text download finishes', async () => {
    mockDownloadState = 'downloading';
    await render(<PassageScreen />);
    expect(mockRefreshSync).not.toHaveBeenCalled();

    mockDownloadState = 'idle';
    await screen.rerender(<PassageScreen />);

    expect(mockRefreshSync).toHaveBeenCalledTimes(1);
  });

  it('keeps Previous and Next off on the one page', async () => {
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-listen'));

    for (const id of ['passage-key-previous', 'passage-key-next']) {
      expect(screen.getByTestId(id).props.accessibilityState).toMatchObject({
        disabled: true,
      });
    }
  });

  it('opens a translation note from its phrase and steps through the notes', async () => {
    mockNotes = [
      {
        id: 'elsewhere',
        title: 'Mark 14:22',
        quote: 'a phrase from another translation',
        body: 'This note quotes another translation.',
        verse: { chapterNumber: 14, verseNumber: 22 },
      },
      {
        id: 'cup',
        title: 'Mark 14:23',
        quote: '"took a cup"',
        body: '"took a cup"\nThe cup held wine.',
        verse: { chapterNumber: 14, verseNumber: 23 },
      },
    ];
    mockSource = { ...mockSource, isPlaying: true };
    jest.useFakeTimers();
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-listen'));
    // Phrases are drawn once the player stops moving.
    expect(screen.queryByLabelText('Translation note: took a cup')).toBeNull();
    await settle();
    expect(mockPauseSource).not.toHaveBeenCalled();

    await fireEvent.press(
      screen.getByLabelText('Translation note: took a cup'),
    );

    expect(screen.getByText('The cup held wine.')).toBeTruthy();
    expect(mockPauseSource).toHaveBeenCalled();
    expect(
      screen.getByLabelText("This note's audio isn't available yet"),
    ).toBeTruthy();
    expect(
      screen.getByTestId('passage-key-previous').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    await fireEvent.press(
      screen.getByLabelText('Next note: a phrase from another translation'),
    );
    expect(screen.getByLabelText('Note 2 of 2')).toBeTruthy();

    // The blue shrinks back before the note goes.
    await fireEvent.press(screen.getByLabelText('Close the note'));
    expect(screen.getByTestId('passage-note')).toBeTruthy();
    await settle();
    expect(screen.queryByTestId('passage-note')).toBeNull();
    expect(screen.getByLabelText('1 more translation note')).toBeTruthy();
  });

  it('turns to the next note when the pager is swiped', async () => {
    mockNotes = [
      {
        id: 'cup',
        title: 'Mark 14:23',
        quote: 'took a cup',
        body: 'The cup held wine.',
        verse: { chapterNumber: 14, verseNumber: 23 },
      },
      {
        id: 'elsewhere',
        title: 'Mark 14:22',
        quote: 'a phrase from another translation',
        body: 'This note quotes another translation.',
        verse: { chapterNumber: 14, verseNumber: 22 },
      },
    ];
    jest.useFakeTimers();
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-listen'));
    await settle();
    await fireEvent.press(
      screen.getByLabelText('Translation note: took a cup'),
    );
    const pager = screen.getByTestId('passage-note-pager');
    await fireEvent(pager.parent!, 'layout', {
      nativeEvent: { layout: { width: 360, height: 400 } },
    });

    await fireEvent(pager, 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 360, y: 0 } },
    });
    await settle();

    expect(screen.getByLabelText('Note 2 of 2')).toBeTruthy();
    expect(
      screen.getByText('This note quotes another translation.'),
    ).toBeTruthy();

    // A slow drag settles without momentum, and stays on the notes there are.
    await fireEvent(pager, 'scrollEndDrag', {
      nativeEvent: { contentOffset: { x: 0, y: 0 }, velocity: { x: 2, y: 0 } },
    });
    expect(screen.getByLabelText('Note 2 of 2')).toBeTruthy();
    await fireEvent(pager, 'scrollEndDrag', {
      nativeEvent: { contentOffset: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } },
    });
    expect(screen.getByLabelText('Note 1 of 2')).toBeTruthy();
    await fireEvent(pager, 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 1080, y: 0 } },
    });
    expect(screen.getByLabelText('Note 2 of 2')).toBeTruthy();
  });

  describe('before the player opens', () => {
    const lastNotesProject = () =>
      mockNotesFor.mock.calls.at(-1)?.[0].projectId;
    const lastSource = () =>
      mockUseSourceAudio.mock.calls.at(-1)?.[0] as {
        deferred?: boolean;
        enabled?: boolean;
      };

    it('asks for no notes or source audio while the passage is only read', async () => {
      await renderSettled();
      expect(lastNotesProject()).toBeNull();
      expect(lastSource().deferred).toBe(true);
    });

    it('wants both from Listen, and keeps them after the player closes', async () => {
      await renderSettled();
      await fireEvent.press(screen.getByTestId('passage-listen'));
      await settle();
      expect(lastNotesProject()).toBe(9);
      expect(lastSource()).toMatchObject({ deferred: false, enabled: true });

      await fireEvent.press(screen.getByTestId('passage-close'));
      await settle();
      expect(lastNotesProject()).toBe(9);
      expect(lastSource().deferred).toBe(false);
    });

    it('wants the notes from Record, and the source audio once Listen shows', async () => {
      await renderSettled();
      await fireEvent.press(screen.getByTestId('passage-record'));
      await settle();
      expect(lastNotesProject()).toBe(9);
      expect(lastSource()).toMatchObject({ deferred: false, enabled: false });
    });
  });

  it('strokes the note header while that note is scrolled under it', async () => {
    mockNotes = [
      {
        id: 'cup',
        title: 'Mark 14:23',
        quote: 'took a cup',
        body: 'The cup held wine.',
        verse: { chapterNumber: 14, verseNumber: 23 },
      },
      {
        id: 'elsewhere',
        title: 'Mark 14:22',
        quote: 'a phrase from another translation',
        body: 'This note quotes another translation.',
        verse: { chapterNumber: 14, verseNumber: 22 },
      },
    ];
    jest.useFakeTimers();
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-listen'));
    await settle();
    await fireEvent.press(
      screen.getByLabelText('Translation note: took a cup'),
    );
    await settle();
    const stroke = () => screen.getByTestId('passage-note-header-stroke');
    expect(stroke()).toHaveAnimatedStyle({ opacity: 0 });

    await fireEvent.scroll(screen.getByTestId('passage-note-page-0'), {
      nativeEvent: { contentOffset: { x: 0, y: 30 } },
    });
    await settle();
    expect(stroke()).toHaveAnimatedStyle({ opacity: 1 });

    // The next note is still at its top.
    await fireEvent.press(
      screen.getByLabelText('Next note: a phrase from another translation'),
    );
    await settle();
    expect(stroke()).toHaveAnimatedStyle({ opacity: 0 });
  });

  it('keeps the notes it has when a reload fails', async () => {
    mockNotes = [
      {
        id: 'cup',
        title: 'Mark 14:23',
        quote: 'took a cup',
        body: 'The cup held wine.',
        verse: { chapterNumber: 14, verseNumber: 23 },
      },
    ];
    jest.useFakeTimers();
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-listen'));
    await settle();
    expect(screen.getByLabelText('Translation note: took a cup')).toBeTruthy();

    mockNotesFailed = true;
    await screen.rerender(<PassageScreen />);

    expect(screen.getByLabelText('Translation note: took a cup')).toBeTruthy();
    expect(screen.getByText('Unable to load Translation Notes.')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Retry loading translation notes' }),
    ).toBeTruthy();
  });

  describe('notes status in Listen', () => {
    const cup: TranslationNoteItem = {
      id: 'cup',
      title: 'Mark 14:23',
      quote: 'took a cup',
      body: 'The cup held wine.',
      verse: { chapterNumber: 14, verseNumber: 23 },
    };
    const failed: TranslationNotesLoadState = {
      status: 'error',
      message: 'Unable to load Translation Notes.',
      failedRefs: [],
    };
    const openListen = async () => {
      jest.useFakeTimers();
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-listen'));
      await settle();
    };
    const retryButton = () =>
      screen.getByRole('button', { name: 'Retry loading translation notes' });

    it('shows a failure that lands after Listen opened, with scripture and playback still usable', async () => {
      mockNotesState = { status: 'loading' };
      await openListen();
      expect(screen.getByText('Loading translation notes…')).toBeTruthy();
      expect(screen.queryByTestId('passage-notes-retry')).toBeNull();

      mockNotesState = failed;
      await screen.rerender(<PassageScreen />);

      expect(
        screen.getByText('Unable to load Translation Notes.'),
      ).toBeTruthy();
      expect(retryButton()).toBeTruthy();
      expect(screen.getAllByText(/took a cup/, hidden).length).toBeGreaterThan(
        0,
      );
      expect(
        screen.getByTestId('passage-key-listen').props.accessibilityState,
      ).toMatchObject({ disabled: false });
      expect(
        screen.getByLabelText('Record mode').props.accessibilityState,
      ).toMatchObject({ disabled: false });
      await fireEvent.press(screen.getByTestId('passage-key-listen'));
      await act(async () => {});
      expect(mockPlaySource).toHaveBeenCalled();
      expect(mockNotesRetry).not.toHaveBeenCalled();
    });

    it('shows a failure that landed before Listen showed, without retrying on its own', async () => {
      jest.useFakeTimers();
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      await settle();
      mockNotesState = failed;
      await screen.rerender(<PassageScreen />);
      // Listen's line; Record keeps its own space.
      expect(screen.queryByTestId('passage-notes-status')).toBeNull();

      await fireEvent.press(screen.getByLabelText('Record mode'));
      await settle();

      expect(
        screen.getByText('Unable to load Translation Notes.'),
      ).toBeTruthy();
      expect(retryButton()).toBeTruthy();
      expect(mockNotesRetry).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByTestId('passage-close'));
      await settle();
      await fireEvent.press(screen.getByTestId('passage-listen'));
      await settle();
      expect(mockNotesRetry).not.toHaveBeenCalled();
    });

    it('tells an empty passage apart from a loaded one', async () => {
      await openListen();
      expect(
        screen.getByText('No translation notes for this passage.'),
      ).toBeTruthy();
      expect(screen.queryByTestId('passage-notes-retry')).toBeNull();

      mockNotes = [cup];
      await screen.rerender(<PassageScreen />);
      await settle();
      expect(screen.queryByTestId('passage-notes-status')).toBeNull();
      expect(
        screen.getByLabelText('Translation note: took a cup'),
      ).toBeTruthy();
    });

    it('keeps the notes that loaded beside a partial load, and retries in place', async () => {
      mockNotesState = {
        status: 'ready',
        notes: [cup],
        failedRefs: [{ chapterNumber: 14, verseNumber: 22 }],
        unavailableOfflineRefs: [],
      };
      await openListen();
      expect(
        screen.getByText("Some translation notes didn't load."),
      ).toBeTruthy();
      expect(
        screen.getByLabelText('Translation note: took a cup'),
      ).toBeTruthy();

      mockNotesRetry.mockImplementation(() => {
        mockNotesState = { status: 'loading' };
      });
      await fireEvent.press(retryButton());

      expect(mockNotesRetry).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Trying translation notes again…')).toBeTruthy();
      const busy = screen.getByRole('button', {
        name: 'Retrying translation notes',
      });
      expect(busy.props.accessibilityState).toMatchObject({
        busy: true,
        disabled: true,
      });
      await fireEvent.press(busy);
      expect(mockNotesRetry).toHaveBeenCalledTimes(1);
      // Listen stays open, with the notes it had.
      expect(screen.getByTestId('passage-player')).toBeTruthy();
      expect(screen.getByTestId('passage-key-listen')).toBeTruthy();
      expect(
        screen.getByLabelText('Translation note: took a cup'),
      ).toBeTruthy();
    });

    it('keeps one message through repeated failed retries, then clears on success', async () => {
      mockNotesState = failed;
      await openListen();
      mockNotesRetry.mockImplementation(() => {
        mockNotesState = { status: 'loading' };
      });

      for (let i = 0; i < 2; i++) {
        await fireEvent.press(retryButton());
        mockNotesState = failed;
        await screen.rerender(<PassageScreen />);
        expect(
          screen.getAllByText('Unable to load Translation Notes.'),
        ).toHaveLength(1);
      }
      expect(mockNotesRetry).toHaveBeenCalledTimes(2);

      await fireEvent.press(retryButton());
      mockNotesState = null;
      mockNotes = [cup];
      await screen.rerender(<PassageScreen />);
      await settle();

      expect(mockNotesRetry).toHaveBeenCalledTimes(3);
      expect(screen.queryByTestId('passage-notes-status')).toBeNull();
      expect(
        screen.getByLabelText('Translation note: took a cup'),
      ).toBeTruthy();
    });

    it('reads prepared notes offline, and says which are not on the phone', async () => {
      mockOnline = false;
      mockNotes = [cup];
      await openListen();
      expect(mockNotesFor.mock.calls.at(-1)?.[0].isOnline).toBe(false);
      expect(screen.queryByTestId('passage-notes-status')).toBeNull();
      expect(
        screen.getByLabelText('Translation note: took a cup'),
      ).toBeTruthy();

      mockNotesState = {
        status: 'ready',
        notes: [cup],
        failedRefs: [],
        unavailableOfflineRefs: [{ chapterNumber: 14, verseNumber: 22 }],
      };
      await screen.rerender(<PassageScreen />);
      expect(
        screen.getByText(
          "Some translation notes aren't on this phone. Connect to the internet to load them.",
        ),
      ).toBeTruthy();
      expect(screen.queryByTestId('passage-notes-retry')).toBeNull();
    });

    it("doesn't carry notes into another passage", async () => {
      mockNotes = [cup];
      await openListen();
      expect(
        screen.getByLabelText('Translation note: took a cup'),
      ).toBeTruthy();

      mockNotesState = { status: 'loading' };
      mockPassage = {
        ...ready,
        assignment: { ...ready.assignment, projectId: 10 },
      };
      await screen.rerender(<PassageScreen />);
      await settle();

      expect(
        screen.queryByLabelText('Translation note: took a cup'),
      ).toBeNull();
      expect(screen.getByText('Loading translation notes…')).toBeTruthy();
    });
  });

  it('leaves the note chips inert while Record is open', async () => {
    mockNotes = [
      {
        id: 'cup',
        title: 'Mark 14:23',
        quote: 'took a cup',
        body: 'The cup held wine.',
        verse: { chapterNumber: 14, verseNumber: 23 },
      },
    ];
    jest.useFakeTimers();
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));
    await settle();

    expect(screen.getByTestId('passage-note-chip-0-0')).toBeTruthy();
    expect(screen.queryByLabelText('Translation note: took a cup')).toBeNull();
  });

  it("squares a phrase's corners where its words share a line, not across a wrap", async () => {
    mockNotes = [
      {
        id: 'cup',
        title: 'Mark 14:23',
        quote: 'took a cup',
        body: 'The cup held wine.',
        verse: { chapterNumber: 14, verseNumber: 23 },
      },
    ];
    jest.useFakeTimers();
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-listen'));
    await settle();
    const chip = (j: number) =>
      StyleSheet.flatten(
        screen.getByTestId(`passage-note-chip-0-${j}`, hidden).props.style,
      );

    // "took a" ends one line, "cup" starts the next. Verse numbers are
    // inline views too.
    await fireEvent(
      screen.getByTestId('passage-script-text', hidden),
      'textLayout',
      {
        nativeEvent: {
          lines: [
            {
              text: '\uFFFC While they were eating \uFFFC Then he \uFFFC\uFFFC',
            },
            { text: '\uFFFC ' },
          ],
        },
      },
    );

    expect(chip(0).borderTopRightRadius).toBe(0);
    expect(chip(1).borderTopLeftRadius).toBe(0);
    expect(chip(1).borderTopRightRadius).not.toBe(0);
    expect(chip(2).borderTopLeftRadius).not.toBe(0);
  });

  it('speaks the missing takes line on Record when nothing is recorded', async () => {
    mockPassage = { ...ready, recordedStatus: 'none', takes: [] };
    await render(<PassageScreen />);

    expect(screen.queryByTestId('passage-takes-meta')).toBeNull();
    expect(screen.getByLabelText('Record, not recorded yet')).toBeTruthy();
  });

  it('says the send is waiting even with no takes on this phone', async () => {
    mockPassage = {
      ...ready,
      recordedStatus: 'none',
      takes: [],
      waitingToSend: true,
    };
    await render(<PassageScreen />);

    expect(screen.getByTestId('passage-takes-meta').props.children).toBe(
      'Waiting to send',
    );
  });

  it('says when the send is waiting to go up', async () => {
    mockPassage = { ...ready, waitingToSend: true };
    await render(<PassageScreen />);

    expect(screen.getByTestId('passage-takes-meta').props.children).toMatch(
      /^2 takes · .* · Waiting to send$/,
    );
  });

  it('closes the player before leaving the page', async () => {
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-listen'));

    expect(screen.queryByTestId('passage-back')).toBeNull();
    await fireEvent.press(screen.getByTestId('passage-close'));
    expect(mockBack).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('passage-back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it("offers a download when the text isn't on the phone", async () => {
    mockPassage = { ...ready, downloaded: false, verses: [] };

    await render(<PassageScreen />);
    expect(screen.getByText('The text isn’t on this phone yet.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('passage-download'));

    expect(mockDownload).toHaveBeenCalled();
    expect(screen.queryByTestId('passage-script', hidden)).toBeNull();
  });

  it("says when it can't be found", async () => {
    mockPassage = { status: 'missing' };

    await render(<PassageScreen />);

    expect(screen.getByText("This couldn't be found.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId('passage-missing-back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('opens Sync from the header cloud, guarded during a take', async () => {
    await render(<PassageScreen />);

    await fireEvent.press(screen.getByTestId('passage-sync'));
    expect(mockOpenSync).toHaveBeenCalledTimes(1);
    expect(mockUseHeaderSync.mock.calls.at(-1)?.[0]).toEqual({
      onSyncComplete: expect.any(Function),
      guard: expect.any(Function),
    });
  });

  it('records a take after the mic check, from the Record key', async () => {
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));

    await act(async () => {
      await fireEvent.press(screen.getByTestId('passage-key-record'));
    });

    expect(mockEnsureMic).toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalled();
  });

  describe('when Record setup fails', () => {
    let alert: jest.SpyInstance;
    beforeEach(() => {
      alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });
    afterEach(() => alert.mockRestore());

    async function tapRecord() {
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-record'));
      });
    }
    async function openRecord() {
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
    }
    function expectNothingRemoved() {
      expect(mockDeleteTake).not.toHaveBeenCalled();
      expect(mockDiscard).not.toHaveBeenCalled();
    }

    it('explains a failed mic request once and takes Record again', async () => {
      const mockTransport = jest.fn();
      logger.setTransport(mockTransport);
      mockEnsureMic.mockRejectedValueOnce(new Error('no mic'));
      await openRecord();

      await tapRecord();
      expect(mockStart).not.toHaveBeenCalled();
      expect(mockTransport).toHaveBeenCalledWith(
        'error',
        'useRecorder',
        'Record setup failed',
        { error: expect.any(Error) },
      );
      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert).toHaveBeenCalledWith(
        "Couldn't start recording",
        'Something went wrong getting ready to record. Try Record again.',
      );
      expectNothingRemoved();

      await tapRecord();
      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(alert).toHaveBeenCalledTimes(1);
    });

    it('explains a take count that fails before recording starts, once', async () => {
      const mockTransport = jest.fn();
      logger.setTransport(mockTransport);
      mockStart.mockRejectedValueOnce(new Error('count failed'));
      await openRecord();

      await tapRecord();
      expect(mockTransport).toHaveBeenCalledWith(
        'error',
        'useRecorder',
        'Record setup failed',
        { error: expect.any(Error) },
      );
      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert).toHaveBeenCalledWith(
        "Couldn't start recording",
        expect.any(String),
      );
      expectNothingRemoved();

      await tapRecord();
      expect(mockEnsureMic).toHaveBeenCalledTimes(2);
      expect(mockStart).toHaveBeenCalledTimes(2);
      expect(alert).toHaveBeenCalledTimes(1);
    });

    it('leaves a denied mic to its Settings alert alone', async () => {
      mockEnsureMic.mockImplementationOnce(async () => {
        Alert.alert('Microphone required', 'Allow microphone access.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Settings' },
        ]);
        return false;
      });
      await openRecord();

      await tapRecord();
      expect(mockStart).not.toHaveBeenCalled();
      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert).toHaveBeenCalledWith(
        'Microphone required',
        expect.any(String),
        expect.any(Array),
      );
    });

    it("adds nothing to the recorder's own error", async () => {
      mockStart.mockImplementationOnce(async () => {
        Alert.alert('Audio error', 'start failed');
      });
      await openRecord();

      await tapRecord();
      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert).toHaveBeenCalledWith('Audio error', 'start failed');
    });
  });

  it('shows the take in progress and pauses it from the same key', async () => {
    mockSession = { ...mockSession, state: 'recording', captureActive: true };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));

    expect(
      screen.getByLabelText('Passage take 1, recording, 0:13'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Take 1, recording')).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Pause recording'));
    });
    expect(mockPause).toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('keeps going on the paused take from Record', async () => {
    mockSession = { ...mockSession, state: 'recording', captureActive: true };
    const { rerender } = await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));
    mockSession = { ...mockSession, state: 'paused' };
    await rerender(<PassageScreen />);

    expect(screen.getByText('Paused. Eject finishes the take.')).toBeTruthy();
    // Still the take in progress, not a saved one to pick.
    expect(
      screen.getByLabelText('Take 1, paused').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(screen.getByLabelText('Passage take 1, paused, 0:13')).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Resume recording'));
    });
    expect(mockResume).toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("doesn't call a paused take recovered when its save fails", async () => {
    mockSession = { ...mockSession, state: 'recording', captureActive: true };
    const { rerender } = await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));
    mockSession = { ...mockSession, state: 'saving', captureActive: false };
    await rerender(<PassageScreen />);
    mockSession = { ...mockSession, state: 'paused', captureActive: true };
    await rerender(<PassageScreen />);

    expect(screen.getByText('Paused. Eject finishes the take.')).toBeTruthy();
  });

  it('ignores the Record key while a take is saving', async () => {
    mockSession = { ...mockSession, state: 'saving' };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));

    expect(
      screen.getByTestId('passage-key-record').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('offers Resume and Finish for a take recovered after a crash', async () => {
    mockSession = { ...mockSession, state: 'paused', captureActive: true };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-listen'));

    expect(screen.getByLabelText('Resume recording')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Finish take'));
    expect(mockStop).toHaveBeenCalled();
    expect(screen.getByText('Take recovered. Eject finishes it.')).toBeTruthy();
  });

  describe('opened to recover a paused take (#914)', () => {
    const lastSession = () => mockSessionArgs.mock.calls.at(-1)?.[0];
    const lastPassageUnit = () => mockUsePassage.mock.calls.at(-1)?.[3];
    const passageCapture = {
      bibleTextId: 1022,
      granularity: 'pericope',
      startChapter: 14,
      startVerse: 22,
      endChapter: 14,
      endVerse: 25,
    };
    const stored = (fields: Record<string, unknown> = {}) => ({
      sessionKey: '5:23',
      segments: ['file:///paused.aac'],
      elapsedMs: 4000,
      startedAt: '2026-11-01T10:00:00Z',
      chapterAssignmentId: 5,
      verseNumber: 23,
      userId: 7,
      ...fields,
    });
    const openRecovery = () => {
      mockParams = {
        ...baseParams,
        anchorVerse: '23',
        verse: '23',
        recoverSessionKey: '5:23',
        recoverVerse: '23',
      };
    };

    beforeEach(() => {
      mockSession = { ...mockSession, state: 'paused', captureActive: true };
      openRecovery();
    });

    it('keys a passage take on its saved verse, not where the passage starts, in its own unit', async () => {
      mockDraftingUnit = 'verse';
      mockStoredMarkers = [stored({ capture: passageCapture })];
      await render(<PassageScreen />);

      expect(lastPassageUnit()).toBe('pericope');
      expect(lastSession()).toMatchObject({
        draftingUnit: 'pericope',
        selectedVerse: 23,
      });
      await fireEvent.press(screen.getByTestId('passage-listen'));
      expect(screen.getByLabelText('Resume recording')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Finish take'));
      expect(mockStop).toHaveBeenCalled();
      expect(screen.queryByTestId('passage-notices-classic')).toBeNull();
    });

    it('records a verse take verse by verse while the setting is passages', async () => {
      mockStoredMarkers = [
        stored({ capture: { ...passageCapture, granularity: 'verse' } }),
      ];
      await render(<PassageScreen />);

      expect(lastPassageUnit()).toBe('verse');
      expect(lastSession()).toMatchObject({
        draftingUnit: 'verse',
        selectedVerse: 23,
      });
    });

    it('brings a marker from before captures back verse by verse on its verse', async () => {
      mockStoredMarkers = [stored({ userId: undefined })];
      await render(<PassageScreen />);

      expect(lastPassageUnit()).toBe('verse');
      expect(lastSession()).toMatchObject({
        draftingUnit: 'verse',
        selectedVerse: 23,
      });
    });

    it('keeps its unit once Finish saves it, and keys new takes on the passage start', async () => {
      mockDraftingUnit = 'verse';
      mockStoredMarkers = [stored({ capture: passageCapture })];
      await render(<PassageScreen />);
      mockStoredMarkers = [];
      mockSession = { ...mockSession, state: 'saving', captureActive: false };
      await screen.rerender(<PassageScreen />);
      expect(lastSession()).toMatchObject({ selectedVerse: 23 });

      mockSession = { ...mockSession, state: 'recorded' };
      await screen.rerender(<PassageScreen />);

      expect(lastPassageUnit()).toBe('pericope');
      expect(lastSession()).toMatchObject({
        draftingUnit: 'pericope',
        selectedVerse: 22,
      });
    });

    it('keys new takes on the passage start once the recovered take is discarded', async () => {
      mockDraftingUnit = 'verse';
      mockStoredMarkers = [stored({ capture: passageCapture })];
      await render(<PassageScreen />);
      mockStoredMarkers = [];
      mockSession = { ...mockSession, state: 'idle', captureActive: false };
      await screen.rerender(<PassageScreen />);

      expect(lastSession()).toMatchObject({
        draftingUnit: 'pericope',
        selectedVerse: 22,
      });
    });

    it('keeps the saved verse while the take is still loading', async () => {
      mockDraftingUnit = 'verse';
      mockStoredMarkers = [stored({ capture: passageCapture })];
      mockSession = { ...sessionDefaults };
      await render(<PassageScreen />);
      await screen.rerender(<PassageScreen />);

      expect(lastSession()).toMatchObject({ selectedVerse: 23 });
    });

    it.each([
      ['finished or discarded since', []],
      ["another account's", [stored({ capture: passageCapture, userId: 8 })]],
      [
        'for another verse',
        [stored({ capture: passageCapture, verseNumber: 24 })],
      ],
      [
        'for another chapter',
        [stored({ capture: passageCapture, chapterAssignmentId: 6 })],
      ],
    ])('opens as usual when the take is %s', async (_case, markers) => {
      mockSession = { ...sessionDefaults };
      mockStoredMarkers = markers;
      await render(<PassageScreen />);

      expect(lastPassageUnit()).toBeUndefined();
      // The setting's unit, keyed where the passage starts.
      expect(lastSession()).toMatchObject({
        draftingUnit: 'pericope',
        selectedVerse: 22,
      });
    });

    it('opens on blank labels and without a project, whose book link goes back', async () => {
      mockStoredMarkers = [stored({ capture: passageCapture })];
      mockParams = {
        ...mockParams,
        projectName: '',
        milestoneName: '',
        language: '',
      };
      delete mockParams.projectId;
      mockSession = { ...sessionDefaults };
      await renderSettled();

      await fireEvent.press(
        screen.getByRole('button', { name: 'The Last Supper. Show details.' }),
      );
      await fireEvent.press(screen.getByTestId('passage-book'));
      await settle();
      expect(mockBack).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it('says why Record is off when a verse is at the take limit', async () => {
    mockSession = { ...mockSession, canRecordNewTake: false };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));

    expect(
      screen.getByTestId('passage-key-record').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(
      screen.getByText(
        'A verse here has 5 takes. Delete one in classic drafting to record.',
      ),
    ).toBeTruthy();
  });

  it("won't record a passage without pericopes, and says why", async () => {
    mockSession = { ...mockSession, pericopeUnavailable: true };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));

    expect(
      screen.getByTestId('passage-key-record').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(
      screen.getAllByText(/isn't split into pericopes/, hidden).length,
    ).toBeGreaterThan(0);
  });

  describe('verse by verse', () => {
    const lastSession = () => mockSessionArgs.mock.calls.at(-1)?.[0];

    beforeEach(() => {
      mockDraftingUnit = 'verse';
    });

    it('records inside the passage instead of sending it to classic drafting', async () => {
      await render(<PassageScreen />);

      expect(screen.queryByTestId('passage-notices-classic')).toBeNull();
      expect(lastSession()).toMatchObject({
        draftingUnit: 'verse',
        selectedVerse: 22,
      });
      expect(screen.getByText('2 of 2 verses recorded')).toBeTruthy();
    });

    describe('listening', () => {
      const timings = [
        { verse: 22, startSeconds: 0 },
        { verse: 23, startSeconds: 6 },
      ];

      async function playThrough23() {
        await fireEvent.press(screen.getByTestId('passage-listen'));
        mockSource = { ...mockSource, isPlaying: true };
        await screen.rerender(<PassageScreen />);
        const { onPlayingVerseChange } = mockUseSourceAudio.mock.calls.at(
          -1,
        )?.[0] as { onPlayingVerseChange: (verse: number | null) => void };
        await act(() => onPlayingVerseChange(23));
      }

      it('follows the verse playing, with chips on the waveform', async () => {
        mockSource = { ...mockSource, verseTimestamps: timings };
        await render(<PassageScreen />);
        await playThrough23();

        expect(
          screen.getByLabelText(/^Verse 23(, recorded)?, 2 of 2$/),
        ).toBeTruthy();
        expect(
          screen.getByTestId('passage-waveform-verse-22', {
            includeHiddenElements: true,
          }),
        ).toBeTruthy();
      });

      it('moves the place to the last verse heard once playback stops', async () => {
        mockSource = { ...mockSource, verseTimestamps: timings };
        await render(<PassageScreen />);
        await playThrough23();

        expect(lastSession()).toMatchObject({ selectedVerse: 22 });
        mockSource = { ...mockSource, isPlaying: false };
        await act(async () => await screen.rerender(<PassageScreen />));
        expect(lastSession()).toMatchObject({ selectedVerse: 23 });
      });

      it('steps from the verse playing with Previous and Next', async () => {
        mockSource = { ...mockSource, verseTimestamps: timings };
        await render(<PassageScreen />);
        await playThrough23();

        expect(
          screen.getByTestId('passage-key-next').props.accessibilityState,
        ).toMatchObject({ disabled: true });
        await act(async () => {
          await fireEvent.press(screen.getByLabelText('Previous: verse 22'));
        });
        expect(mockSeekSource).toHaveBeenCalledWith(0);
      });

      async function layOutVersePages() {
        await fireEvent(screen.getByTestId('passage-verse-pages'), 'layout', {
          nativeEvent: { layout: { width: 300, height: 600 } },
        });
      }

      it('readies Play on the verse on screen once the chapter source loads (#945)', async () => {
        const listenKey = () => screen.getByTestId('passage-key-listen');
        mockSource = { ...mockSource, loadState: 'loading' };
        await render(<PassageScreen />);
        await fireEvent.press(screen.getByTestId('passage-listen'));
        await layOutVersePages();

        expect(listenKey().props.accessibilityLabel).toBe(
          'Loading source audio',
        );
        expect(listenKey().props.accessibilityState).toMatchObject({
          disabled: true,
        });
        expect(screen.getByLabelText('While they were eating')).toBeTruthy();
        expect(
          screen.getByLabelText(/^Verse 22(, recorded)?, 1 of 2$/),
        ).toBeTruthy();

        await act(async () => {
          await fireEvent.press(screen.getByLabelText('Next: verse 23'));
        });
        expect(lastSession()).toMatchObject({ selectedVerse: 23 });
        expect(mockUseSourceAudio.mock.calls.at(-1)?.[0]).toMatchObject({
          verse: 23,
          chapter: 14,
          enabled: true,
          deferred: false,
        });
        expect(listenKey().props.accessibilityLabel).toBe(
          'Loading source audio',
        );
        expect(listenKey().props.accessibilityState).toMatchObject({
          disabled: true,
        });
        expect(screen.getByLabelText('While they were eating')).toBeTruthy();

        mockSource = { ...mockSource, loadState: 'ready' };
        await screen.rerender(<PassageScreen />);

        expect(listenKey().props.accessibilityLabel).toBe('Play source audio');
        expect(listenKey().props.accessibilityState).toMatchObject({
          disabled: false,
        });
        expect(
          screen.getByLabelText(/^Verse 23(, recorded)?, 2 of 2$/),
        ).toBeTruthy();
        expect(screen.getByLabelText('While they were eating')).toBeTruthy();
        expect(screen.getByLabelText('Then he took a cup')).toBeTruthy();
        await act(async () => {
          await fireEvent.press(listenKey());
        });
        expect(mockPlaySource).toHaveBeenCalledTimes(1);
      });

      it('claims no verse playing without verse timings', async () => {
        await render(<PassageScreen />);
        await playThrough23();

        expect(
          screen.getByLabelText(/^Verse 22(, recorded)?, 1 of 2$/),
        ).toBeTruthy();
        expect(
          screen.queryByTestId('passage-waveform-verse-22', {
            includeHiddenElements: true,
          }),
        ).toBeNull();
        expect(
          screen.getByTestId('passage-waveform-bar-0', {
            includeHiddenElements: true,
          }),
        ).toBeTruthy();
      });
    });

    it('shows why the text is missing instead of empty verse pages', async () => {
      mockPassage = {
        ...ready,
        wholeChapter: true,
        downloaded: false,
        verses: [ready.verses[0]!],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-listen'));

      expect(screen.queryByTestId('passage-verse-pages')).toBeNull();
      expect(
        screen.getByText('The text isn’t on this phone yet.'),
      ).toBeTruthy();
    });

    it('opens Listen on a verse from its row and plays it', async () => {
      mockSource = {
        ...mockSource,
        verseTimestamps: [
          { verse: 22, startSeconds: 0 },
          { verse: 23, startSeconds: 6 },
        ],
      };
      mockPassage = {
        ...ready,
        verses: [ready.verses[0]!, { ...ready.verses[1]!, recorded: null }],
      };
      await render(<PassageScreen />);

      expect(screen.getByText('1 of 2 recorded')).toBeTruthy();
      // The rings show recorded or not; only a passage take gets a line.
      expect(screen.getByText('Recorded in a passage take')).toBeTruthy();
      expect(screen.queryByText('Not recorded yet')).toBeNull();
      expect(screen.getByLabelText('Verse 23, Not recorded yet')).toBeTruthy();
      expect(lastSession()).toMatchObject({ selectedVerse: 23 });
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-verse-row-22'));
      });

      expect(lastSession()).toMatchObject({ selectedVerse: 22 });
      expect(screen.getByTestId('passage-verse-pages')).toBeTruthy();
      expect(mockUseSourceAudio.mock.calls.at(-1)?.[0]).toMatchObject({
        verse: 22,
        enabled: true,
      });
      expect(mockPlaySource).toHaveBeenCalledTimes(1);
    });

    it("opens a row's verse without playing when the source has no verse timings", async () => {
      await render(<PassageScreen />);
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-verse-row-22'));
      });

      expect(screen.getByTestId('passage-verse-pages')).toBeTruthy();
      expect(mockPlaySource).not.toHaveBeenCalled();
    });

    it("doesn't play a tapped row's verse that has no timing", async () => {
      mockSource = {
        ...mockSource,
        verseTimestamps: [{ verse: 22, startSeconds: 0 }],
      };
      await render(<PassageScreen />);
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-verse-row-23'));
      });

      expect(screen.getByTestId('passage-verse-pages')).toBeTruthy();
      expect(mockPlaySource).not.toHaveBeenCalled();
    });

    it("plays a tapped row's verse from its start when paused partway", async () => {
      mockSource = {
        ...mockSource,
        status: 'paused',
        positionMs: 9000,
        verseTimestamps: [
          { verse: 22, startSeconds: 0 },
          { verse: 23, startSeconds: 6 },
        ],
      };
      await render(<PassageScreen />);
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-verse-row-23'));
      });

      expect(mockSeekSource).toHaveBeenCalledWith(6000);
      expect(mockPlaySource).toHaveBeenCalledTimes(1);
    });

    it('steps verses with Previous and Next in Listen', async () => {
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-listen'));

      expect(
        screen.getByTestId('passage-key-previous').props.accessibilityState,
      ).toMatchObject({ disabled: true });
      await act(async () => {
        await fireEvent.press(screen.getByLabelText('Next: verse 23'));
      });

      expect(lastSession()).toMatchObject({ selectedVerse: 23 });
      expect(mockUseSourceAudio.mock.calls.at(-1)?.[0]).toMatchObject({
        verse: 23,
      });
    });

    it("re-reads the passage once a verse's first take is saved, not on a step", async () => {
      const verseTake = {
        ...take(1),
        granularity: 'verse',
        isSelected: true,
        startVerse: 22,
        endVerse: 22,
      };
      await render(<PassageScreen />);
      mockReload.mockClear();

      mockSession = { ...mockSession, takes: [verseTake] };
      await screen.rerender(<PassageScreen />);
      expect(mockReload).toHaveBeenCalledTimes(1);

      // A step clears the text id, then the next verse's takes load.
      mockSession = { ...mockSession, captureBibleTextId: null, takes: [] };
      await screen.rerender(<PassageScreen />);
      mockSession = {
        ...mockSession,
        captureBibleTextId: 1023,
        takes: [{ ...verseTake, id: 't9', startVerse: 23, endVerse: 23 }],
      };
      await screen.rerender(<PassageScreen />);
      expect(mockReload).toHaveBeenCalledTimes(1);
    });

    it('opens on the verse a recovered take was paused on', async () => {
      mockParams = { ...baseParams, verse: '23' };
      await render(<PassageScreen />);

      expect(lastSession()).toMatchObject({ selectedVerse: 23 });
    });

    it('is verse by verse in a chapter without pericopes, whatever the setting', async () => {
      mockDraftingUnit = 'pericope';
      mockPassage = { ...ready, title: null, wholeChapter: true };
      await render(<PassageScreen />);

      expect(lastSession()).toMatchObject({ draftingUnit: 'verse' });
      expect(screen.getByTestId('passage-verse-list')).toBeTruthy();
    });

    it('leaves the takes line out before any verse is recorded', async () => {
      mockPassage = {
        ...ready,
        recordedStatus: 'none',
        verses: ready.verses.map(v => ({ ...v, recorded: null })),
      };
      await render(<PassageScreen />);

      expect(screen.queryByTestId('passage-takes-meta')).toBeNull();
    });

    it('deletes a take waiting on undo before stepping to another verse', async () => {
      mockSession = {
        ...mockSession,
        takes: [{ ...take(1), granularity: 'verse', isSelected: true }],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      await fireEvent(
        screen.getByLabelText('Take 1, selected'),
        'accessibilityAction',
        { nativeEvent: { actionName: 'delete' } },
      );

      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-verse-row-23'));
      });

      expect(mockDeleteTake).toHaveBeenCalledWith('t1');
      expect(lastSession()).toMatchObject({ selectedVerse: 23 });
    });

    it('points to the verse take to delete when passage takes fill the cap', async () => {
      mockSession = {
        ...mockSession,
        canRecordNewTake: false,
        takes: [
          { ...take(1), granularity: 'verse' },
          { ...take(2), isSelected: true, startVerse: 22, endVerse: 23 },
        ],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.getAllByText(
          'This verse has 5 takes, counting passage takes over it. Delete one to record.',
          hidden,
        ).length,
      ).toBeGreaterThan(0);
    });

    it('points to Pericope when only passage takes fill the cap', async () => {
      mockSession = {
        ...mockSession,
        canRecordNewTake: false,
        takes: [{ ...take(2), isSelected: true, startVerse: 22, endVerse: 23 }],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.getAllByText(
          'This verse is in 5 passage takes. Switch to Pericope in Settings and delete one to record it on its own.',
          hidden,
        ).length,
      ).toBeGreaterThan(0);
    });

    it("doesn't record over a passage take when the confirm is cancelled", async () => {
      mockSession = {
        ...mockSession,
        takes: [{ ...take(2), isSelected: true, startVerse: 22, endVerse: 23 }],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-record'));
      });

      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-confirm-cancel'));
      });
      expect(mockStart).not.toHaveBeenCalled();
    });

    it("names the verse on its take's card", async () => {
      mockSession = {
        ...mockSession,
        takes: [
          {
            ...take(1),
            granularity: 'verse',
            isSelected: true,
            startVerse: 22,
            endVerse: 22,
          },
        ],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.getAllByText('v. 22 · Take 1', hidden).length,
      ).toBeGreaterThan(0);
    });

    it('names both chapters of a passage take that crosses them', async () => {
      mockSession = {
        ...mockSession,
        takes: [
          {
            ...take(2),
            isSelected: true,
            startChapter: 14,
            startVerse: 22,
            endChapter: 15,
            endVerse: 5,
          },
        ],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-record'));
      });

      expect(
        screen.getByText(
          "Passage take 2 won't be used for 14:22–15:5 anymore, so the rest of those verses will need recording too.",
        ),
      ).toBeTruthy();
    });

    it('plays the passage take over a verse with no take of its own', async () => {
      mockSession = {
        ...mockSession,
        takes: [{ ...take(2), isSelected: true, startVerse: 22, endVerse: 23 }],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.getAllByText('This verse is in passage take 2.', hidden).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getByTestId('passage-key-play').props.accessibilityState,
      ).toMatchObject({ disabled: false });
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-play'));
      });
      expect(mockPlayTake).toHaveBeenCalledWith(
        expect.objectContaining({ id: 't2' }),
        undefined,
      );
    });

    it('picks up a passage take where it was, on the next verse it covers', async () => {
      mockSession = {
        ...mockSession,
        takes: [{ ...take(2), isSelected: true, startVerse: 22, endVerse: 23 }],
        state: 'playing',
        playingTakeId: 't2',
        positionMs: 4000,
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      await act(async () => {
        await fireEvent(
          screen.getByTestId('passage-verse-position'),
          'accessibilityAction',
          { nativeEvent: { actionName: 'increment' } },
        );
      });
      expect(lastSession()).toMatchObject({ selectedVerse: 23 });

      mockSession = { ...mockSession, state: 'idle', playingTakeId: null };
      await screen.rerender(<PassageScreen />);
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-play'));
      });
      expect(mockPlayTake).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 't2' }),
        4000,
      );
    });

    it('names the passage take a swap replaces, not verses', async () => {
      mockSession = {
        ...mockSession,
        takes: [
          { ...take(1), startVerse: 22, endVerse: 23 },
          { ...take(2), isSelected: true, startVerse: 22, endVerse: 23 },
        ],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      await fireEvent.press(screen.getByTestId('passage-fan-p1'));
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-take-official'));
      });

      expect(screen.getByText('Use passage take 1 for v. 22–23?')).toBeTruthy();
      expect(
        screen.getByText("Passage take 2 won't be used for v. 22–23 anymore."),
      ).toBeTruthy();
    });

    it('makes a picked passage take official from its check, without asking', async () => {
      mockSession = {
        ...mockSession,
        takes: [{ ...take(2), isSelected: true, startVerse: 22, endVerse: 23 }],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-take-official'));
      });

      expect(screen.queryByTestId('passage-confirm')).toBeNull();
      expect(mockSelectTake).not.toHaveBeenCalled();
      expect(mockSetCanonical).toHaveBeenCalledWith('t2', {
        overlapChecked: true,
      });
    });

    it('lets the official take be chosen again after its upload failed', async () => {
      const official = {
        ...take(2),
        isSelected: true,
        isCanonical: true,
        startVerse: 22,
        endVerse: 23,
      };
      mockSession = {
        ...mockSession,
        takes: [{ ...official, syncStatus: 'uploaded' }],
      };
      const { unmount } = await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      expect(
        screen.getByTestId('passage-take-official').props.accessibilityState,
      ).toMatchObject({ disabled: true });
      await unmount();

      mockSession = {
        ...mockSession,
        takes: [{ ...official, syncStatus: 'failed' }],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-take-official'));
      });

      expect(screen.queryByTestId('passage-confirm')).toBeNull();
      expect(mockSelectTake).toHaveBeenCalledWith('t2');
      expect(mockSetCanonical).toHaveBeenCalledWith('t2', {
        overlapChecked: true,
      });
    });

    it('resumes the passage take over a verse where it was paused, and restarts it from the end', async () => {
      const cover = {
        ...take(2),
        isSelected: true,
        startVerse: 22,
        endVerse: 23,
      };
      mockSession = {
        ...mockSession,
        takes: [cover],
        state: 'playing',
        playingTakeId: 't2',
        positionMs: 4000,
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-play'));
      });
      expect(mockPauseTake).toHaveBeenCalled();

      mockSession = { ...mockSession, state: 'idle', playingTakeId: null };
      await screen.rerender(<PassageScreen />);
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-play'));
      });
      expect(mockPlayTake).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 't2' }),
        4000,
      );

      const playback = screen.getByLabelText(
        'Passage take 2 · v. 22–23 playback',
      );
      for (let step = 0; step < 20; step += 1) {
        await fireEvent(playback, 'accessibilityAction', {
          nativeEvent: { actionName: 'increment' },
        });
      }
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-play'));
      });
      expect(mockPlayTake).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 't2' }),
        0,
      );
    });

    describe('passage takes over the verse, as tiles', () => {
      const passageTake = {
        ...take(1),
        startVerse: 22,
        endVerse: 23,
      };
      const ownTake = {
        ...take(2),
        granularity: 'verse',
        isSelected: true,
        startVerse: 22,
        endVerse: 22,
      };

      it('numbers the next take after a passage take that starts on the verse', async () => {
        mockSession = {
          ...mockSession,
          takes: [{ ...passageTake, isSelected: true }],
        };
        await render(<PassageScreen />);
        await fireEvent.press(screen.getByTestId('passage-record'));

        expect(
          screen.getByLabelText('Passage take 1, v. 22–23, selected'),
        ).toBeTruthy();
        expect(screen.getByTestId('passage-fan-2')).toBeTruthy();
      });

      it('numbers the next take after a passage take that only covers the verse', async () => {
        mockSession = {
          ...mockSession,
          takes: [{ ...passageTake, isSelected: true, startVerse: 21 }],
        };
        await render(<PassageScreen />);
        await fireEvent.press(screen.getByTestId('passage-record'));

        expect(screen.getByTestId('passage-fan-2')).toBeTruthy();
      });

      it('shows a passage take beside the verse take that replaced it, and asks before picking it back', async () => {
        mockSession = { ...mockSession, takes: [passageTake, ownTake] };
        await render(<PassageScreen />);
        await fireEvent.press(screen.getByTestId('passage-record'));

        expect(screen.getByTestId('passage-fan-p1')).toBeTruthy();
        expect(screen.getByTestId('passage-fan-2')).toBeTruthy();
        // Tapping only brings it forward; the check asks.
        await fireEvent.press(screen.getByTestId('passage-fan-p1'));
        expect(screen.queryByTestId('passage-confirm')).toBeNull();
        await act(async () => {
          await fireEvent.press(screen.getByTestId('passage-take-official'));
        });
        expect(
          screen.getByText('Use passage take 1 for v. 22–23?'),
        ).toBeTruthy();
        expect(
          screen.getByText(
            "The verses recorded on their own here won't be used anymore.",
          ),
        ).toBeTruthy();
        expect(mockSelectTake).not.toHaveBeenCalled();
        await act(async () => {
          await fireEvent.press(screen.getByTestId('passage-confirm-confirm'));
        });
        expect(mockSelectTake).toHaveBeenCalledWith('t1');
        expect(mockSetCanonical).toHaveBeenCalledWith('t1', {
          overlapChecked: true,
        });
      });

      it('changes nothing and never asks when an official take at the other unit overlaps (#896)', async () => {
        mockBlockReplacement.mockResolvedValueOnce(true);
        mockSession = { ...mockSession, takes: [passageTake, ownTake] };
        await render(<PassageScreen />);
        await fireEvent.press(screen.getByTestId('passage-record'));
        await fireEvent.press(screen.getByTestId('passage-fan-p1'));
        await act(async () => {
          await fireEvent.press(screen.getByTestId('passage-take-official'));
        });

        expect(mockBlockReplacement).toHaveBeenCalledWith('t1');
        expect(screen.queryByTestId('passage-confirm')).toBeNull();
        expect(mockSelectTake).not.toHaveBeenCalled();
        expect(mockSetCanonical).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Passage take 1, v. 22–23')).toBeTruthy();
      });

      it('stops before making it official when the pick is refused', async () => {
        mockSelectTake.mockResolvedValueOnce(false);
        mockSession = { ...mockSession, takes: [passageTake, ownTake] };
        await render(<PassageScreen />);
        await fireEvent.press(screen.getByTestId('passage-record'));
        await fireEvent.press(screen.getByTestId('passage-fan-p1'));
        await act(async () => {
          await fireEvent.press(screen.getByTestId('passage-take-official'));
        });
        await act(async () => {
          await fireEvent.press(screen.getByTestId('passage-confirm-confirm'));
        });

        expect(mockSelectTake).toHaveBeenCalledWith('t1');
        expect(mockSetCanonical).not.toHaveBeenCalled();
      });

      it("brings a picked passage take's tile forward to play it", async () => {
        mockSession = {
          ...mockSession,
          takes: [
            { ...passageTake, isSelected: true, startVerse: 21, endVerse: 23 },
            { ...ownTake, isSelected: false },
          ],
        };
        await render(<PassageScreen />);
        await fireEvent.press(screen.getByTestId('passage-record'));
        await fireEvent.press(screen.getByTestId('passage-fan-p1'));
        await act(async () => {
          await fireEvent.press(screen.getByTestId('passage-key-play'));
        });

        expect(mockPlayTake).toHaveBeenCalledWith(
          expect.objectContaining({ id: 't1' }),
          undefined,
        );
      });
    });

    it('asks before recording a verse over its passage take', async () => {
      mockSession = {
        ...mockSession,
        takes: [{ ...take(2), isSelected: true, startVerse: 22, endVerse: 23 }],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.getAllByText('This verse is in passage take 2.', hidden).length,
      ).toBeGreaterThan(0);
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-record'));
      });
      expect(screen.getByText('Record v. 22 on its own?')).toBeTruthy();
      expect(
        screen.getByText(
          "Passage take 2 won't be used for v. 22–23 anymore, so the rest of those verses will need recording too.",
        ),
      ).toBeTruthy();
      expect(mockStart).not.toHaveBeenCalled();

      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-confirm-confirm'));
      });
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('asks before picking a verse take over its passage take', async () => {
      mockSession = {
        ...mockSession,
        takes: [
          { ...take(2), isSelected: true, startVerse: 22, endVerse: 23 },
          { ...take(1), granularity: 'verse', startVerse: 22, endVerse: 22 },
        ],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      await fireEvent.press(screen.getByTestId('passage-fan-1'));
      expect(screen.queryByTestId('passage-confirm')).toBeNull();
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-take-official'));
      });

      expect(screen.getByText('Use take 1 for v. 22?')).toBeTruthy();
      expect(
        screen.getByText(
          "Passage take 2 won't be used for v. 22–23 anymore, so the rest of those verses will need recording too.",
        ),
      ).toBeTruthy();
      expect(mockSelectTake).not.toHaveBeenCalled();
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-confirm-confirm'));
      });
      expect(mockSelectTake).toHaveBeenCalledWith('t1');
    });

    describe('translation notes', () => {
      beforeEach(() => {
        mockNotes = [
          {
            id: 'cup',
            title: 'Mark 14:23',
            quote: 'took a cup',
            body: 'The cup held wine.',
            verse: { chapterNumber: 14, verseNumber: 23 },
          },
        ];
        jest.useFakeTimers();
      });
      const layOutPages = async () =>
        await fireEvent(screen.getByTestId('passage-verse-pages'), 'layout', {
          nativeEvent: { layout: { width: 300, height: 600 } },
        });

      it('shows them as chips on the verse page and opens them in Listen', async () => {
        await render(<PassageScreen />);
        await fireEvent.press(screen.getByTestId('passage-listen'));
        await settle();
        await layOutPages();

        expect(screen.getByTestId('passage-verse-note-23-0-0')).toBeTruthy();
        await fireEvent.press(
          screen.getByLabelText('Translation note: took a cup'),
        );
        expect(screen.getByText('The cup held wine.')).toBeTruthy();
      });

      it("pins a verse's notes that have no phrase, and only on its page", async () => {
        mockNotes = [
          ...mockNotes,
          {
            id: 'elsewhere',
            title: 'Mark 14:22',
            quote: 'a phrase from another translation',
            body: 'This note quotes another translation.',
            verse: { chapterNumber: 14, verseNumber: 22 },
          },
        ];
        await render(<PassageScreen />);
        await fireEvent.press(screen.getByTestId('passage-listen'));
        await settle();
        await layOutPages();

        expect(screen.getByLabelText('1 more translation note')).toBeTruthy();
        await act(async () => {
          await fireEvent.press(screen.getByLabelText('Next: verse 23'));
        });
        expect(screen.queryByTestId('passage-more-notes')).toBeNull();
        await act(async () => {
          await fireEvent.press(screen.getByLabelText('Previous: verse 22'));
        });
        await fireEvent.press(screen.getByTestId('passage-more-notes'));
        expect(
          screen.getByText('This note quotes another translation.'),
        ).toBeTruthy();
      });

      it("dims them in Record, where they don't open", async () => {
        await render(<PassageScreen />);
        await fireEvent.press(screen.getByTestId('passage-listen'));
        await settle();
        await layOutPages();
        const outline = () =>
          StyleSheet.flatten(
            screen.getByTestId('passage-verse-note-23-0-0', hidden).props.style,
          ).borderColor;
        const listening = outline();

        await fireEvent.press(screen.getByLabelText('Record mode'));
        await settle();

        expect(outline()).not.toBe(listening);
        expect(
          screen.queryByLabelText('Translation note: took a cup'),
        ).toBeNull();
      });
    });

    describe("doesn't record on the verse it's leaving", () => {
      const verseTakes = [
        { ...take(1), granularity: 'verse', startVerse: 22, endVerse: 22 },
        {
          ...take(2),
          granularity: 'verse',
          isSelected: true,
          startVerse: 22,
          endVerse: 22,
        },
      ];
      const stepToNext = () =>
        fireEvent(
          screen.getByTestId('passage-verse-position'),
          'accessibilityAction',
          { nativeEvent: { actionName: 'increment' } },
        );

      it('when the step waits on a delete', async () => {
        let finishDelete = () => {};
        mockDeleteTake.mockImplementationOnce(
          () => new Promise<void>(resolve => (finishDelete = resolve)),
        );
        mockSession = { ...mockSession, takes: verseTakes };
        await render(<PassageScreen />);
        await fireEvent.press(screen.getByTestId('passage-record'));
        await fireEvent(
          screen.getByLabelText(/Take 2, selected/),
          'accessibilityAction',
          { nativeEvent: { actionName: 'delete' } },
        );
        await act(async () => {
          await fireEvent.press(screen.getByTestId('passage-key-record'));
        });
        await act(async () => stepToNext());

        expect(
          screen.getByTestId('passage-key-record').props.accessibilityState,
        ).toMatchObject({ disabled: true });
        await act(async () => finishDelete());
        expect(mockStart).not.toHaveBeenCalled();
        expect(lastSession()).toMatchObject({ selectedVerse: 23 });
        expect(
          screen.getByTestId('passage-key-record').props.accessibilityState,
        ).toMatchObject({ disabled: false });
      });

      it('when the step lands while the mic is asked for', async () => {
        let grantMic = (_ok: boolean) => {};
        mockEnsureMic.mockImplementationOnce(
          () => new Promise<boolean>(resolve => (grantMic = resolve)),
        );
        mockSession = { ...mockSession, takes: verseTakes };
        await render(<PassageScreen />);
        await fireEvent.press(screen.getByTestId('passage-record'));
        await act(async () => {
          await fireEvent.press(screen.getByTestId('passage-key-record'));
        });
        await act(async () => stepToNext());
        expect(lastSession()).toMatchObject({ selectedVerse: 23 });

        await act(async () => grantMic(true));
        expect(mockStart).not.toHaveBeenCalled();
      });
    });
  });

  it('opens classic drafting from the title sheet', async () => {
    await renderSettled();
    await fireEvent.press(
      screen.getByRole('button', { name: 'The Last Supper. Show details.' }),
    );
    await settle();
    await fireEvent.press(screen.getByTestId('passage-classic'));

    expect(mockPush).toHaveBeenCalledWith(
      hrefs.verseDetail({
        chapterId: 5,
        chapterName: 'Mark 14',
        projectName: 'Mark Telugu',
        language: 'Telugu',
      }),
    );
  });

  it("won't let an observer record, and says so", async () => {
    mockObserverGrant = true;
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));

    expect(
      screen.getByTestId('passage-key-record').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(
      screen.getAllByText(
        "You're observing this project, so you can listen but not record.",
        hidden,
      ).length,
    ).toBeGreaterThan(0);
    await act(async () => {
      await fireEvent.press(screen.getByTestId('passage-key-record'));
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("warns about a sync conflict from the passage's assignment row", async () => {
    mockPassage = {
      ...ready,
      assignment: { ...ready.assignment, hasConflict: true },
    };
    await render(<PassageScreen />);
    await act(async () => {});

    expect(screen.getByTestId('passage-notices-conflict')).toBeTruthy();
  });

  it('shows no conflict warning when the assignment row has none', async () => {
    mockPassage = {
      ...ready,
      assignment: { ...ready.assignment, hasConflict: false },
    };
    await render(<PassageScreen />);
    await act(async () => {});

    expect(screen.queryByTestId('passage-notices-conflict')).toBeNull();
  });

  it('picks up a conflict when the passage reloads its assignment', async () => {
    mockPassage = {
      ...ready,
      assignment: { ...ready.assignment, hasConflict: false },
    };
    const view = await render(<PassageScreen />);
    await act(async () => {});
    expect(screen.queryByTestId('passage-notices-conflict')).toBeNull();

    mockPassage = {
      ...ready,
      assignment: { ...ready.assignment, hasConflict: true },
    };
    await view.rerender(<PassageScreen />);
    await act(async () => {});

    expect(screen.getByTestId('passage-notices-conflict')).toBeTruthy();
  });

  describe('verses recorded on their own, in pericope mode', () => {
    const verseTake = (n: number, verse: number) => ({
      ...take(n),
      granularity: 'verse',
      isSelected: true,
      startChapter: 14,
      startVerse: verse,
      endVerse: verse,
      localFilePath: `file://v${verse}.m4a`,
    });

    it('plays every verse back to back from one card', async () => {
      mockSession = {
        ...mockSession,
        takes: [verseTake(1, 22), verseTake(2, 23)],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.getAllByText('Recorded verse by verse', hidden).length,
      ).toBeGreaterThan(0);
      expect(screen.queryByTestId('passage-notices-verse-takes')).toBeNull();
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-play'));
      });
      expect(mockPlayStitched).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'stitched',
          segments: [
            expect.objectContaining({ verseNumber: 22 }),
            expect.objectContaining({ verseNumber: 23 }),
          ],
        }),
      );
    });

    it('plays and counts a passage that crosses into the next chapter', async () => {
      mockPassage = {
        ...ready,
        verses: [
          ready.verses[0]!,
          {
            chapterNumber: 15,
            verseNumber: 1,
            text: 'Very early in the morning',
            recorded: 'verse',
          },
        ],
      };
      mockSession = {
        ...mockSession,
        takes: [
          verseTake(1, 22),
          {
            ...verseTake(2, 1),
            startChapter: 15,
            localFilePath: 'file://c15v1.m4a',
          },
        ],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.getAllByText('Recorded verse by verse', hidden).length,
      ).toBeGreaterThan(0);
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-play'));
      });
      expect(mockPlayStitched).toHaveBeenCalledWith(
        expect.objectContaining({
          segments: [
            expect.objectContaining({ chapterNumber: 14, verseNumber: 22 }),
            expect.objectContaining({ chapterNumber: 15, verseNumber: 1 }),
          ],
        }),
      );
    });

    it('counts the verses when only some are recorded', async () => {
      mockSession = { ...mockSession, takes: [verseTake(1, 22)] };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.getAllByText('1 of 2 verses recorded on their own', hidden)
          .length,
      ).toBeGreaterThan(0);
    });

    it('asks before a passage take replaces them', async () => {
      mockSession = { ...mockSession, takes: [verseTake(1, 22)] };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-key-record'));
      });

      expect(screen.getByText('Record the whole passage?')).toBeTruthy();
      expect(
        screen.getByText(
          "The verses recorded on their own here won't be used anymore.",
        ),
      ).toBeTruthy();
      expect(mockStart).not.toHaveBeenCalled();
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-confirm-confirm'));
      });
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('counts the verses in the hero while they are the draft', async () => {
      mockPassage = {
        ...ready,
        recordedStatus: 'partial',
        verses: [ready.verses[0]!, { ...ready.verses[1]!, recorded: null }],
      };
      mockSession = {
        ...mockSession,
        takes: [{ ...take(3), isSelected: false }, verseTake(1, 22)],
      };
      await render(<PassageScreen />);

      expect(screen.getByTestId('passage-takes-meta').props.children).toBe(
        '1 of 2 verses recorded',
      );
    });

    it('asks before picking a passage take over them', async () => {
      mockSession = {
        ...mockSession,
        takes: [{ ...take(3), isSelected: false }, verseTake(1, 22)],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      await fireEvent.press(screen.getByTestId('passage-fan-3'));
      expect(screen.queryByTestId('passage-confirm')).toBeNull();
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-take-official'));
      });

      expect(
        screen.getByText('Use passage take 3 for the whole passage?'),
      ).toBeTruthy();
      expect(
        screen.getByText(
          "The verses recorded on their own here won't be used anymore.",
        ),
      ).toBeTruthy();
      expect(mockSelectTake).not.toHaveBeenCalled();
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-confirm-confirm'));
      });
      expect(mockSelectTake).toHaveBeenCalledWith('t3');
    });

    it('goes back to the verses card when the tile in front is tapped again', async () => {
      mockSession = {
        ...mockSession,
        takes: [{ ...take(3), isSelected: false }, verseTake(1, 22)],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      const versesCard = () =>
        screen.queryAllByText('1 of 2 verses recorded on their own', hidden);

      expect(versesCard().length).toBeGreaterThan(0);
      await fireEvent.press(screen.getByTestId('passage-fan-3'));
      expect(versesCard()).toHaveLength(0);
      await fireEvent.press(screen.getByTestId('passage-fan-3'));
      expect(versesCard().length).toBeGreaterThan(0);
    });

    it('leads with a passage take that is the draft', async () => {
      mockSession = {
        ...mockSession,
        takes: [
          { ...take(3), isSelected: true },
          { ...verseTake(1, 22), isSelected: false },
        ],
      };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.queryAllByText('1 of 2 verses recorded on their own', hidden),
      ).toHaveLength(0);
    });
  });

  it("says why it can't record when the chapter is someone else's", async () => {
    mockSession = { ...mockSession, isTaken: true };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));

    expect(
      screen.getByText('This chapter is assigned to another translator.'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('passage-key-record').props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it('warns that the chapter is taken in the hero and in Listen', async () => {
    mockSession = { ...mockSession, isTaken: true };
    await render(<PassageScreen />);

    expect(screen.getByTestId('passage-notices-taken')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('passage-listen'));
    expect(screen.getByTestId('player-notices-taken')).toBeTruthy();
  });

  it("keeps Record's reasons out of Listen", async () => {
    mockSession = { ...mockSession, drafterCaptureBlocked: true };
    mockDraftingUnit = 'verse';
    await render(<PassageScreen />);

    await fireEvent.press(screen.getByTestId('passage-listen'));

    expect(screen.queryByTestId('player-notices-not-open')).toBeNull();
    expect(screen.queryByTestId('player-notices-classic')).toBeNull();
    expect(screen.queryByTestId('player-notices-open-classic')).toBeNull();
  });

  it('plays the take from where it was scrubbed to', async () => {
    mockSession = { ...mockSession, takes: [take(1)] };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));

    await fireEvent(
      screen.getByLabelText('Passage take 1 playback'),
      'accessibilityAction',
      {
        nativeEvent: { actionName: 'increment' },
      },
    );
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Play take'));
    });

    expect(mockPlayTake).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      500,
    );
  });

  it('plays from the start after a scrub to the end', async () => {
    mockSession = { ...mockSession, takes: [take(1)] };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));

    const playback = screen.getByLabelText('Passage take 1 playback');
    for (let step = 0; step < 20; step += 1) {
      await fireEvent(playback, 'accessibilityAction', {
        nativeEvent: { actionName: 'increment' },
      });
    }
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Play take'));
    });

    expect(mockPlayTake).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      0,
    );
  });

  it('deletes a take only once the undo window closes', async () => {
    jest.useFakeTimers();
    try {
      mockSession = { ...mockSession, takes: [take(1), take(2)] };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));
      const remove = async () =>
        await fireEvent(
          screen.getByLabelText('Take 2, selected'),
          'accessibilityAction',
          { nativeEvent: { actionName: 'delete' } },
        );

      await remove();
      expect(screen.getByLabelText('Take 2, deleted')).toBeTruthy();
      await fireEvent.press(
        screen.getByLabelText('Undo deleting Passage take 2'),
      );
      await act(async () => {
        jest.advanceTimersByTime(UNDO_MS);
      });
      expect(mockDeleteTake).not.toHaveBeenCalled();

      await remove();
      await act(async () => {
        jest.advanceTimersByTime(UNDO_MS);
      });
      expect(mockDeleteTake).toHaveBeenCalledWith('t2');
    } finally {
      jest.useRealTimers();
    }
  });

  it('deletes a pending take before recording another', async () => {
    mockSession = { ...mockSession, takes: [take(1), take(2)] };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));
    await fireEvent(
      screen.getByLabelText('Take 2, selected'),
      'accessibilityAction',
      {
        nativeEvent: { actionName: 'delete' },
      },
    );

    await act(async () => {
      await fireEvent.press(screen.getByTestId('passage-key-record'));
    });

    expect(mockDeleteTake).toHaveBeenCalledWith('t2');
    expect(mockDeleteTake.mock.invocationCallOrder[0]).toBeLessThan(
      mockStart.mock.invocationCallOrder[0],
    );
  });

  it("doesn't start recording if the player closed while the delete ran", async () => {
    let finish = () => {};
    mockDeleteTake.mockImplementationOnce(
      () => new Promise<void>(resolve => (finish = resolve)),
    );
    mockSession = { ...mockSession, takes: [take(1), take(2)] };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));
    await fireEvent(
      screen.getByLabelText('Take 2, selected'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'delete' } },
    );

    await act(async () => {
      await fireEvent.press(screen.getByTestId('passage-key-record'));
    });
    expect(mockDeleteTake).toHaveBeenCalledWith('t2');
    await fireEvent.press(screen.getByTestId('passage-close'));
    await act(async () => finish());

    expect(mockStart).not.toHaveBeenCalled();
  });

  it('only plays takes on a stage-locked chapter: no pick, official or delete', async () => {
    const takes = [take(1), { ...take(2), isSelected: true }];
    mockSession = { ...mockSession, takes };
    const { unmount } = await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));
    expect(screen.getByLabelText('Take 1').props.accessibilityActions).toEqual([
      { name: 'delete', label: 'Delete' },
    ]);
    await act(async () => {
      await fireEvent.press(screen.getByTestId('passage-take-official'));
    });
    expect(mockSetCanonical).toHaveBeenCalledWith('t2', {
      overlapChecked: true,
    });
    // A tap brings a take forward; its check picks it and makes it official.
    await fireEvent.press(screen.getByTestId('passage-fan-1'));
    expect(mockSelectTake).not.toHaveBeenCalled();
    await act(async () => {
      await fireEvent.press(screen.getByTestId('passage-take-official'));
    });
    expect(mockSelectTake).toHaveBeenCalledWith('t1');
    expect(mockSetCanonical).toHaveBeenCalledWith('t1', {
      overlapChecked: true,
    });
    await unmount();
    jest.clearAllMocks();

    mockSession = { ...mockSession, takes, stageLocked: true };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));

    expect(screen.queryByTestId('passage-take-official')).toBeNull();
    expect(
      screen.getByLabelText('Take 1').props.accessibilityActions,
    ).toBeUndefined();
    await fireEvent.press(screen.getByTestId('passage-fan-1'));
    expect(mockSelectTake).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Take 2, selected')).toBeTruthy();
    expect(screen.getByLabelText('Take 1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('passage-key-play'));
    expect(mockPlayTake).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      undefined,
    );
  });

  describe('Eject', () => {
    const ejectState = () =>
      screen.getByTestId('passage-key-eject').props.accessibilityState;

    it('finishes the take in progress', async () => {
      mockSession = { ...mockSession, state: 'recording', captureActive: true };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));

      await act(async () => {
        await fireEvent.press(screen.getByLabelText('Finish take'));
      });
      expect(mockStop).toHaveBeenCalled();
      expect(mockPause).not.toHaveBeenCalled();
    });

    it('ignores Record until the take is saved', async () => {
      let saved = () => {};
      mockStop.mockImplementationOnce(
        () => new Promise<void>(resolve => (saved = resolve)),
      );
      mockSession = { ...mockSession, state: 'recording', captureActive: true };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));

      await fireEvent.press(screen.getByLabelText('Finish take'));
      await act(async () => {
        await fireEvent.press(screen.getByLabelText('Pause recording'));
      });
      expect(mockPause).not.toHaveBeenCalled();
      await act(async () => saved());

      await act(async () => {
        await fireEvent.press(screen.getByLabelText('Pause recording'));
      });
      expect(mockPause).toHaveBeenCalledTimes(1);
    });

    it('stays off with no take in progress', async () => {
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));

      expect(ejectState()).toMatchObject({ disabled: true });
    });

    it('stays off while the take saves', async () => {
      mockSession = { ...mockSession, state: 'saving' };
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-record'));

      expect(ejectState()).toMatchObject({ disabled: true });
    });
  });

  it('asks before closing the player on a take in progress', async () => {
    mockSession = { ...mockSession, state: 'recording', captureActive: true };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));

    await fireEvent.press(screen.getByTestId('passage-close'));
    expect(screen.getByTestId('passage-confirm')).toBeTruthy();
    expect(screen.getByLabelText('Close the player')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('passage-confirm-cancel'));
    expect(mockDiscard).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('passage-close'));
    await act(async () => {
      await fireEvent.press(screen.getByTestId('passage-confirm-confirm'));
    });
    expect(mockDiscard).toHaveBeenCalledTimes(1);
  });

  it('leaves back presses to a screen pushed over the open player', async () => {
    const remove = jest.fn();
    const listen = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockReturnValue({ remove });
    try {
      await render(<PassageScreen />);
      await fireEvent.press(screen.getByTestId('passage-listen'));
      expect(listen).toHaveBeenCalledWith(
        'hardwareBackPress',
        expect.any(Function),
      );

      const listening = listen.mock.calls.length;
      mockFocused = false;
      await screen.rerender(<PassageScreen />);

      expect(remove).toHaveBeenCalled();
      expect(listen).toHaveBeenCalledTimes(listening);
    } finally {
      listen.mockRestore();
    }
  });

  it('blocks leaving while a recovered take is paused and the player is closed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSession = { ...mockSession, state: 'paused', captureActive: true };
    const view = await render(<PassageScreen />);
    await waitFor(() => expect(getRecordCaptureGate()).toBe(true));

    await fireEvent.press(screen.getByTestId('passage-back', hidden));
    expect(mockBack).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Recording in progress',
      expect.any(String),
      expect.any(Array),
    );

    await view.unmount();
    expect(getRecordCaptureGate()).toBe(false);
  });

  it('blocks account, settings and drawer exits from the shared gate', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    setRecordCaptureGate(true);
    const close = jest.fn();
    const { result } = await renderHook(() => useAccountActions({ close }));
    expect(result.current.blockIfRecording()).toBe(true);
    expect(close).toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Recording in progress',
      expect.any(String),
      expect.any(Array),
    );
    alert.mockRestore();
  });

  it('holds the book page and a back removal while a save is in flight', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSession = { ...mockSession, state: 'saving', captureActive: false };
    await render(<PassageScreen />);
    await waitFor(() => expect(getRecordCaptureGate()).toBe(true));

    await fireEvent.press(
      screen.getByRole('button', { name: 'The Last Supper. Show details.' }),
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Mark 14 · Gospels Phase 1. Open book page.',
      }),
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalled();

    const beforeRemove = mockAddListener.mock.calls.filter(
      call => call[0] === 'beforeRemove',
    );
    const listener = beforeRemove[beforeRemove.length - 1]?.[1];
    if (!listener) throw new Error('beforeRemove was not registered');
    const preventDefault = jest.fn();
    listener({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('plays source audio in place while a save is in flight', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSession = { ...mockSession, state: 'saving', captureActive: false };
    await render(<PassageScreen />);
    await waitFor(() => expect(getRecordCaptureGate()).toBe(true));

    await fireEvent.press(screen.getByTestId('passage-listen'));
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Play source audio'));
    });

    expect(mockPlaySource).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('does not start a take when peer check or a taken chapter blocks it', async () => {
    mockSession = {
      ...mockSession,
      drafterCaptureBlocked: true,
    };
    await render(<PassageScreen />);
    await fireEvent.press(screen.getByTestId('passage-record'));
    await act(async () => {
      await fireEvent.press(screen.getByTestId('passage-key-record'));
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("won't open the title's sheet on a take in progress", async () => {
    mockSession = { ...mockSession, state: 'recording', captureActive: true };
    await renderSettled();
    await fireEvent.press(screen.getByTestId('passage-record'));

    expect(
      screen.getByRole('header', { name: 'The Last Supper' }),
    ).toBeDisabled();
    await fireEvent.press(screen.getByTestId('passage-title'));
    await settle();

    expect(screen.queryByTestId('passage-title-sheet')).toBeNull();
  });

  describe('Resources', () => {
    beforeEach(() => mockLoadImages.mockImplementation(loadNoImages));

    async function openResources() {
      await fireEvent.press(screen.getByRole('button', { name: 'Resources' }));
      await settle();
    }

    it('preview the first three verses once the page has arrived, then load the rest in the background', async () => {
      const verses = [22, 23, 24, 25, 26].map(verseNumber => ({
        ...ready.verses[0],
        verseNumber,
      }));
      mockPassage = { ...ready, verses };
      const image = {
        id: 'img-api-1',
        title: 'Jerusalem',
        uri: 'file:///1.jpg',
      };
      let landPreviews: (images: unknown[]) => void = () => {};
      mockLoadImages.mockImplementation(
        async ({
          projectId,
          verseRefs,
        }: {
          projectId: number | null;
          verseRefs?: unknown[];
        }) => {
          if (projectId === null) return new Promise(() => {});
          // The previews wait until the test lands them.
          if ((verseRefs as unknown[]).length === 3)
            return new Promise(resolve => (landPreviews = resolve));
          return [image];
        },
      );
      const refs = (...nums: number[]) =>
        nums.map(verseNumber => ({ chapterNumber: 14, verseNumber }));
      const asked = () =>
        mockLoadImages.mock.calls
          .map(
            ([args]) =>
              args as { projectId: number | null; verseRefs?: unknown },
          )
          .filter(args => args.projectId === 9)
          .map(args => args.verseRefs);
      const notesProject = () => mockNotesFor.mock.calls.at(-1)?.[0].projectId;
      jest.useFakeTimers();
      await render(<PassageScreen />);
      expect(asked()).toEqual([]);

      // The previews come first, on their own.
      await settle();
      expect(asked()).toEqual([refs(22, 23, 24)]);

      // Once they're in, the full list loads behind them; the notes still
      // wait for the player.
      await act(async () => landPreviews([image]));
      expect(asked()).toEqual([refs(22, 23, 24), refs(22, 23, 24, 25, 26)]);
      expect(notesProject()).toBeNull();
      expect(
        screen.getByTestId('passage-resources-previews', hidden),
      ).toBeTruthy();
      expect(screen.queryByTestId('passage-resources')).toBeNull();
    });

    describe('with five verses', () => {
      /** Real loads of all five verses (a disabled hook asks with no project). */
      const fullLoads = () =>
        mockLoadImages.mock.calls.filter(([args]) => {
          const { projectId, verseRefs } = args as {
            projectId: number | null;
            verseRefs?: unknown[];
          };
          return projectId === 9 && verseRefs?.length === 5;
        }).length;
      /** Previews are the first three verses; the full list is all five. */
      const loadImages = (
        previews: () => Promise<unknown[]>,
        full: () => Promise<unknown[]>,
      ) =>
        mockLoadImages.mockImplementation(async args => {
          const { projectId, verseRefs } = args as {
            projectId: number | null;
            verseRefs?: unknown[];
          };
          if (projectId === null) return new Promise(() => {});
          return verseRefs?.length === 3 ? previews() : full();
        });
      beforeEach(() => {
        mockPassage = {
          ...ready,
          verses: [22, 23, 24, 25, 26].map(verseNumber => ({
            ...ready.verses[0],
            verseNumber,
          })),
        };
      });

      it('load the full list when the card opens before the previews settle', async () => {
        loadImages(
          () => new Promise(() => {}),
          async () => [],
        );
        await renderSettled();
        await act(async () => {});
        expect(fullLoads()).toBe(0);

        await openResources();
        await act(async () => {});
        expect(fullLoads()).toBe(1);
      });

      it('load in the background when the previews fail, too', async () => {
        loadImages(
          async () => {
            throw new Error('offline');
          },
          async () => [],
        );
        await renderSettled();
        await act(async () => {});
        expect(fullLoads()).toBe(1);
        expect(screen.queryByTestId('passage-resources')).toBeNull();
      });

      it('retry a failed background load when the card opens', async () => {
        let fail = true;
        loadImages(
          async () => [],
          async () => {
            if (fail) throw new Error('502');
            return [];
          },
        );
        await renderSettled();
        await act(async () => {});
        expect(fullLoads()).toBe(1);

        fail = false;
        await openResources();
        await act(async () => {});
        expect(fullLoads()).toBe(2);
        expect(
          within(screen.getByTestId('passage-resources')).getByText(
            'No images or maps here.',
          ),
        ).toBeTruthy();
      });
    });

    it("open from the peek for the passage's verses, with no classic route", async () => {
      await renderSettled();
      await openResources();
      await act(async () => {});

      expect(mockLoadImages).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 9,
          userId: 7,
          isOnline: true,
          bookCode: 'MRK',
          languageCode: 'tel',
          verseRefs: ready.verses.map(v => ({
            chapterNumber: v.chapterNumber,
            verseNumber: v.verseNumber,
          })),
        }),
      );
      const sheet = screen.getByTestId('passage-resources');
      expect(within(sheet).getByText('No images or maps here.')).toBeTruthy();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('retry reloads only the images, and recovers in place', async () => {
      mockLoadImages.mockImplementation(async ({ projectId }) => {
        if (projectId !== null) throw new Error('offline');
        return [];
      });
      await renderSettled();
      await openResources();
      await act(async () => {});
      const sourceRetries = mockRetrySource.mock.calls.length;
      const loads = mockLoadImages.mock.calls.length;

      mockLoadImages.mockImplementation(loadNoImages);
      await fireEvent.press(
        screen.getByRole('button', { name: 'Retry loading images and maps' }),
      );
      await act(async () => {});

      expect(mockLoadImages).toHaveBeenCalledTimes(loads + 1);
      expect(
        within(screen.getByTestId('passage-resources')).getByText(
          'No images or maps here.',
        ),
      ).toBeTruthy();
      expect(mockRetrySource).toHaveBeenCalledTimes(sourceRetries);
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('steps aside while the player is open', async () => {
      await renderSettled();
      const peek = () => screen.getByTestId('passage-resources-peek', hidden);
      expect(peek().props.pointerEvents).toBe('box-none');

      await fireEvent.press(screen.getByTestId('passage-listen'));
      await settle();
      expect(peek().props.pointerEvents).toBe('none');
      expect(peek().props.importantForAccessibility).toBe(
        'no-hide-descendants',
      );

      await fireEvent.press(screen.getByTestId('passage-close'));
      await settle();
      expect(peek().props.pointerEvents).toBe('box-none');
    });

    const expanded = () =>
      screen.getByTestId('passage-resources-open').props.accessibilityState
        .expanded;

    it('grow in place, and the chevron puts the card back', async () => {
      await renderSettled();
      expect(expanded()).toBe(false);
      await openResources();
      await act(async () => {});
      expect(expanded()).toBe(true);
      expect(screen.getByTestId('passage-resources')).toBeTruthy();

      await fireEvent.press(
        screen.getByRole('button', { name: 'Collapse resources' }),
      );
      await settle();
      expect(expanded()).toBe(false);
      expect(screen.queryByTestId('passage-resources')).toBeNull();
    });

    it('strokes the card header while its list is scrolled under it', async () => {
      await renderSettled();
      await openResources();
      await act(async () => {});
      const stroke = () =>
        getAnimatedStyle(
          screen.getByTestId('passage-resources-header-stroke', hidden),
        ).opacity;
      expect(stroke()).toBe(0);

      const scrollTo = async (y: number) => {
        await fireEvent.scroll(screen.getByTestId('passage-resources'), {
          nativeEvent: { contentOffset: { y } },
        });
        await settle();
      };
      await scrollTo(40);
      expect(stroke()).toBe(1);
      await scrollTo(0);
      expect(stroke()).toBe(0);

      // Put back scrolled, it opens again at the top.
      await scrollTo(40);
      await fireEvent.press(
        screen.getByRole('button', { name: 'Collapse resources' }),
      );
      await settle();
      await openResources();
      expect(stroke()).toBe(0);
    });

    it('Back puts the card back before it leaves the passage', async () => {
      type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
      const handlers: BackListener[] = [];
      const listen = jest
        .spyOn(BackHandler, 'addEventListener')
        .mockImplementation((_event, handler) => {
          handlers.push(handler);
          return { remove: jest.fn() };
        });
      try {
        await renderSettled();
        await openResources();
        await act(async () => {});
        let handled: boolean | null | undefined;
        await act(() => {
          handled = handlers.at(-1)?.({} as Parameters<BackListener>[0]);
        });
        expect(handled).toBe(true);
        expect(expanded()).toBe(false);
        expect(mockBack).not.toHaveBeenCalled();
      } finally {
        listen.mockRestore();
      }
    });

    it('close when another screen covers the passage', async () => {
      await renderSettled();
      await openResources();
      await act(async () => {});
      expect(screen.getByTestId('passage-resources')).toBeTruthy();

      mockFocused = false;
      await screen.rerender(<PassageScreen />);
      await settle();
      mockFocused = true;
      await screen.rerender(<PassageScreen />);
      await settle();

      expect(screen.queryByTestId('passage-resources')).toBeNull();
    });
  });

  describe('Send to the next stage', () => {
    const sendable = {
      chapter: {},
      visibility: {
        visible: true,
        disabled: false,
        destination: getStageAdvanceDestination('draft'),
      },
      hasConflict: false,
      hasUnuploadableTakes: false,
    };
    const withAssignment = (over: object, waitingToSend = false) => ({
      ...ready,
      waitingToSend,
      assignment: { ...ready.assignment, ...over },
    });
    async function openTitleSheet() {
      await renderSettled();
      await act(async () => {});
      await fireEvent.press(screen.getByTestId('passage-title'));
      await settle();
    }

    it("sends this passage's chapter from the title's sheet after confirming", async () => {
      mockStageSend = sendable;
      mockPassage = withAssignment({ bookName: 'Mark', status: 'draft' });
      mockSendToStage.mockResolvedValue('confirmed');
      await openTitleSheet();

      await fireEvent.press(screen.getByTestId('passage-send'));
      await settle();
      const dialog = screen.getByTestId('passage-confirm');
      expect(within(dialog).getByText(/Mark 14/)).toBeTruthy();
      expect(mockSendToStage).not.toHaveBeenCalled();

      mockReload.mockClear();
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-confirm-confirm'));
      });
      expect(mockSendToStage).toHaveBeenCalledWith({
        chapterAssignmentId: 5,
        userId: 7,
        draftingUnit: 'pericope',
        to: 'peer_check',
      });
      expect(mockReload).toHaveBeenCalledTimes(1);
    });

    it('sends a reviewed chapter on to Complete without leaving Next (#909)', async () => {
      mockStageSend = {
        ...sendable,
        visibility: {
          ...sendable.visibility,
          destination: getStageAdvanceDestination('consultant_check'),
        },
      };
      mockPassage = withAssignment({
        bookName: 'Mark',
        status: 'consultant_check',
        assignedUserId: 9,
      });
      let confirm!: (v: string) => void;
      mockSendToStage.mockReturnValue(new Promise(r => (confirm = r)));
      await openTitleSheet();

      const row = screen.getByTestId('passage-send');
      expect(within(row).getByText('Send to Complete')).toBeTruthy();
      await fireEvent.press(row);
      await settle();
      expect(
        within(screen.getByTestId('passage-confirm')).getByText(
          'Send to Complete?',
        ),
      ).toBeTruthy();

      mockReload.mockClear();
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-confirm-confirm'));
      });
      expect(mockSendToStage).toHaveBeenCalledWith(
        expect.objectContaining({ chapterAssignmentId: 5, to: 'complete' }),
      );
      expect(mockReload).not.toHaveBeenCalled();

      await act(async () => confirm('confirmed'));
      expect(mockReload).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('shows a queued later stage as waiting to send, offering nothing more', async () => {
      mockStageSend = {
        ...sendable,
        visibility: {
          ...sendable.visibility,
          destination: getStageAdvanceDestination('linguist_check'),
        },
      };
      mockPassage = withAssignment(
        { status: 'linguist_check', assignedUserId: 9 },
        true,
      );
      await openTitleSheet();
      expect(
        within(screen.getByTestId('passage-send-queued')).getByText(
          'Waiting to send to Linguist Check',
        ),
      ).toBeTruthy();
      expect(screen.queryByTestId('passage-send')).toBeNull();
    });

    it('offers no Send where the gate does not', async () => {
      await openTitleSheet();
      expect(screen.queryByTestId('passage-send')).toBeNull();
      expect(screen.getByTestId('passage-classic')).toBeTruthy();
    });

    it('shows a queued send apart from one the server has', async () => {
      mockPassage = withAssignment(
        { status: 'peer_check', assignedUserId: 7 },
        true,
      );
      await openTitleSheet();
      expect(screen.getByTestId('passage-send-queued')).toBeTruthy();
      expect(screen.queryByTestId('passage-send-sent')).toBeNull();
    });

    it('shows a send the server has', async () => {
      mockPassage = withAssignment({ status: 'peer_check', assignedUserId: 7 });
      await openTitleSheet();
      expect(screen.getByTestId('passage-send-sent')).toBeTruthy();
      expect(screen.queryByTestId('passage-send-queued')).toBeNull();
    });
  });

  describe("everyone's takes", () => {
    const owned = (
      id: string,
      owner: number,
      name: string,
      over: Record<string, unknown> = {},
    ) => ({
      id,
      bibleTextId: 1022,
      recordedByUserId: owner,
      ownerDisplayName: name,
      localFilePath: `file:///${id}.m4a`,
      durationMs: 12000,
      takeNumber: 1,
      isSelected: false,
      isCanonical: false,
      syncStatus: 'uploaded',
      granularity: 'pericope',
      startChapter: 14,
      startVerse: 22,
      endChapter: 14,
      endVerse: 25,
      ...over,
    });
    const others = () => {
      mockSession = {
        ...mockSession,
        hasMultipleRecorders: true,
        allTakes: [
          owned('m1', 7, 'Me Drafter', { isSelected: true }),
          owned('o1', 9, 'Ruth Reader', { isCanonical: true }),
          owned('o2', 9, 'Ruth Reader', {
            takeNumber: 2,
            granularity: 'verse',
            startVerse: 23,
            endVerse: 23,
          }),
        ],
      };
    };
    async function openReview() {
      await renderSettled();
      await fireEvent.press(screen.getByTestId('passage-title'));
      await settle();
      await fireEvent.press(screen.getByTestId('passage-open-review'));
      await settle();
    }

    it('keeps Send and take review available together after integration', async () => {
      others();
      mockStageSend = {
        chapter: {},
        visibility: {
          visible: true,
          disabled: false,
          destination: getStageAdvanceDestination('draft'),
        },
        hasConflict: false,
        hasUnuploadableTakes: false,
      };
      mockPassage = {
        ...ready,
        assignment: { ...ready.assignment, bookName: 'Mark', status: 'draft' },
      };
      await renderSettled();
      await act(async () => {});
      await fireEvent.press(screen.getByTestId('passage-title'));
      await settle();
      expect(screen.getByTestId('passage-send')).toBeTruthy();
      expect(screen.getByTestId('passage-open-review')).toBeTruthy();
      expect(
        within(screen.getByTestId('passage-classic')).getByText('Resources'),
      ).toBeTruthy();

      await fireEvent.press(screen.getByTestId('passage-send'));
      await settle();
      expect(screen.getByTestId('passage-confirm')).toBeTruthy();
      expect(screen.queryByTestId('passage-review')).toBeNull();
      await fireEvent.press(screen.getByTestId('passage-confirm-cancel'));
      await settle();
      await fireEvent.press(screen.getByTestId('passage-title'));
      await settle();
      await fireEvent.press(screen.getByTestId('passage-open-review'));
      await settle();
      expect(screen.getByTestId('passage-review')).toBeTruthy();
      expect(mockSendToStage).not.toHaveBeenCalled();
    });

    it('is not offered when no one else has takes here', async () => {
      await renderSettled();
      await fireEvent.press(screen.getByTestId('passage-title'));
      await settle();
      expect(screen.queryByTestId('passage-open-review')).toBeNull();
      expect(screen.getByTestId('passage-classic')).toBeTruthy();
    });

    it('groups every take by owner, with range and official state', async () => {
      others();
      await openReview();

      const sheet = screen.getByTestId('passage-review');
      expect(within(sheet).getByText('Me Drafter (you)')).toBeTruthy();
      const theirs = within(sheet).getByTestId('passage-review-owner-9');
      expect(within(theirs).getByText('Ruth Reader')).toBeTruthy();
      expect(
        within(theirs).getByText('Take 1 - Pericope - vv. 22-25'),
      ).toBeTruthy();
      expect(within(theirs).getByText('Take 2 - Verse - v. 23')).toBeTruthy();
      expect(
        within(screen.getByTestId('passage-review-take-o1')).getByText(
          'Official',
        ),
      ).toBeTruthy();
      expect(
        within(screen.getByTestId('passage-review-take-o2')).queryByText(
          'Official',
        ),
      ).toBeNull();
    });

    it("plays another owner's take without picking, deleting or making it official", async () => {
      others();
      await openReview();
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-review-play-o2'));
      });

      expect(mockPlayTake).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'o2' }),
      );
      expect(mockSelectTake).not.toHaveBeenCalled();
      expect(mockSetCanonical).not.toHaveBeenCalled();
      expect(mockDeleteTake).not.toHaveBeenCalled();
      expect(mockBlockReplacement).not.toHaveBeenCalled();
    });

    it('explains a take whose audio is not on this phone', async () => {
      others();
      mockMissingAudio.add('file:///o1.m4a');
      await openReview();
      await act(async () => {
        await fireEvent.press(screen.getByTestId('passage-review-play-o1'));
      });

      expect(mockPlayTake).not.toHaveBeenCalled();
      expect(
        within(screen.getByTestId('passage-review-take-o1')).getByText(
          "This take's audio isn't on this phone.",
        ),
      ).toBeTruthy();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('closes when the passage loses focus', async () => {
      others();
      await openReview();
      expect(screen.getByTestId('passage-review')).toBeTruthy();

      mockFocused = false;
      await screen.rerender(<PassageScreen />);
      await settle();
      expect(screen.queryByTestId('passage-review')).toBeNull();
    });

    it("isn't offered during a take in progress", async () => {
      others();
      mockSession = { ...mockSession, state: 'recording', captureActive: true };
      await renderSettled();
      await fireEvent.press(screen.getByTestId('passage-title'));
      await settle();
      expect(screen.queryByTestId('passage-open-review')).toBeNull();
    });
  });

  describe('Translation Questions', () => {
    const QUESTION = {
      id: 'tq-api-1-0',
      question: 'What did Jesus give them?',
      answer: 'Bread and the cup.',
    };

    async function openQuestions() {
      await fireEvent.press(screen.getByTestId('passage-title'));
      await fireEvent.press(
        screen.getByRole('button', {
          name: 'Translation Questions, Questions and answers to check the meaning',
        }),
      );
      await settle();
    }

    it("don't load until they're opened from the title's sheet", async () => {
      await renderSettled();
      expect(mockLoadQuestions).not.toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 9 }),
      );
      expect(screen.queryByTestId('passage-questions')).toBeNull();
    });

    it("open from the title's sheet for the passage's verses, with no classic route", async () => {
      mockLoadQuestions.mockResolvedValue([QUESTION]);
      await renderSettled();
      await openQuestions();
      await act(async () => {});

      expect(screen.queryByTestId('passage-title-sheet')).toBeNull();
      expect(mockLoadQuestions).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 9,
          userId: 7,
          isOnline: true,
          bookCode: 'MRK',
          verseRefs: ready.verses.map(v => ({
            chapterNumber: v.chapterNumber,
            verseNumber: v.verseNumber,
          })),
        }),
      );
      const sheet = screen.getByTestId('passage-questions');
      expect(within(sheet).getByText('Mark 14:22–25')).toBeTruthy();
      await fireEvent.press(
        within(sheet).getByRole('button', { name: QUESTION.question }),
      );
      expect(within(sheet).getByText(QUESTION.answer)).toBeTruthy();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('retry reloads only the questions, and recovers in place', async () => {
      mockLoadQuestions.mockImplementation(async ({ projectId }) => {
        if (projectId !== null) throw new Error('offline');
        return [];
      });
      await renderSettled();
      await openQuestions();
      await act(async () => {});
      const sourceCalls = mockRetrySource.mock.calls.length;

      const loads = mockLoadQuestions.mock.calls.length;
      mockLoadQuestions.mockResolvedValue([QUESTION]);
      await fireEvent.press(
        screen.getByRole('button', {
          name: 'Retry loading Translation Questions',
        }),
      );
      await act(async () => {});

      expect(mockLoadQuestions).toHaveBeenCalledTimes(loads + 1);
      expect(
        within(screen.getByTestId('passage-questions')).getByText(
          QUESTION.question,
        ),
      ).toBeTruthy();
      expect(mockRetrySource).toHaveBeenCalledTimes(sourceCalls);
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('close when another screen covers the passage', async () => {
      await renderSettled();
      await openQuestions();
      await act(async () => {});
      expect(screen.getByTestId('passage-questions')).toBeTruthy();

      mockFocused = false;
      await screen.rerender(<PassageScreen />);
      await settle();
      mockFocused = true;
      await screen.rerender(<PassageScreen />);
      await settle();

      expect(screen.queryByTestId('passage-questions')).toBeNull();
    });
  });
});
