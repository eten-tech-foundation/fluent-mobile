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
import type { Passage, PassageDownload } from '../../../hooks/usePassage';
import { UNDO_MS } from '../../../hooks/usePendingDelete';
import { hrefs } from '../../../navigation/hrefs';
import {
  getRecordCaptureGate,
  resetRecordCaptureGateForTests,
  setRecordCaptureGate,
} from '../../../navigation/recordCaptureGate';
import { logger } from '../../../utils/logger';

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
const mockDeleteTake = jest.fn(async (_id: string) => {});
const mockSelectTake = jest.fn();
const mockSetCanonical = jest.fn();
type MockTake = {
  id: string;
  takeNumber: number;
  granularity: string;
  isSelected: boolean;
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
};
let mockSession = { ...sessionDefaults };
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
          playTake: mockPlayTake,
          playStitched: mockPlayStitched,
          seekStitched: jest.fn(),
          stitchPositionMs: 0,
          selectTake: mockSelectTake,
          setCanonical: mockSetCanonical,
          ownCanonicalTakeId: null,
          allTakes: mockSession.allTakes,
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

jest.mock('../../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
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

let mockConflict = false;
jest.mock('../../../hooks/useChapterConflictStatus', () => ({
  useChapterConflictStatus: () => ({ hasConflict: mockConflict }),
}));

const mockUnuploadable = jest.fn(async () => false);
jest.mock('../../../db/queries', () => ({
  chapterHasUnuploadableSelectedTakes: () => mockUnuploadable(),
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

jest.mock('../../../hooks/useConnectivity', () => ({
  useConnectivity: () => ({ isOnline: true, hasResolved: true }),
}));

jest.mock('../../../hooks/useTranslationNotesForUnit', () => ({
  useTranslationNotesForUnit: () => ({
    state: mockNotesFailed
      ? { status: 'error', message: 'Notes failed' }
      : { status: 'ready', notes: mockNotes },
    retry: jest.fn(),
  }),
}));

jest.mock('../../../hooks/usePassage', () => ({
  usePassage: () => ({
    passage: mockPassage,
    download: mockDownload,
    downloadState: mockDownloadState,
    reload: mockReload,
  }),
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
  useConnectivity: () => ({ isOnline: true, hasResolved: true }),
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

const settle = () => act(() => jest.advanceTimersByTime(1000));

/**
 * Renders under fake timers and lets the mount animations finish, as they
 * would before a tap; a pending one would otherwise close the title's sheet.
 */
function renderSettled() {
  jest.useFakeTimers();
  render(<PassageScreen />);
  settle();
}

const titleCopies = () =>
  within(screen.getByTestId('passage-title')).getAllByText(
    'The Last Supper',
    hidden,
  );

/** A 360-wide header, with the title at the given width. */
function layOutTitle(titleWidth: number) {
  fireEvent(screen.getByTestId('passage-header'), 'layout', {
    nativeEvent: { layout: { width: 360, height: 72 } },
  });
  fireEvent(titleCopies()[0], 'layout', {
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
    mockParams = { ...baseParams };
    mockPassage = ready;
    mockDownloadState = 'idle';
    mockRefreshSync.mockClear();
    mockSource = { ...sourceDefaults };
    mockReduceMotion = false;
    mockFocused = true;
    mockNotes = [];
    mockNotesFailed = false;
    mockDraftingUnit = 'pericope';
    mockConflict = false;
    mockUnuploadable.mockResolvedValue(false);
    mockObserverGrant = false;
    mockTranslatorGrant = false;
  });

  afterEach(() => {
    jest.useRealTimers();
    logger.reset();
  });

  it("opens the book page at this chapter from the title's sheet", () => {
    renderSettled();
    expect(screen.queryByTestId('passage-book')).toBeNull();

    fireEvent.press(
      screen.getByRole('button', { name: 'The Last Supper. Show details.' }),
    );
    expect(
      within(screen.getByTestId('passage-title-sheet')).getByRole('header', {
        name: 'The Last Supper',
      }),
    ).toBeTruthy();
    fireEvent.press(
      screen.getByRole('button', {
        name: 'Mark 14 · Gospels Phase 1. Open book page.',
      }),
    );
    settle();

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

  it('goes back to the book page it came from instead of stacking another', () => {
    mockParams = { ...baseParams, from: 'book' };
    renderSettled();

    fireEvent.press(screen.getByTestId('passage-title'));
    fireEvent.press(screen.getByTestId('passage-book'));
    settle();

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('runs a title too long for the header as a ticker, after a pause', () => {
    renderSettled();
    layOutTitle(400);

    expect(titleCopies()).toHaveLength(2);
    expect(
      within(screen.getByTestId('passage-title')).queryAllByText(
        'The Last Supper',
      ),
    ).toHaveLength(0);
    act(() => jest.advanceTimersByTime(1500));
    expect(tickerOffset()).toBe(0);
    act(() => jest.advanceTimersByTime(1500));
    expect(tickerOffset()).toBeLessThan(0);
  });

  it('stops the ticker while another screen covers the player', () => {
    renderSettled();
    layOutTitle(400);
    act(() => jest.advanceTimersByTime(3000));
    expect(tickerOffset()).toBeLessThan(0);

    mockFocused = false;
    screen.rerender(<PassageScreen />);
    act(() => jest.advanceTimersByTime(3000));

    expect(tickerOffset()).toBe(0);
  });

  it('leaves a title that fits where it is', () => {
    renderSettled();
    layOutTitle(200);
    act(() => jest.advanceTimersByTime(3000));

    expect(titleCopies()).toHaveLength(1);
    expect(tickerOffset()).toBe(0);
  });

  it('shows a finished chapter as peer checked, with no Record', () => {
    mockPassage = {
      ...ready,
      recordedStatus: 'none',
      takes: [],
      assignment: { ...ready.assignment, status: 'complete' },
    };
    render(<PassageScreen />);

    expect(screen.getByTestId('passage-takes-meta').props.children).toBe(
      "Peer checked · Takes aren't on this phone",
    );
    expect(screen.queryByTestId('passage-record')).toBeNull();
    expect(screen.getByLabelText('Listen')).toBeTruthy();
  });

  it('keeps a long title still when motion is reduced', () => {
    mockReduceMotion = true;
    renderSettled();
    layOutTitle(400);
    act(() => jest.advanceTimersByTime(3000));

    expect(titleCopies()).toHaveLength(1);
    expect(screen.queryByTestId('passage-title-ticker', hidden)).toBeNull();
  });

  it('puts the script, its actions and takes in the hero, with no steps', () => {
    render(<PassageScreen />);

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

  it('shows the verses that are on the phone when some are missing', () => {
    mockPassage = {
      ...ready,
      downloaded: false,
      verses: [ready.verses[0], { ...ready.verses[1], text: '' }],
    };
    render(<PassageScreen />);

    expect(screen.getByText(/While they were eating/)).toBeTruthy();
    expect(screen.getByText('The text isn’t on this phone yet.')).toBeTruthy();
  });

  it('highlights the verse the source audio is on', () => {
    render(<PassageScreen />);
    const { onPlayingVerseChange } = mockUseSourceAudio.mock.calls.at(
      -1,
    )?.[0] as { onPlayingVerseChange: (verse: number | null) => void };

    act(() => onPlayingVerseChange(23));

    expect(
      within(screen.getByTestId('passage-script-playing')).getByText(
        /Then he took a cup/,
      ),
    ).toBeTruthy();
  });

  it('plays this chapter from Listen and pauses on the next press', async () => {
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));

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
      fireEvent.press(screen.getByLabelText('Play source audio'));
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
    screen.rerender(<PassageScreen />);

    expect(
      screen.getByTestId('passage-waveform').props.accessibilityValue,
    ).toMatchObject({ now: 25 });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Pause source audio'));
    });
    expect(mockPauseSource).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('seeks the source chapter from the script waveform', () => {
    mockSource = { ...mockSource, durationMs: 10000 };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));

    expect(screen.getByTestId('passage-waveform').props.accessibilityRole).toBe(
      'adjustable',
    );
    fireEvent(
      screen.getByLabelText('Mark 14:22–25 playback'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } },
    );

    expect(mockSeekSource).toHaveBeenCalledWith(500);
  });

  it('scrubs and shows progress through the passage, not the chapter', () => {
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
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));

    // Verses 22–23 run 20s to 40s, where verse 24 starts; a step is 5%.
    expect(
      screen.getByTestId('passage-waveform').props.accessibilityValue,
    ).toMatchObject({ now: 50 });
    fireEvent(
      screen.getByLabelText('Mark 14:22–25 playback'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } },
    );
    expect(mockSeekSource).toHaveBeenCalledWith(31000);
  });

  it('stops Listen when it reaches the end of the passage', () => {
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
    const { rerender } = render(<PassageScreen />);
    expect(mockPauseSource).not.toHaveBeenCalled();

    mockSource = { ...playing, positionMs: 40000 };
    rerender(<PassageScreen />);

    expect(mockPauseSource).toHaveBeenCalledTimes(1);
  });

  it('keeps playing a replay while the position still reads the old end', () => {
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
    const { rerender } = render(<PassageScreen />);

    mockSource = { ...ended, isPlaying: true };
    rerender(<PassageScreen />);
    mockSource = { ...ended, isPlaying: true, positionMs: 20000 };
    rerender(<PassageScreen />);

    expect(mockPauseSource).not.toHaveBeenCalled();
  });

  it('does not play or leave when source audio is missing', () => {
    mockSource = { ...mockSource, loadState: 'empty' };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));

    expect(
      screen.getByTestId('passage-key-listen').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByLabelText('No source audio'));
    expect(mockPlaySource).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('retries a failed source load without leaving the passage', () => {
    mockSource = { ...mockSource, loadState: 'error' };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));

    fireEvent.press(screen.getByLabelText('Retry loading source audio'));
    expect(mockRetrySource).toHaveBeenCalledTimes(1);
    expect(mockPlaySource).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('plays a take in Record and does not open Legacy drafting', async () => {
    mockSession = { ...mockSession, takes: [take(1)] };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

    expect(mockUseSourceAudio.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ enabled: false }),
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Play take'));
    });

    expect(mockPlayTake).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      undefined,
    );
    expect(mockPlaySource).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps source audio off while a take capture is active', () => {
    mockSession = { ...mockSession, state: 'recording', captureActive: true };
    render(<PassageScreen />);

    expect(mockUseSourceAudio.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ enabled: false }),
    );
  });

  it('shows Eject when a take is recovered after Listen opened', () => {
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));
    expect(screen.queryByLabelText('Finish take')).toBeNull();

    mockSession = { ...mockSession, state: 'paused', captureActive: true };
    screen.rerender(<PassageScreen />);

    expect(screen.getByLabelText('Finish take')).toBeTruthy();
    expect(screen.queryByLabelText('Play source audio')).toBeNull();
  });

  it('refreshes the sync cloud after the passage text download finishes', () => {
    mockDownloadState = 'downloading';
    render(<PassageScreen />);
    expect(mockRefreshSync).not.toHaveBeenCalled();

    mockDownloadState = 'idle';
    screen.rerender(<PassageScreen />);

    expect(mockRefreshSync).toHaveBeenCalledTimes(1);
  });

  it('keeps Previous and Next off on the one page', () => {
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));

    for (const id of ['passage-key-previous', 'passage-key-next']) {
      expect(screen.getByTestId(id).props.accessibilityState).toMatchObject({
        disabled: true,
      });
    }
  });

  it('opens a translation note from its phrase and steps through the notes', () => {
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
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));
    // Phrases are drawn once the player stops moving.
    expect(screen.queryByLabelText('Translation note: took a cup')).toBeNull();
    settle();
    expect(mockPauseSource).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Translation note: took a cup'));

    expect(screen.getByText('The cup held wine.')).toBeTruthy();
    expect(mockPauseSource).toHaveBeenCalled();
    expect(
      screen.getByLabelText("This note's audio isn't available yet"),
    ).toBeTruthy();
    expect(
      screen.getByTestId('passage-key-previous').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    fireEvent.press(
      screen.getByLabelText('Next note: a phrase from another translation'),
    );
    expect(screen.getByLabelText('Note 2 of 2')).toBeTruthy();

    // The blue shrinks back before the note goes.
    fireEvent.press(screen.getByLabelText('Close the note'));
    expect(screen.getByTestId('passage-note')).toBeTruthy();
    settle();
    expect(screen.queryByTestId('passage-note')).toBeNull();
    expect(screen.getByLabelText('1 more translation note')).toBeTruthy();
  });

  it('turns to the next note when the pager is swiped', () => {
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
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));
    settle();
    fireEvent.press(screen.getByLabelText('Translation note: took a cup'));
    const pager = screen.getByTestId('passage-note-pager');
    fireEvent(pager.parent!.parent!, 'layout', {
      nativeEvent: { layout: { width: 360, height: 400 } },
    });

    fireEvent(pager, 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 360, y: 0 } },
    });

    expect(screen.getByLabelText('Note 2 of 2')).toBeTruthy();
    expect(
      screen.getByText('This note quotes another translation.'),
    ).toBeTruthy();

    // A slow drag settles without momentum, and stays on the notes there are.
    fireEvent(pager, 'scrollEndDrag', {
      nativeEvent: { contentOffset: { x: 0, y: 0 }, velocity: { x: 2, y: 0 } },
    });
    expect(screen.getByLabelText('Note 2 of 2')).toBeTruthy();
    fireEvent(pager, 'scrollEndDrag', {
      nativeEvent: { contentOffset: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } },
    });
    expect(screen.getByLabelText('Note 1 of 2')).toBeTruthy();
    fireEvent(pager, 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 1080, y: 0 } },
    });
    expect(screen.getByLabelText('Note 2 of 2')).toBeTruthy();
  });

  it('strokes the note header while that note is scrolled under it', () => {
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
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));
    settle();
    fireEvent.press(screen.getByLabelText('Translation note: took a cup'));
    settle();
    const stroke = () => screen.getByTestId('passage-note-header-stroke');
    expect(stroke()).toHaveAnimatedStyle({ opacity: 0 });

    fireEvent.scroll(screen.getByTestId('passage-note-page-0'), {
      nativeEvent: { contentOffset: { x: 0, y: 30 } },
    });
    settle();
    expect(stroke()).toHaveAnimatedStyle({ opacity: 1 });

    // The next note is still at its top.
    fireEvent.press(
      screen.getByLabelText('Next note: a phrase from another translation'),
    );
    settle();
    expect(stroke()).toHaveAnimatedStyle({ opacity: 0 });
  });

  it('keeps the notes it has when a reload fails', () => {
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
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));
    settle();
    expect(screen.getByLabelText('Translation note: took a cup')).toBeTruthy();

    mockNotesFailed = true;
    screen.rerender(<PassageScreen />);

    expect(screen.getByLabelText('Translation note: took a cup')).toBeTruthy();
  });

  it('leaves the note chips inert while Record is open', () => {
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
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));
    settle();

    expect(screen.getByTestId('passage-note-chip-0-0')).toBeTruthy();
    expect(screen.queryByLabelText('Translation note: took a cup')).toBeNull();
  });

  it("squares a phrase's corners where its words share a line, not across a wrap", () => {
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
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));
    settle();
    const chip = (j: number) =>
      StyleSheet.flatten(
        screen.getByTestId(`passage-note-chip-0-${j}`, hidden).props.style,
      );

    // "took a" ends one line, "cup" starts the next. Verse numbers are
    // inline views too.
    fireEvent(screen.getByTestId('passage-script-text', hidden), 'textLayout', {
      nativeEvent: {
        lines: [
          { text: '\uFFFC While they were eating \uFFFC Then he \uFFFC\uFFFC' },
          { text: '\uFFFC ' },
        ],
      },
    });

    expect(chip(0).borderTopRightRadius).toBe(0);
    expect(chip(1).borderTopLeftRadius).toBe(0);
    expect(chip(1).borderTopRightRadius).not.toBe(0);
    expect(chip(2).borderTopLeftRadius).not.toBe(0);
  });

  it('speaks the missing takes line on Record when nothing is recorded', () => {
    mockPassage = { ...ready, recordedStatus: 'none', takes: [] };
    render(<PassageScreen />);

    expect(screen.queryByTestId('passage-takes-meta')).toBeNull();
    expect(screen.getByLabelText('Record, not recorded yet')).toBeTruthy();
  });

  it('says the send is waiting even with no takes on this phone', () => {
    mockPassage = {
      ...ready,
      recordedStatus: 'none',
      takes: [],
      waitingToSend: true,
    };
    render(<PassageScreen />);

    expect(screen.getByTestId('passage-takes-meta').props.children).toBe(
      'Waiting to send',
    );
  });

  it('says when the send is waiting to go up', () => {
    mockPassage = { ...ready, waitingToSend: true };
    render(<PassageScreen />);

    expect(screen.getByTestId('passage-takes-meta').props.children).toMatch(
      /^2 takes · .* · Waiting to send$/,
    );
  });

  it('closes the player before leaving the page', () => {
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));

    expect(screen.queryByTestId('passage-back')).toBeNull();
    fireEvent.press(screen.getByTestId('passage-close'));
    expect(mockBack).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('passage-back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it("offers a download when the text isn't on the phone", () => {
    mockPassage = { ...ready, downloaded: false, verses: [] };

    render(<PassageScreen />);
    expect(screen.getByText('The text isn’t on this phone yet.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('passage-download'));

    expect(mockDownload).toHaveBeenCalled();
    expect(screen.queryByTestId('passage-script', hidden)).toBeNull();
  });

  it("says when it can't be found", () => {
    mockPassage = { status: 'missing' };

    render(<PassageScreen />);

    expect(screen.getByText("This couldn't be found.")).toBeTruthy();
    fireEvent.press(screen.getByTestId('passage-missing-back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('opens Sync from the header cloud, guarded during a take', () => {
    render(<PassageScreen />);

    fireEvent.press(screen.getByTestId('passage-sync'));
    expect(mockOpenSync).toHaveBeenCalledTimes(1);
    expect(mockUseHeaderSync.mock.calls.at(-1)?.[0]).toEqual({
      onSyncComplete: expect.any(Function),
      guard: expect.any(Function),
    });
  });

  it('records a take after the mic check, from the Record key', async () => {
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('passage-key-record'));
    });

    expect(mockEnsureMic).toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalled();
  });

  it('takes Record again after the mic request fails', async () => {
    const mockTransport = jest.fn();
    logger.setTransport(mockTransport);
    mockEnsureMic.mockRejectedValueOnce(new Error('no mic'));
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('passage-key-record'));
    });
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockTransport).toHaveBeenCalledWith(
      'error',
      'useRecorder',
      'Player key failed',
      { error: expect.any(Error) },
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('passage-key-record'));
    });
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('shows the take in progress and pauses it from the same key', async () => {
    mockSession = { ...mockSession, state: 'recording', captureActive: true };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

    expect(
      screen.getByLabelText('Passage take 1, recording, 0:13'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Take 1, recording')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Pause recording'));
    });
    expect(mockPause).toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('keeps going on the paused take from Record', async () => {
    mockSession = { ...mockSession, state: 'recording', captureActive: true };
    const { rerender } = render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));
    mockSession = { ...mockSession, state: 'paused' };
    rerender(<PassageScreen />);

    expect(screen.getByText('Paused. Eject finishes the take.')).toBeTruthy();
    // Still the take in progress, not a saved one to pick.
    expect(
      screen.getByLabelText('Take 1, paused').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(screen.getByLabelText('Passage take 1, paused, 0:13')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Resume recording'));
    });
    expect(mockResume).toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("doesn't call a paused take recovered when its save fails", () => {
    mockSession = { ...mockSession, state: 'recording', captureActive: true };
    const { rerender } = render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));
    mockSession = { ...mockSession, state: 'saving', captureActive: false };
    rerender(<PassageScreen />);
    mockSession = { ...mockSession, state: 'paused', captureActive: true };
    rerender(<PassageScreen />);

    expect(screen.getByText('Paused. Eject finishes the take.')).toBeTruthy();
  });

  it('ignores the Record key while a take is saving', async () => {
    mockSession = { ...mockSession, state: 'saving' };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

    expect(
      screen.getByTestId('passage-key-record').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('offers Resume and Finish for a take recovered after a crash', () => {
    mockSession = { ...mockSession, state: 'paused', captureActive: true };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));

    expect(screen.getByLabelText('Resume recording')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Finish take'));
    expect(mockStop).toHaveBeenCalled();
    expect(screen.getByText('Take recovered. Eject finishes it.')).toBeTruthy();
  });

  it('says why Record is off when a verse is at the take limit', () => {
    mockSession = { ...mockSession, canRecordNewTake: false };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

    expect(
      screen.getByTestId('passage-key-record').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(
      screen.getByText(
        'A verse here has 5 takes. Delete one in classic drafting to record.',
      ),
    ).toBeTruthy();
  });

  it("won't record a passage without pericopes, and says why", () => {
    mockSession = { ...mockSession, pericopeUnavailable: true };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

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

    it('records inside the passage instead of sending it to classic drafting', () => {
      render(<PassageScreen />);

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

      function playThrough23() {
        fireEvent.press(screen.getByTestId('passage-listen'));
        mockSource = { ...mockSource, isPlaying: true };
        screen.rerender(<PassageScreen />);
        const { onPlayingVerseChange } = mockUseSourceAudio.mock.calls.at(
          -1,
        )?.[0] as { onPlayingVerseChange: (verse: number | null) => void };
        act(() => onPlayingVerseChange(23));
      }

      it('follows the verse playing, with chips on the waveform', () => {
        mockSource = { ...mockSource, verseTimestamps: timings };
        render(<PassageScreen />);
        playThrough23();

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
        render(<PassageScreen />);
        playThrough23();

        expect(lastSession()).toMatchObject({ selectedVerse: 22 });
        mockSource = { ...mockSource, isPlaying: false };
        await act(async () => screen.rerender(<PassageScreen />));
        expect(lastSession()).toMatchObject({ selectedVerse: 23 });
      });

      it('steps from the verse playing with Previous and Next', async () => {
        mockSource = { ...mockSource, verseTimestamps: timings };
        render(<PassageScreen />);
        playThrough23();

        expect(
          screen.getByTestId('passage-key-next').props.accessibilityState,
        ).toMatchObject({ disabled: true });
        await act(async () => {
          fireEvent.press(screen.getByLabelText('Previous: verse 22'));
        });
        expect(mockSeekSource).toHaveBeenCalledWith(0);
      });

      it('claims no verse playing without verse timings', () => {
        render(<PassageScreen />);
        playThrough23();

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

    it('shows why the text is missing instead of empty verse pages', () => {
      mockPassage = {
        ...ready,
        wholeChapter: true,
        downloaded: false,
        verses: [ready.verses[0]!],
      };
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-listen'));

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
      render(<PassageScreen />);

      expect(screen.getByText('1 of 2 recorded')).toBeTruthy();
      // The rings show recorded or not; only a passage take gets a line.
      expect(screen.getByText('Recorded in a passage take')).toBeTruthy();
      expect(screen.queryByText('Not recorded yet')).toBeNull();
      expect(screen.getByLabelText('Verse 23, Not recorded yet')).toBeTruthy();
      expect(lastSession()).toMatchObject({ selectedVerse: 23 });
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-verse-row-22'));
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
      render(<PassageScreen />);
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-verse-row-22'));
      });

      expect(screen.getByTestId('passage-verse-pages')).toBeTruthy();
      expect(mockPlaySource).not.toHaveBeenCalled();
    });

    it("doesn't play a tapped row's verse that has no timing", async () => {
      mockSource = {
        ...mockSource,
        verseTimestamps: [{ verse: 22, startSeconds: 0 }],
      };
      render(<PassageScreen />);
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-verse-row-23'));
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
      render(<PassageScreen />);
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-verse-row-23'));
      });

      expect(mockSeekSource).toHaveBeenCalledWith(6000);
      expect(mockPlaySource).toHaveBeenCalledTimes(1);
    });

    it('steps verses with Previous and Next in Listen', async () => {
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-listen'));

      expect(
        screen.getByTestId('passage-key-previous').props.accessibilityState,
      ).toMatchObject({ disabled: true });
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Next: verse 23'));
      });

      expect(lastSession()).toMatchObject({ selectedVerse: 23 });
      expect(mockUseSourceAudio.mock.calls.at(-1)?.[0]).toMatchObject({
        verse: 23,
      });
    });

    it("re-reads the passage once a verse's first take is saved, not on a step", () => {
      const verseTake = {
        ...take(1),
        granularity: 'verse',
        isSelected: true,
        startVerse: 22,
        endVerse: 22,
      };
      render(<PassageScreen />);
      mockReload.mockClear();

      mockSession = { ...mockSession, takes: [verseTake] };
      screen.rerender(<PassageScreen />);
      expect(mockReload).toHaveBeenCalledTimes(1);

      // A step clears the text id, then the next verse's takes load.
      mockSession = { ...mockSession, captureBibleTextId: null, takes: [] };
      screen.rerender(<PassageScreen />);
      mockSession = {
        ...mockSession,
        captureBibleTextId: 1023,
        takes: [{ ...verseTake, id: 't9', startVerse: 23, endVerse: 23 }],
      };
      screen.rerender(<PassageScreen />);
      expect(mockReload).toHaveBeenCalledTimes(1);
    });

    it('opens on the verse a recovered take was paused on', () => {
      mockParams = { ...baseParams, verse: '23' };
      render(<PassageScreen />);

      expect(lastSession()).toMatchObject({ selectedVerse: 23 });
    });

    it('is verse by verse in a chapter without pericopes, whatever the setting', () => {
      mockDraftingUnit = 'pericope';
      mockPassage = { ...ready, title: null, wholeChapter: true };
      render(<PassageScreen />);

      expect(lastSession()).toMatchObject({ draftingUnit: 'verse' });
      expect(screen.getByTestId('passage-verse-list')).toBeTruthy();
    });

    it('leaves the takes line out before any verse is recorded', () => {
      mockPassage = {
        ...ready,
        recordedStatus: 'none',
        verses: ready.verses.map(v => ({ ...v, recorded: null })),
      };
      render(<PassageScreen />);

      expect(screen.queryByTestId('passage-takes-meta')).toBeNull();
    });

    it('deletes a take waiting on undo before stepping to another verse', async () => {
      mockSession = {
        ...mockSession,
        takes: [{ ...take(1), granularity: 'verse', isSelected: true }],
      };
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));
      fireEvent(
        screen.getByLabelText('Take 1, selected'),
        'accessibilityAction',
        { nativeEvent: { actionName: 'delete' } },
      );

      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-verse-row-23'));
      });

      expect(mockDeleteTake).toHaveBeenCalledWith('t1');
      expect(lastSession()).toMatchObject({ selectedVerse: 23 });
    });

    it('points to the verse take to delete when passage takes fill the cap', () => {
      mockSession = {
        ...mockSession,
        canRecordNewTake: false,
        takes: [
          { ...take(1), granularity: 'verse' },
          { ...take(2), isSelected: true, startVerse: 22, endVerse: 23 },
        ],
      };
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.getAllByText(
          'This verse has 5 takes, counting passage takes over it. Delete one to record.',
          hidden,
        ).length,
      ).toBeGreaterThan(0);
    });

    it('points to Pericope when only passage takes fill the cap', () => {
      mockSession = {
        ...mockSession,
        canRecordNewTake: false,
        takes: [{ ...take(2), isSelected: true, startVerse: 22, endVerse: 23 }],
      };
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));

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
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-key-record'));
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-confirm-cancel'));
      });
      expect(mockStart).not.toHaveBeenCalled();
    });

    it("names the verse on its take's card", () => {
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
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));

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
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-key-record'));
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
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.getAllByText('This verse is in passage take 2.', hidden).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getByTestId('passage-key-play').props.accessibilityState,
      ).toMatchObject({ disabled: false });
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-key-play'));
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
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));
      await act(async () => {
        fireEvent(
          screen.getByTestId('passage-verse-position'),
          'accessibilityAction',
          { nativeEvent: { actionName: 'increment' } },
        );
      });
      expect(lastSession()).toMatchObject({ selectedVerse: 23 });

      mockSession = { ...mockSession, state: 'idle', playingTakeId: null };
      screen.rerender(<PassageScreen />);
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-key-play'));
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
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));
      fireEvent.press(screen.getByTestId('passage-fan-p1'));
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-take-official'));
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
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-take-official'));
      });

      expect(screen.queryByTestId('passage-confirm')).toBeNull();
      expect(mockSelectTake).not.toHaveBeenCalled();
      expect(mockSetCanonical).toHaveBeenCalledWith('t2');
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
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-key-play'));
      });
      expect(mockPauseTake).toHaveBeenCalled();

      mockSession = { ...mockSession, state: 'idle', playingTakeId: null };
      screen.rerender(<PassageScreen />);
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-key-play'));
      });
      expect(mockPlayTake).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 't2' }),
        4000,
      );

      const playback = screen.getByLabelText(
        'Passage take 2 · v. 22–23 playback',
      );
      for (let step = 0; step < 20; step += 1) {
        fireEvent(playback, 'accessibilityAction', {
          nativeEvent: { actionName: 'increment' },
        });
      }
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-key-play'));
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

      it('numbers the next take after a passage take that starts on the verse', () => {
        mockSession = {
          ...mockSession,
          takes: [{ ...passageTake, isSelected: true }],
        };
        render(<PassageScreen />);
        fireEvent.press(screen.getByTestId('passage-record'));

        expect(
          screen.getByLabelText('Passage take 1, v. 22–23, selected'),
        ).toBeTruthy();
        expect(screen.getByTestId('passage-fan-2')).toBeTruthy();
      });

      it('numbers the next take after a passage take that only covers the verse', () => {
        mockSession = {
          ...mockSession,
          takes: [{ ...passageTake, isSelected: true, startVerse: 21 }],
        };
        render(<PassageScreen />);
        fireEvent.press(screen.getByTestId('passage-record'));

        expect(screen.getByTestId('passage-fan-2')).toBeTruthy();
      });

      it('shows a passage take beside the verse take that replaced it, and asks before picking it back', async () => {
        mockSession = { ...mockSession, takes: [passageTake, ownTake] };
        render(<PassageScreen />);
        fireEvent.press(screen.getByTestId('passage-record'));

        expect(screen.getByTestId('passage-fan-p1')).toBeTruthy();
        expect(screen.getByTestId('passage-fan-2')).toBeTruthy();
        // Tapping only brings it forward; the check asks.
        fireEvent.press(screen.getByTestId('passage-fan-p1'));
        expect(screen.queryByTestId('passage-confirm')).toBeNull();
        await act(async () => {
          fireEvent.press(screen.getByTestId('passage-take-official'));
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
          fireEvent.press(screen.getByTestId('passage-confirm-confirm'));
        });
        expect(mockSelectTake).toHaveBeenCalledWith('t1');
        expect(mockSetCanonical).toHaveBeenCalledWith('t1');
      });

      it("brings a picked passage take's tile forward to play it", async () => {
        mockSession = {
          ...mockSession,
          takes: [
            { ...passageTake, isSelected: true, startVerse: 21, endVerse: 23 },
            { ...ownTake, isSelected: false },
          ],
        };
        render(<PassageScreen />);
        fireEvent.press(screen.getByTestId('passage-record'));
        fireEvent.press(screen.getByTestId('passage-fan-p1'));
        await act(async () => {
          fireEvent.press(screen.getByTestId('passage-key-play'));
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
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.getAllByText('This verse is in passage take 2.', hidden).length,
      ).toBeGreaterThan(0);
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-key-record'));
      });
      expect(screen.getByText('Record v. 22 on its own?')).toBeTruthy();
      expect(
        screen.getByText(
          "Passage take 2 won't be used for v. 22–23 anymore, so the rest of those verses will need recording too.",
        ),
      ).toBeTruthy();
      expect(mockStart).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-confirm-confirm'));
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
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));
      fireEvent.press(screen.getByTestId('passage-fan-1'));
      expect(screen.queryByTestId('passage-confirm')).toBeNull();
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-take-official'));
      });

      expect(screen.getByText('Use take 1 for v. 22?')).toBeTruthy();
      expect(
        screen.getByText(
          "Passage take 2 won't be used for v. 22–23 anymore, so the rest of those verses will need recording too.",
        ),
      ).toBeTruthy();
      expect(mockSelectTake).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-confirm-confirm'));
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
      const layOutPages = () =>
        fireEvent(screen.getByTestId('passage-verse-pages'), 'layout', {
          nativeEvent: { layout: { width: 300, height: 600 } },
        });

      it('shows them as chips on the verse page and opens them in Listen', () => {
        render(<PassageScreen />);
        fireEvent.press(screen.getByTestId('passage-listen'));
        settle();
        layOutPages();

        expect(screen.getByTestId('passage-verse-note-23-0-0')).toBeTruthy();
        fireEvent.press(screen.getByLabelText('Translation note: took a cup'));
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
        render(<PassageScreen />);
        fireEvent.press(screen.getByTestId('passage-listen'));
        settle();
        layOutPages();

        expect(screen.getByLabelText('1 more translation note')).toBeTruthy();
        await act(async () => {
          fireEvent.press(screen.getByLabelText('Next: verse 23'));
        });
        expect(screen.queryByTestId('passage-more-notes')).toBeNull();
        await act(async () => {
          fireEvent.press(screen.getByLabelText('Previous: verse 22'));
        });
        fireEvent.press(screen.getByTestId('passage-more-notes'));
        expect(
          screen.getByText('This note quotes another translation.'),
        ).toBeTruthy();
      });

      it("dims them in Record, where they don't open", () => {
        render(<PassageScreen />);
        fireEvent.press(screen.getByTestId('passage-listen'));
        settle();
        layOutPages();
        const outline = () =>
          StyleSheet.flatten(
            screen.getByTestId('passage-verse-note-23-0-0', hidden).props.style,
          ).borderColor;
        const listening = outline();

        fireEvent.press(screen.getByLabelText('Record mode'));
        settle();

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
        render(<PassageScreen />);
        fireEvent.press(screen.getByTestId('passage-record'));
        fireEvent(
          screen.getByLabelText(/Take 2, selected/),
          'accessibilityAction',
          { nativeEvent: { actionName: 'delete' } },
        );
        await act(async () => {
          fireEvent.press(screen.getByTestId('passage-key-record'));
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
        render(<PassageScreen />);
        fireEvent.press(screen.getByTestId('passage-record'));
        await act(async () => {
          fireEvent.press(screen.getByTestId('passage-key-record'));
        });
        await act(async () => stepToNext());
        expect(lastSession()).toMatchObject({ selectedVerse: 23 });

        await act(async () => grantMic(true));
        expect(mockStart).not.toHaveBeenCalled();
      });
    });
  });

  it('opens classic drafting from the title sheet', () => {
    renderSettled();
    fireEvent.press(
      screen.getByRole('button', { name: 'The Last Supper. Show details.' }),
    );
    settle();
    fireEvent.press(screen.getByTestId('passage-classic'));

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
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

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
      fireEvent.press(screen.getByTestId('passage-key-record'));
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('warns about a sync conflict and takes that cannot upload', async () => {
    mockConflict = true;
    render(<PassageScreen />);
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
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.getAllByText('Recorded verse by verse', hidden).length,
      ).toBeGreaterThan(0);
      expect(screen.queryByTestId('passage-notices-verse-takes')).toBeNull();
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-key-play'));
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
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.getAllByText('Recorded verse by verse', hidden).length,
      ).toBeGreaterThan(0);
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-key-play'));
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

    it('counts the verses when only some are recorded', () => {
      mockSession = { ...mockSession, takes: [verseTake(1, 22)] };
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.getAllByText('1 of 2 verses recorded on their own', hidden)
          .length,
      ).toBeGreaterThan(0);
    });

    it('asks before a passage take replaces them', async () => {
      mockSession = { ...mockSession, takes: [verseTake(1, 22)] };
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-key-record'));
      });

      expect(screen.getByText('Record the whole passage?')).toBeTruthy();
      expect(
        screen.getByText(
          "The verses recorded on their own here won't be used anymore.",
        ),
      ).toBeTruthy();
      expect(mockStart).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-confirm-confirm'));
      });
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('counts the verses in the hero while they are the draft', () => {
      mockPassage = {
        ...ready,
        recordedStatus: 'partial',
        verses: [ready.verses[0]!, { ...ready.verses[1]!, recorded: null }],
      };
      mockSession = {
        ...mockSession,
        takes: [{ ...take(3), isSelected: false }, verseTake(1, 22)],
      };
      render(<PassageScreen />);

      expect(screen.getByTestId('passage-takes-meta').props.children).toBe(
        '1 of 2 verses recorded',
      );
    });

    it('asks before picking a passage take over them', async () => {
      mockSession = {
        ...mockSession,
        takes: [{ ...take(3), isSelected: false }, verseTake(1, 22)],
      };
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));
      fireEvent.press(screen.getByTestId('passage-fan-3'));
      expect(screen.queryByTestId('passage-confirm')).toBeNull();
      await act(async () => {
        fireEvent.press(screen.getByTestId('passage-take-official'));
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
        fireEvent.press(screen.getByTestId('passage-confirm-confirm'));
      });
      expect(mockSelectTake).toHaveBeenCalledWith('t3');
    });

    it('goes back to the verses card when the tile in front is tapped again', () => {
      mockSession = {
        ...mockSession,
        takes: [{ ...take(3), isSelected: false }, verseTake(1, 22)],
      };
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));
      const versesCard = () =>
        screen.queryAllByText('1 of 2 verses recorded on their own', hidden);

      expect(versesCard().length).toBeGreaterThan(0);
      fireEvent.press(screen.getByTestId('passage-fan-3'));
      expect(versesCard()).toHaveLength(0);
      fireEvent.press(screen.getByTestId('passage-fan-3'));
      expect(versesCard().length).toBeGreaterThan(0);
    });

    it('leads with a passage take that is the draft', () => {
      mockSession = {
        ...mockSession,
        takes: [
          { ...take(3), isSelected: true },
          { ...verseTake(1, 22), isSelected: false },
        ],
      };
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));

      expect(
        screen.queryAllByText('1 of 2 verses recorded on their own', hidden),
      ).toHaveLength(0);
    });
  });

  it("says why it can't record when the chapter is someone else's", () => {
    mockSession = { ...mockSession, isTaken: true };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

    expect(
      screen.getByText('This chapter is assigned to another translator.'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('passage-key-record').props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it('warns that the chapter is taken in the hero and in Listen', () => {
    mockSession = { ...mockSession, isTaken: true };
    render(<PassageScreen />);

    expect(screen.getByTestId('passage-notices-taken')).toBeTruthy();
    fireEvent.press(screen.getByTestId('passage-listen'));
    expect(screen.getByTestId('player-notices-taken')).toBeTruthy();
  });

  it("keeps Record's reasons out of Listen", () => {
    mockSession = { ...mockSession, drafterCaptureBlocked: true };
    mockDraftingUnit = 'verse';
    render(<PassageScreen />);

    fireEvent.press(screen.getByTestId('passage-listen'));

    expect(screen.queryByTestId('player-notices-not-open')).toBeNull();
    expect(screen.queryByTestId('player-notices-classic')).toBeNull();
    expect(screen.queryByTestId('player-notices-open-classic')).toBeNull();
  });

  it('plays the take from where it was scrubbed to', async () => {
    mockSession = { ...mockSession, takes: [take(1)] };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

    fireEvent(
      screen.getByLabelText('Passage take 1 playback'),
      'accessibilityAction',
      {
        nativeEvent: { actionName: 'increment' },
      },
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Play take'));
    });

    expect(mockPlayTake).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      500,
    );
  });

  it('plays from the start after a scrub to the end', async () => {
    mockSession = { ...mockSession, takes: [take(1)] };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

    const playback = screen.getByLabelText('Passage take 1 playback');
    for (let step = 0; step < 20; step += 1) {
      fireEvent(playback, 'accessibilityAction', {
        nativeEvent: { actionName: 'increment' },
      });
    }
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Play take'));
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
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));
      const remove = () =>
        fireEvent(
          screen.getByLabelText('Take 2, selected'),
          'accessibilityAction',
          { nativeEvent: { actionName: 'delete' } },
        );

      remove();
      expect(screen.getByLabelText('Take 2, deleted')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('Undo deleting Passage take 2'));
      await act(async () => {
        jest.advanceTimersByTime(UNDO_MS);
      });
      expect(mockDeleteTake).not.toHaveBeenCalled();

      remove();
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
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));
    fireEvent(
      screen.getByLabelText('Take 2, selected'),
      'accessibilityAction',
      {
        nativeEvent: { actionName: 'delete' },
      },
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('passage-key-record'));
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
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));
    fireEvent(
      screen.getByLabelText('Take 2, selected'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'delete' } },
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('passage-key-record'));
    });
    expect(mockDeleteTake).toHaveBeenCalledWith('t2');
    fireEvent.press(screen.getByTestId('passage-close'));
    await act(async () => finish());

    expect(mockStart).not.toHaveBeenCalled();
  });

  it('only plays takes on a stage-locked chapter: no pick, official or delete', async () => {
    const takes = [take(1), { ...take(2), isSelected: true }];
    mockSession = { ...mockSession, takes };
    const { unmount } = render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));
    expect(screen.getByLabelText('Take 1').props.accessibilityActions).toEqual([
      { name: 'delete', label: 'Delete' },
    ]);
    await act(async () => {
      fireEvent.press(screen.getByTestId('passage-take-official'));
    });
    expect(mockSetCanonical).toHaveBeenCalledWith('t2');
    // A tap brings a take forward; its check picks it and makes it official.
    fireEvent.press(screen.getByTestId('passage-fan-1'));
    expect(mockSelectTake).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByTestId('passage-take-official'));
    });
    expect(mockSelectTake).toHaveBeenCalledWith('t1');
    expect(mockSetCanonical).toHaveBeenCalledWith('t1');
    unmount();
    jest.clearAllMocks();

    mockSession = { ...mockSession, takes, stageLocked: true };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

    expect(screen.queryByTestId('passage-take-official')).toBeNull();
    expect(
      screen.getByLabelText('Take 1').props.accessibilityActions,
    ).toBeUndefined();
    fireEvent.press(screen.getByTestId('passage-fan-1'));
    expect(mockSelectTake).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Take 2, selected')).toBeTruthy();
    expect(screen.getByLabelText('Take 1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('passage-key-play'));
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
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));

      await act(async () => {
        fireEvent.press(screen.getByLabelText('Finish take'));
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
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));

      fireEvent.press(screen.getByLabelText('Finish take'));
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Pause recording'));
      });
      expect(mockPause).not.toHaveBeenCalled();
      await act(async () => saved());

      await act(async () => {
        fireEvent.press(screen.getByLabelText('Pause recording'));
      });
      expect(mockPause).toHaveBeenCalledTimes(1);
    });

    it('stays off with no take in progress', () => {
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));

      expect(ejectState()).toMatchObject({ disabled: true });
    });

    it('stays off while the take saves', () => {
      mockSession = { ...mockSession, state: 'saving' };
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-record'));

      expect(ejectState()).toMatchObject({ disabled: true });
    });
  });

  it('asks before closing the player on a take in progress', async () => {
    mockSession = { ...mockSession, state: 'recording', captureActive: true };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

    fireEvent.press(screen.getByTestId('passage-close'));
    expect(screen.getByTestId('passage-confirm')).toBeTruthy();
    expect(screen.getByLabelText('Close the player')).toBeTruthy();

    fireEvent.press(screen.getByTestId('passage-confirm-cancel'));
    expect(mockDiscard).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('passage-close'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('passage-confirm-confirm'));
    });
    expect(mockDiscard).toHaveBeenCalledTimes(1);
  });

  it('leaves back presses to a screen pushed over the open player', () => {
    const remove = jest.fn();
    const listen = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockReturnValue({ remove });
    try {
      render(<PassageScreen />);
      fireEvent.press(screen.getByTestId('passage-listen'));
      expect(listen).toHaveBeenCalledWith(
        'hardwareBackPress',
        expect.any(Function),
      );

      const listening = listen.mock.calls.length;
      mockFocused = false;
      screen.rerender(<PassageScreen />);

      expect(remove).toHaveBeenCalled();
      expect(listen).toHaveBeenCalledTimes(listening);
    } finally {
      listen.mockRestore();
    }
  });

  it('blocks leaving while a recovered take is paused and the player is closed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSession = { ...mockSession, state: 'paused', captureActive: true };
    const view = render(<PassageScreen />);
    await waitFor(() => expect(getRecordCaptureGate()).toBe(true));

    fireEvent.press(screen.getByTestId('passage-back', hidden));
    expect(mockBack).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Recording in progress',
      expect.any(String),
      expect.any(Array),
    );

    view.unmount();
    expect(getRecordCaptureGate()).toBe(false);
  });

  it('blocks account, settings and drawer exits from the shared gate', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    setRecordCaptureGate(true);
    const close = jest.fn();
    const { result } = renderHook(() => useAccountActions({ close }));
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
    render(<PassageScreen />);
    await waitFor(() => expect(getRecordCaptureGate()).toBe(true));

    fireEvent.press(
      screen.getByRole('button', { name: 'The Last Supper. Show details.' }),
    );
    fireEvent.press(
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
    render(<PassageScreen />);
    await waitFor(() => expect(getRecordCaptureGate()).toBe(true));

    fireEvent.press(screen.getByTestId('passage-listen'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Play source audio'));
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
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('passage-key-record'));
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("won't open the title's sheet on a take in progress", () => {
    mockSession = { ...mockSession, state: 'recording', captureActive: true };
    renderSettled();
    fireEvent.press(screen.getByTestId('passage-record'));

    expect(
      screen.getByRole('header', { name: 'The Last Supper' }),
    ).toBeDisabled();
    fireEvent.press(screen.getByTestId('passage-title'));
    settle();

    expect(screen.queryByTestId('passage-title-sheet')).toBeNull();
  });
});
