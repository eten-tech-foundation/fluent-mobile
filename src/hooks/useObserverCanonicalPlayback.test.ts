import { act, renderHook } from '@testing-library/react-native';
import {
  canPlayCanonicalAudio,
  canonicalAudioAvailability,
  useObserverCanonicalPlayback,
  type ObserverCanonicalPlaybackScope,
} from './useObserverCanonicalPlayback';
import type { ObserverDraftUnit } from '../types/draftDownload/types';

const mockLoad = jest.fn(async (_uri: string) => undefined);
const mockResume = jest.fn(async (..._args: unknown[]) => undefined);
const mockStop = jest.fn(async () => undefined);
const mockPause = jest.fn(async () => undefined);
const mockSeek = jest.fn(async (_ms: number) => undefined);

jest.mock('./usePlaybackEngine', () => {
  const ReactActual = require('react');
  return {
    usePlaybackEngine: () => {
      const [status, setStatus] = ReactActual.useState('idle');
      const load = ReactActual.useCallback((uri: string) => mockLoad(uri), []);
      const resume = ReactActual.useCallback(async (...args: unknown[]) => {
        await mockResume(...args);
        setStatus('playing');
      }, []);
      const stop = ReactActual.useCallback(() => mockStop(), []);
      const pause = ReactActual.useCallback(() => mockPause(), []);
      const seek = ReactActual.useCallback((ms: number) => mockSeek(ms), []);
      return {
        load,
        resume,
        stop,
        pause,
        seek,
        play: jest.fn(),
        status,
        positionMs: 0,
        durationMs: 0,
      };
    },
  };
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<undefined>(r => {
    resolve = () => r(undefined);
  });
  return { promise, resolve };
}

function unit(overrides: Partial<ObserverDraftUnit> = {}): ObserverDraftUnit {
  return {
    bibleTextId: 501,
    verseNumber: 1,
    draftText: 'Target draft',
    activeTakeId: 55,
    localPlaybackUri: 'file:///canonical/55.m4a',
    conflictStatus: 'clean',
    ...overrides,
  };
}

describe('canonicalAudioAvailability', () => {
  it('plays clean and resolved takes with local media', () => {
    expect(canonicalAudioAvailability(unit(), 'undecided')).toBe('playable');
    expect(
      canonicalAudioAvailability(unit({ conflictStatus: 'resolved' }), 'block'),
    ).toBe('playable');
  });

  it('fails closed on an unknown conflict status under every policy', () => {
    for (const policy of ['allow', 'block', 'undecided'] as const) {
      expect(
        canonicalAudioAvailability(unit({ conflictStatus: null }), policy),
      ).toBe('unknownStatus');
    }
  });

  it('keeps conflict audio unplayable unless the policy is allow', () => {
    const conflict = unit({ conflictStatus: 'conflict' });
    expect(canonicalAudioAvailability(conflict, 'block')).toBe(
      'conflictBlocked',
    );
    expect(canonicalAudioAvailability(conflict, 'undecided')).toBe(
      'conflictUndecided',
    );
    expect(canPlayCanonicalAudio(conflict, 'allow')).toBe(true);
  });

  it('names a missing take or missing media', () => {
    expect(
      canonicalAudioAvailability(unit({ activeTakeId: null }), 'undecided'),
    ).toBe('noTake');
    expect(
      canonicalAudioAvailability(unit({ localPlaybackUri: '' }), 'undecided'),
    ).toBe('notDownloaded');
  });
});

describe('useObserverCanonicalPlayback', () => {
  const first = unit();
  const second = unit({
    bibleTextId: 502,
    verseNumber: 2,
    activeTakeId: 56,
    localPlaybackUri: 'file:///canonical/56.m4a',
  });

  function scope(
    overrides: Partial<ObserverCanonicalPlaybackScope> = {},
  ): ObserverCanonicalPlaybackScope {
    return {
      units: [first, second],
      chapterAssignmentId: 1001,
      accountId: '7',
      hasAccess: true,
      isActive: true,
      unresolvedConflictPlaybackPolicy: 'undecided',
      ...overrides,
    };
  }

  async function mount() {
    const view = renderHook(
      (props: ObserverCanonicalPlaybackScope) =>
        useObserverCanonicalPlayback(props),
      { initialProps: scope() },
    );
    // Let the mount-time stop barrier settle before counting stops.
    await act(async () => {});
    mockStop.mockClear();
    return view;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('drops a load that resolves after the account changed and stops', async () => {
    const view = await mount();
    const pending = deferred();
    mockLoad.mockReturnValueOnce(pending.promise);

    let play!: Promise<void>;
    act(() => {
      play = view.result.current.playPause(first);
    });
    view.rerender(scope({ accountId: '8' }));
    await act(async () => {
      pending.resolve();
      await play;
    });

    expect(mockResume).not.toHaveBeenCalled();
    expect(mockStop).toHaveBeenCalled();
    expect(view.result.current.playingBibleTextId).toBeNull();
  });

  it('stops when the playing take changes identity', async () => {
    const view = await mount();
    await act(async () => {
      await view.result.current.playPause(first);
    });
    expect(view.result.current.playingBibleTextId).toBe(501);
    mockStop.mockClear();

    view.rerender(
      scope({
        units: [{ ...first, localPlaybackUri: 'file:///canonical/99.m4a' }],
      }),
    );
    await act(async () => {});

    expect(mockStop).toHaveBeenCalled();
    expect(view.result.current.playingBibleTextId).toBeNull();
  });

  it('skips a queued stop once a newer play has claimed the player', async () => {
    const view = await mount();
    const pending = deferred();
    mockLoad.mockReturnValueOnce(pending.promise);

    let firstPlay!: Promise<void>;
    act(() => {
      firstPlay = view.result.current.playPause(first);
    });
    // Identity change queues a stop barrier behind the held load.
    view.rerender(
      scope({
        units: [{ ...first, activeTakeId: 99 }, second],
      }),
    );
    let secondPlay!: Promise<void>;
    act(() => {
      secondPlay = view.result.current.playPause(second);
    });
    await act(async () => {
      pending.resolve();
      await firstPlay;
      await secondPlay;
    });

    expect(mockStop).not.toHaveBeenCalled();
    expect(mockLoad).toHaveBeenLastCalledWith('file:///canonical/56.m4a');
    expect(view.result.current.playingBibleTextId).toBe(502);
  });

  it('lets only the latest tap on the same take resume', async () => {
    const view = await mount();
    const pending = deferred();
    mockLoad.mockReturnValueOnce(pending.promise);

    let firstTap!: Promise<void>;
    let secondTap!: Promise<void>;
    act(() => {
      firstTap = view.result.current.playPause(first);
    });
    act(() => {
      secondTap = view.result.current.playPause(first);
    });
    await act(async () => {
      pending.resolve();
      await firstTap;
      await secondTap;
    });

    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  it('seeks only the loaded take', async () => {
    const view = await mount();
    await act(async () => {
      await view.result.current.playPause(first);
    });

    act(() => view.result.current.seekUnit(second, 4000));
    expect(mockSeek).not.toHaveBeenCalled();
    act(() => view.result.current.seekUnit(first, 4000));
    expect(mockSeek).toHaveBeenCalledWith(4000);
  });
});
