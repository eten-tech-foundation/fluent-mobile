import React from 'react';
import { Alert, BackHandler } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import PassageScreen from './PassageScreen';
import type { Passage, PassageDownload } from '../../../hooks/usePassage';
import { UNDO_MS } from '../../../hooks/usePendingDelete';
import { hrefs } from '../../../navigation/hrefs';
import { logger } from '../../../utils/logger';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDownload = jest.fn();
const mockStart = jest.fn(async () => {});
const mockStop = jest.fn(async () => {});
const mockPause = jest.fn(async () => {});
const mockResume = jest.fn(async () => {});
const mockDiscard = jest.fn(async () => {});
const mockEnsureMic = jest.fn(async () => true);
const mockPlayTake = jest.fn(async () => {});
const mockDeleteTake = jest.fn(async (_id: string) => {});
const mockSelectTake = jest.fn();
const mockSetCanonical = jest.fn();
type MockTake = {
  id: string;
  takeNumber: number;
  granularity: string;
  isSelected: boolean;
  durationMs: number;
};
const sessionDefaults = {
  state: 'idle' as string,
  captureActive: false,
  isTaken: false,
  stageLocked: false,
  captureDisabled: false,
  canRecordNewTake: true,
  pericopeUnavailable: false,
  takes: [] as MockTake[],
};
let mockSession = { ...sessionDefaults };
const take = (n: number): MockTake => ({
  id: `t${n}`,
  takeNumber: n,
  granularity: 'pericope',
  isSelected: false,
  durationMs: 10000,
});
let mockPassage: Passage = { status: 'loading' };
let mockDownloadState: PassageDownload = 'idle';
let mockReduceMotion = false;
let mockFocused = true;
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
}));

jest.mock('../../../hooks/useRecordSession', () => ({
  useRecordSession: () => ({
    verseAudio: {
      state: mockSession.state,
      takes: mockSession.takes,
      deleteTake: mockDeleteTake,
      playingTakeId: null,
      selectedTake: mockSession.takes.find(t => t.isSelected) ?? null,
      start: mockStart,
      stop: mockStop,
      pause: mockPause,
      resume: mockResume,
      discardCapture: mockDiscard,
      pausePlayback: jest.fn(),
      playTake: mockPlayTake,
      selectTake: mockSelectTake,
      setCanonical: mockSetCanonical,
      ownCanonicalTakeId: null,
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
    drafterCaptureBlocked: false,
    captureDisabled: mockSession.captureDisabled,
    pericopeUnavailable: mockSession.pericopeUnavailable,
    activeRecordingUnit: { coveredViews: [] },
    ensureMic: mockEnsureMic,
  }),
}));

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

jest.mock('../../../hooks/usePassage', () => ({
  usePassage: () => ({
    passage: mockPassage,
    download: mockDownload,
    downloadState: mockDownloadState,
    reload: jest.fn(),
  }),
}));

const ready: Extract<Passage, { status: 'ready' }> = {
  status: 'ready',
  title: 'The Last Supper',
  reference: 'Mark 14:22–25',
  verses: [
    { chapterNumber: 14, verseNumber: 22, text: 'While they were eating' },
    { chapterNumber: 14, verseNumber: 23, text: 'Then he took a cup' },
  ],
  downloaded: true,
  recordedStatus: 'recorded',
  assignment: {
    id: 5,
    chapterNumber: 14,
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
    mockSession = { ...sessionDefaults };
    mockParams = { ...baseParams };
    mockPassage = ready;
    mockDownloadState = 'idle';
    mockReduceMotion = false;
    mockFocused = true;
  });

  afterEach(() => {
    jest.useRealTimers();
    logger.reset();
  });

  it("opens the book page at this chapter from the title's sheet", () => {
    renderSettled();
    expect(screen.queryByTestId('passage-book')).toBeNull();

    fireEvent.press(
      screen.getByRole('header', { name: 'The Last Supper. Show details.' }),
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

  it('keeps a long title still when motion is reduced', () => {
    mockReduceMotion = true;
    renderSettled();
    layOutTitle(400);
    act(() => jest.advanceTimersByTime(3000));

    expect(titleCopies()).toHaveLength(1);
    expect(screen.queryByTestId('passage-title-ticker', hidden)).toBeNull();
  });

  it('puts the script, its actions and takes in the hero, then the steps', () => {
    render(<PassageScreen />);

    expect(
      screen.getByRole('header', { name: 'The Last Supper. Show details.' }),
    ).toBeTruthy();
    expect(screen.getAllByText('Mark 14:22–25').length).toBeGreaterThan(1);
    expect(screen.getByLabelText('Listen')).toBeTruthy();
    expect(screen.getByLabelText('Record a take')).toBeTruthy();
    expect(screen.getByTestId('passage-takes-meta').props.children).toMatch(
      /^2 takes · /,
    );
    expect(screen.getByText('Listening materials')).toBeTruthy();
    expect(screen.getByText('Hear & Heart')).toBeTruthy();
    // Steps rest unheard, with no buttons until one is playing.
    expect(screen.getByLabelText('Hear & Heart, not heard yet')).toBeTruthy();
    expect(screen.queryByLabelText('Play Hear & Heart')).toBeNull();
  });

  it("opens the player on a listening material's page", () => {
    render(<PassageScreen />);

    fireEvent.press(screen.getByLabelText('Setting the Stage, not heard yet'));

    expect(screen.getByLabelText('Setting the Stage, 3 of 7')).toBeTruthy();
    expect(screen.getByLabelText('Close the player')).toBeTruthy();
  });

  it('opens drafting from the Listen keys until playback is wired', () => {
    render(<PassageScreen />);

    fireEvent.press(screen.getByTestId('passage-listen'));
    fireEvent.press(screen.getByLabelText('Listen in drafting'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/(stack)/verse-detail',
        params: expect.objectContaining({
          chapterId: '5',
          chapterName: 'Mark 14',
          recoverVerse: '22',
        }),
      }),
    );
  });

  it('opens the player in Listen mode', () => {
    render(<PassageScreen />);

    fireEvent.press(screen.getByTestId('passage-listen'));

    expect(screen.getByLabelText('Listen in drafting')).toBeTruthy();
    expect(screen.getByLabelText('Close the player')).toBeTruthy();
  });

  it('turns the pages from Previous and Next, like swiping', () => {
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));

    expect(
      screen.getByTestId('passage-key-previous').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(screen.getByLabelText('Previous')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Next: Hear & Heart'));

    expect(screen.getByLabelText('Hear & Heart, 2 of 7')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Previous: Mark 14:22–25'));
    expect(screen.getByLabelText('Mark 14:22–25, 1 of 7')).toBeTruthy();
  });

  it('stops Next on the last listening material', () => {
    render(<PassageScreen />);
    fireEvent.press(screen.getByLabelText('Speaking the Word, not heard yet'));

    expect(screen.getByLabelText('Speaking the Word, 7 of 7')).toBeTruthy();
    expect(
      screen.getByTestId('passage-key-next').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(screen.getByLabelText('Next')).toBeTruthy();
    expect(screen.getByLabelText('Previous: Filling the Gaps')).toBeTruthy();
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

    expect(screen.getByLabelText('Take 1, recording, 0:13')).toBeTruthy();
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
    expect(screen.getByLabelText('Take 1, paused, 0:13')).toBeTruthy();
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
        'A verse here has 5 takes. Delete one in drafting to record.',
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
    expect(screen.getByText(/isn't split into pericopes yet/)).toBeTruthy();
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

  it('plays the take from where it was scrubbed to', async () => {
    mockSession = { ...mockSession, takes: [take(1)] };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

    fireEvent(screen.getByLabelText('Take 1 playback'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Play take'));
    });

    expect(mockPlayTake).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      500,
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
      fireEvent.press(screen.getByLabelText('Undo deleting Take 2'));
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

  it('only plays takes on a stage-locked chapter: no pick, official or delete', () => {
    const takes = [take(1), { ...take(2), isSelected: true }];
    mockSession = { ...mockSession, takes };
    const { unmount } = render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));
    expect(screen.getByLabelText('Take 1').props.accessibilityActions).toEqual([
      { name: 'delete', label: 'Delete' },
    ]);
    fireEvent.press(screen.getByTestId('passage-take-official'));
    expect(mockSetCanonical).toHaveBeenCalledWith('t2');
    fireEvent.press(screen.getByTestId('passage-fan-1'));
    expect(mockSelectTake).toHaveBeenCalledWith('t1');
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
      0,
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

  it('asks before closing the player on a take in progress', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSession = { ...mockSession, state: 'recording', captureActive: true };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

    fireEvent.press(screen.getByTestId('passage-close'));

    expect(alert).toHaveBeenCalled();
    expect(screen.getByLabelText('Close the player')).toBeTruthy();
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
