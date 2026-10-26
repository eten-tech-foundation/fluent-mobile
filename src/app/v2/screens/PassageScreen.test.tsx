import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import PassageScreen from './PassageScreen';
import type { Passage, PassageDownload } from '../../../hooks/usePassage';
import { UNDO_MS } from '../../../hooks/usePendingDelete';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDownload = jest.fn();
const mockStart = jest.fn(async () => {});
const mockStop = jest.fn(async () => {});
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
let mockSession = {
  state: 'idle' as string,
  captureActive: false,
  isTaken: false,
  stageLocked: false,
  captureDisabled: false,
  canRecordNewTake: true,
  pericopeUnavailable: false,
  takes: [] as MockTake[],
};
const take = (n: number): MockTake => ({
  id: `t${n}`,
  takeNumber: n,
  granularity: 'pericope',
  isSelected: false,
  durationMs: 10000,
});
let mockPassage: Passage = { status: 'loading' };
let mockDownloadState: PassageDownload = 'idle';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({
    chapterId: '5',
    anchorVerse: '22',
    projectUnitId: '3',
    chapterName: 'Mark 14',
    projectName: 'Mark Telugu',
    language: 'Telugu',
  }),
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
      resume: jest.fn(),
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
  return {
    Gesture: { Pan: () => pan, Tap: () => pan, Race: () => pan },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
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

describe('PassageScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = {
      state: 'idle',
      captureActive: false,
      isTaken: false,
      stageLocked: false,
      captureDisabled: false,
      canRecordNewTake: true,
      pericopeUnavailable: false,
      takes: [],
    };
    mockPassage = ready;
    mockDownloadState = 'idle';
  });

  it('puts the script, its actions and takes in the hero, then the steps', () => {
    render(<PassageScreen />);

    expect(
      screen.getByRole('header', { name: 'The Last Supper' }),
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
    fireEvent.press(screen.getByTestId('passage-download'));

    expect(mockDownload).toHaveBeenCalled();
    expect(screen.queryByTestId('passage-script', hidden)).toBeNull();
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

  it('shows the take in progress and stops it from the same key', async () => {
    mockSession = { ...mockSession, state: 'recording', captureActive: true };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

    expect(screen.getByLabelText('Take 1, recording, 0:13')).toBeTruthy();
    expect(screen.getByLabelText('Take 1, recording')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Stop recording'));
    });
    expect(mockStop).toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
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

  it('offers Resume and Save for a take recovered after a crash', () => {
    mockSession = { ...mockSession, state: 'paused', captureActive: true };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-listen'));

    expect(screen.getByLabelText('Resume take')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Stop and save take'));
    expect(mockStop).toHaveBeenCalled();
    expect(
      screen.getByText(
        'An unfinished take was recovered. Resume it, or stop to save it.',
      ),
    ).toBeTruthy();
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

  it('only plays other takes on a stage-locked chapter, without changing the pick', () => {
    const takes = [take(1), { ...take(2), isSelected: true }];
    mockSession = { ...mockSession, takes };
    const { unmount } = render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));
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

  it('asks before closing the player on a take in progress', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSession = { ...mockSession, state: 'recording', captureActive: true };
    render(<PassageScreen />);
    fireEvent.press(screen.getByTestId('passage-record'));

    fireEvent.press(screen.getByTestId('passage-close'));

    expect(alert).toHaveBeenCalled();
    expect(screen.getByLabelText('Close the player')).toBeTruthy();
  });
});
