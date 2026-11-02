import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  type RenderResult,
} from '@testing-library/react-native';
import {
  ObserverDraftTab,
  type ObserverDraftTabProps,
  type ObserverDraftUnit,
} from './ObserverDraftTab';

const mockPlaybackPlay = jest.fn();
const mockPlaybackLoad = jest.fn();
const mockPlaybackResume = jest.fn();
const mockPlaybackStop = jest.fn();
const mockPlaybackPause = jest.fn();
const mockPlaybackSeek = jest.fn();

const playbackState = {
  status: 'idle' as 'idle' | 'playing' | 'paused',
  positionMs: 0,
  durationMs: 0,
};

type PlaybackStatus = 'idle' | 'playing' | 'paused';

jest.mock('../../hooks/usePlaybackEngine', () => {
  const ReactActual = require('react');

  return {
    usePlaybackEngine: () => {
      const [status, setStatus] = ReactActual.useState(
        'idle' as PlaybackStatus,
      );
      const mountedRef = ReactActual.useRef(true);

      ReactActual.useEffect(() => {
        mountedRef.current = true;
        playbackState.status = status;
        return () => {
          mountedRef.current = false;
        };
      }, [status]);

      const safeSetStatus = ReactActual.useCallback((next: PlaybackStatus) => {
        if (!mountedRef.current) {
          return;
        }
        setStatus((current: PlaybackStatus) =>
          current === next ? current : next,
        );
      }, []);

      const play = ReactActual.useCallback(
        async (...args: unknown[]) => {
          const result = await mockPlaybackPlay(...args);
          safeSetStatus('playing');
          return result;
        },
        [safeSetStatus],
      );
      const load = ReactActual.useCallback(async (...args: unknown[]) => {
        return mockPlaybackLoad(...args);
      }, []);
      const resume = ReactActual.useCallback(
        async (...args: unknown[]) => {
          const result = await mockPlaybackResume(...args);
          safeSetStatus('playing');
          return result;
        },
        [safeSetStatus],
      );
      // Status updates are synchronous so mount/scope `void stop()` effects do
      // not schedule setState on a later microtask outside `act`.
      const stop = ReactActual.useCallback(
        async (...args: unknown[]) => {
          safeSetStatus('idle');
          return mockPlaybackStop(...args);
        },
        [safeSetStatus],
      );
      const pause = ReactActual.useCallback(
        async (...args: unknown[]) => {
          safeSetStatus('paused');
          return mockPlaybackPause(...args);
        },
        [safeSetStatus],
      );
      const seek = ReactActual.useCallback(
        (...args: unknown[]) => mockPlaybackSeek(...args),
        [],
      );

      return {
        play,
        load,
        resume,
        stop,
        pause,
        seek,
        get status() {
          return status;
        },
        get positionMs() {
          return playbackState.positionMs;
        },
        get durationMs() {
          return playbackState.durationMs;
        },
      };
    },
  };
});

function unit(overrides: Partial<ObserverDraftUnit> = {}): ObserverDraftUnit {
  return {
    bibleTextId: 101,
    verseNumber: 3,
    draftText: 'In the beginning',
    activeTakeId: 55,
    localPlaybackUri: 'file:///canonical/55.m4a',
    conflictStatus: 'clean',
    ...overrides,
  };
}

function defaultProps(
  overrides: Partial<ObserverDraftTabProps> = {},
): ObserverDraftTabProps {
  return {
    units: [unit()],
    chapterNumber: 1,
    chapterAssignmentId: 1001,
    accountId: 7,
    hasAccess: true,
    isActive: true,
    unresolvedConflictPlaybackPolicy: 'allow',
    ...overrides,
  };
}

async function flushPlaybackEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderTab(
  overrides: Partial<ObserverDraftTabProps> = {},
): Promise<RenderResult> {
  const view = render(<ObserverDraftTab {...defaultProps(overrides)} />);
  await flushPlaybackEffects();
  return view;
}

async function rerenderTab(
  view: RenderResult,
  overrides: Partial<ObserverDraftTabProps>,
): Promise<void> {
  view.rerender(<ObserverDraftTab {...defaultProps(overrides)} />);
  await flushPlaybackEffects();
}

describe('ObserverDraftTab (#452 partial read-only)', () => {
  let view: RenderResult | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlaybackPlay.mockResolvedValue(undefined);
    mockPlaybackLoad.mockResolvedValue(undefined);
    mockPlaybackResume.mockResolvedValue(undefined);
    mockPlaybackStop.mockResolvedValue(undefined);
    mockPlaybackPause.mockResolvedValue(undefined);
    mockPlaybackSeek.mockResolvedValue(undefined);
    playbackState.status = 'idle';
    playbackState.positionMs = 0;
    playbackState.durationMs = 0;
    view = undefined;
  });

  afterEach(async () => {
    await act(async () => {
      view?.unmount();
    });
    await flushPlaybackEffects();
    view = undefined;
  });

  it('reuses usePlaybackEngine load+resume for the canonical unit URI', async () => {
    view = await renderTab();

    fireEvent.press(screen.getByTestId('record-play-button-55'));

    await waitFor(() => {
      expect(mockPlaybackLoad).toHaveBeenCalledTimes(1);
      expect(mockPlaybackResume).toHaveBeenCalledTimes(1);
    });
    expect(mockPlaybackLoad).toHaveBeenCalledWith('file:///canonical/55.m4a');
    expect(mockPlaybackResume).toHaveBeenCalledWith(
      undefined,
      'file:///canonical/55.m4a',
    );
    expect(mockPlaybackPlay).not.toHaveBeenCalled();
  });

  it('does not invent a take number in the DraftTakeRow label', async () => {
    view = await renderTab();

    expect(screen.getByText('Canonical draft - Verse - v. 3')).toBeTruthy();
    expect(screen.queryByText(/^Take \d+/)).toBeNull();
  });

  it('shows honest unavailable when localPlaybackUri is null', async () => {
    view = await renderTab({
      units: [unit({ localPlaybackUri: null })],
    });

    expect(
      screen.getByTestId('observer-draft-audio-unavailable-101'),
    ).toHaveTextContent('Audio unavailable');
    expect(screen.queryByTestId('record-play-button-55')).toBeNull();
  });

  it('shows honest unavailable when draft text is missing', async () => {
    view = await renderTab({
      units: [unit({ draftText: null })],
    });

    expect(
      screen.getByTestId('observer-draft-text-unavailable-101'),
    ).toHaveTextContent('Draft text unavailable');
    expect(screen.queryByTestId('observer-draft-text-101')).toBeNull();
  });

  it('shows honest unavailable when activeTakeId is missing', async () => {
    view = await renderTab({
      units: [unit({ activeTakeId: null })],
    });

    expect(
      screen.getByTestId('observer-draft-audio-unavailable-101'),
    ).toHaveTextContent('Audio unavailable');
    expect(screen.queryByTestId('record-play-button-55')).toBeNull();
  });

  it('treats null conflictStatus as not playable (fail closed)', async () => {
    view = await renderTab({
      units: [unit({ conflictStatus: null })],
    });

    expect(
      screen.getByTestId('observer-draft-audio-unavailable-101'),
    ).toHaveTextContent('Audio unavailable');
    expect(screen.queryByTestId('record-play-button-55')).toBeNull();
    expect(mockPlaybackLoad).not.toHaveBeenCalled();
    expect(mockPlaybackResume).not.toHaveBeenCalled();
  });

  it('omits select/delete editing controls on the take row', async () => {
    view = await renderTab();

    expect(screen.queryByTestId('record-take-select-55')).toBeNull();
    expect(screen.queryByTestId('record-delete-button-55')).toBeNull();
    expect(
      screen.getByTestId('record-take-canonical-readonly-55'),
    ).toBeTruthy();
  });

  it('stops playback when the tab is hidden', async () => {
    view = await renderTab();

    fireEvent.press(screen.getByTestId('record-play-button-55'));
    await waitFor(() => {
      expect(mockPlaybackResume).toHaveBeenCalled();
    });
    const stopsAfterPlay = mockPlaybackStop.mock.calls.length;

    await rerenderTab(view, { isActive: false });

    await waitFor(() => {
      expect(mockPlaybackStop.mock.calls.length).toBeGreaterThan(
        stopsAfterPlay,
      );
    });
  });

  it('stops playback on account change', async () => {
    view = await renderTab();

    fireEvent.press(screen.getByTestId('record-play-button-55'));
    await waitFor(() => {
      expect(mockPlaybackResume).toHaveBeenCalled();
    });
    const stopsAfterPlay = mockPlaybackStop.mock.calls.length;

    await rerenderTab(view, { accountId: 99 });

    await waitFor(() => {
      expect(mockPlaybackStop.mock.calls.length).toBeGreaterThan(
        stopsAfterPlay,
      );
    });
  });

  it('stops and clears selection when chapterAssignmentId changes at same chapterNumber', async () => {
    const onSelectUnit = jest.fn();
    view = await renderTab({ onSelectUnit });

    fireEvent.press(screen.getByTestId('observer-draft-verse-row-3'));
    expect(onSelectUnit).toHaveBeenCalledWith({
      bibleTextId: 101,
      verseNumber: 3,
      chapterNumber: 1,
      chapterAssignmentId: 1001,
    });
    expect(screen.getByLabelText(/selected/i)).toBeTruthy();

    fireEvent.press(screen.getByTestId('record-play-button-55'));
    await waitFor(() => {
      expect(mockPlaybackResume).toHaveBeenCalled();
    });
    const stopsAfterPlay = mockPlaybackStop.mock.calls.length;

    await rerenderTab(view, {
      chapterNumber: 1,
      chapterAssignmentId: 2002,
      onSelectUnit,
    });

    await waitFor(() => {
      expect(mockPlaybackStop.mock.calls.length).toBeGreaterThan(
        stopsAfterPlay,
      );
    });
    expect(screen.queryByLabelText(/selected/i)).toBeNull();
    expect(screen.queryByLabelText(/playing/i)).toBeNull();
  });

  it('hides all draft content when hasAccess is false', async () => {
    view = await renderTab();

    expect(screen.getByTestId('observer-draft-unit-101')).toBeTruthy();

    await rerenderTab(view, { hasAccess: false });

    expect(screen.getByTestId('observer-draft-access-denied')).toBeTruthy();
    expect(screen.queryByTestId('observer-draft-unit-101')).toBeNull();
    expect(screen.queryByTestId('record-play-button-55')).toBeNull();
    expect(screen.queryByTestId('observer-draft-verse-row-3')).toBeNull();
    expect(screen.queryByText('In the beginning')).toBeNull();
  });

  it('stops playback on access loss', async () => {
    view = await renderTab();

    fireEvent.press(screen.getByTestId('record-play-button-55'));
    await waitFor(() => {
      expect(mockPlaybackResume).toHaveBeenCalled();
    });
    const stopsAfterPlay = mockPlaybackStop.mock.calls.length;

    await rerenderTab(view, { hasAccess: false });

    await waitFor(() => {
      expect(mockPlaybackStop.mock.calls.length).toBeGreaterThan(
        stopsAfterPlay,
      );
    });
  });

  it('stops when canonical URI is replaced while playing', async () => {
    view = await renderTab();

    fireEvent.press(screen.getByTestId('record-play-button-55'));
    await waitFor(() => {
      expect(mockPlaybackResume).toHaveBeenCalled();
    });
    const stopsAfterPlay = mockPlaybackStop.mock.calls.length;

    await rerenderTab(view, {
      units: [unit({ localPlaybackUri: 'file:///canonical/55-v2.m4a' })],
    });

    await waitFor(() => {
      expect(mockPlaybackStop.mock.calls.length).toBeGreaterThan(
        stopsAfterPlay,
      );
    });
  });

  it('stops when explicit conflict policy changes while playing', async () => {
    view = await renderTab({
      units: [unit({ conflictStatus: 'conflict' })],
      unresolvedConflictPlaybackPolicy: 'allow',
    });

    fireEvent.press(screen.getByTestId('record-play-button-55'));
    await waitFor(() => {
      expect(mockPlaybackResume).toHaveBeenCalled();
    });
    const stopsAfterPlay = mockPlaybackStop.mock.calls.length;

    await rerenderTab(view, {
      units: [unit({ conflictStatus: 'conflict' })],
      unresolvedConflictPlaybackPolicy: 'block',
    });

    await waitFor(() => {
      expect(mockPlaybackStop.mock.calls.length).toBeGreaterThan(
        stopsAfterPlay,
      );
    });
    expect(screen.queryByTestId('record-play-button-55')).toBeNull();
  });

  it('ignores stale load/resume completions after a scope change (UI state only)', async () => {
    // Mock hook state only — engine stop-cancellation is covered in
    // createPlaybackEngine.test.ts (pending play/resume generation bump).
    let resolveLoad: (() => void) | undefined;
    mockPlaybackLoad.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveLoad = resolve;
        }),
    );

    view = await renderTab();
    fireEvent.press(screen.getByTestId('record-play-button-55'));

    await waitFor(() => {
      expect(mockPlaybackLoad).toHaveBeenCalled();
    });

    await rerenderTab(view, { chapterAssignmentId: 2002 });

    await act(async () => {
      resolveLoad?.();
      await Promise.resolve();
    });

    expect(mockPlaybackResume).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/playing/i)).toBeNull();
  });

  it('deferred load after scope change never resumes', async () => {
    let resolveLoad: (() => void) | undefined;
    mockPlaybackLoad.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveLoad = resolve;
        }),
    );

    view = await renderTab();
    fireEvent.press(screen.getByTestId('record-play-button-55'));
    await waitFor(() => {
      expect(mockPlaybackLoad).toHaveBeenCalledTimes(1);
    });

    await rerenderTab(view, { hasAccess: false });

    await act(async () => {
      resolveLoad?.();
      await Promise.resolve();
    });

    expect(mockPlaybackResume).not.toHaveBeenCalled();
    expect(screen.queryByTestId('record-play-button-55')).toBeNull();
  });

  it('deferred load after canonical URI replacement never resumes old URI', async () => {
    let resolveLoad: (() => void) | undefined;
    mockPlaybackLoad.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveLoad = resolve;
        }),
    );

    view = await renderTab();
    fireEvent.press(screen.getByTestId('record-play-button-55'));
    await waitFor(() => {
      expect(mockPlaybackLoad).toHaveBeenCalledTimes(1);
      expect(mockPlaybackLoad).toHaveBeenCalledWith('file:///canonical/55.m4a');
    });

    // Pending load: playing/loaded ids still null — identity effect must still clear.
    await rerenderTab(view, {
      units: [unit({ localPlaybackUri: 'file:///canonical/55-v2.m4a' })],
    });

    await act(async () => {
      resolveLoad?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPlaybackResume).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/playing/i)).toBeNull();
  });

  it('deferred load after conflict policy change never resumes', async () => {
    let resolveLoad: (() => void) | undefined;
    mockPlaybackLoad.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveLoad = resolve;
        }),
    );

    view = await renderTab({
      units: [unit({ conflictStatus: 'conflict' })],
      unresolvedConflictPlaybackPolicy: 'allow',
    });
    fireEvent.press(screen.getByTestId('record-play-button-55'));
    await waitFor(() => {
      expect(mockPlaybackLoad).toHaveBeenCalledTimes(1);
    });

    await rerenderTab(view, {
      units: [unit({ conflictStatus: 'conflict' })],
      unresolvedConflictPlaybackPolicy: 'undecided',
    });

    await act(async () => {
      resolveLoad?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPlaybackResume).not.toHaveBeenCalled();
    expect(screen.queryByTestId('record-play-button-55')).toBeNull();
    expect(
      screen.getByTestId('observer-draft-audio-unavailable-101'),
    ).toHaveTextContent('Audio unavailable');
  });

  it('exposes verse-anchor selection with chapterAssignmentId (no invented fields)', async () => {
    const onSelectUnit = jest.fn();
    view = await renderTab({ onSelectUnit });

    fireEvent.press(screen.getByTestId('observer-draft-verse-row-3'));

    expect(onSelectUnit).toHaveBeenCalledWith({
      bibleTextId: 101,
      verseNumber: 3,
      chapterNumber: 1,
      chapterAssignmentId: 1001,
    });
  });

  describe('unresolved conflict playback policy (explicit; not conflict AC)', () => {
    const conflictUnit = unit({ conflictStatus: 'conflict' });

    it('allow plays conflict canonical audio when URI + activeTakeId exist', async () => {
      view = await renderTab({
        units: [conflictUnit],
        unresolvedConflictPlaybackPolicy: 'allow',
      });

      fireEvent.press(screen.getByTestId('record-play-button-55'));
      await waitFor(() => {
        expect(mockPlaybackLoad).toHaveBeenCalledWith(
          'file:///canonical/55.m4a',
        );
        expect(mockPlaybackResume).toHaveBeenCalledWith(
          undefined,
          'file:///canonical/55.m4a',
        );
      });
    });

    it('block shows neutral unavailable and does not play', async () => {
      view = await renderTab({
        units: [conflictUnit],
        unresolvedConflictPlaybackPolicy: 'block',
      });

      expect(
        screen.getByTestId('observer-draft-audio-unavailable-101'),
      ).toHaveTextContent('Audio unavailable');
      expect(screen.queryByTestId('record-play-button-55')).toBeNull();
      expect(mockPlaybackLoad).not.toHaveBeenCalled();
      expect(mockPlaybackResume).not.toHaveBeenCalled();
    });

    it('undecided shows neutral unavailable and does not auto-play', async () => {
      view = await renderTab({
        units: [conflictUnit],
        unresolvedConflictPlaybackPolicy: 'undecided',
      });

      expect(
        screen.getByTestId('observer-draft-audio-unavailable-101'),
      ).toHaveTextContent('Audio unavailable');
      expect(screen.queryByTestId('record-play-button-55')).toBeNull();
      expect(mockPlaybackLoad).not.toHaveBeenCalled();
      expect(mockPlaybackResume).not.toHaveBeenCalled();
      expect(screen.queryByText(/conflict/i)).toBeNull();
    });
  });
});
