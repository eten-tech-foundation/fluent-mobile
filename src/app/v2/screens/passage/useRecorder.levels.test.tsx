import { act, renderHook } from '@testing-library/react-native';
import { LIVE_LEVEL_BARS } from '../../../../hooks/useLiveLevels';
import { UNDO_MS } from '../../../../hooks/usePendingDelete';
import type { Ready } from './ready';
import { useRecorder } from './useRecorder';

type Take = {
  id: string;
  takeNumber: number;
  granularity: string;
  isSelected: boolean;
  durationMs: number;
  syncStatus: string;
  createdAt: string;
};

const mockSession = {
  state: 'idle',
  captureActive: false,
  takes: [] as Take[],
  deleteTake: jest.fn(async (_id: string) => undefined),
  db: 0,
  meter: null as null | (() => number),
};

jest.mock('../../../../hooks/useRecordSession', () => ({
  useRecordSession: () => ({
    verseAudio: {
      get state() {
        return mockSession.state;
      },
      get takes() {
        return mockSession.takes;
      },
      deleteTake: (id: string) => mockSession.deleteTake(id),
      getMetering: () =>
        mockSession.meter ? mockSession.meter() : mockSession.db,
      playingTakeId: null,
      positionMs: 0,
      durationMs: 0,
      stitchPositionMs: 0,
      selectedTake: mockSession.takes.find(t => t.isSelected) ?? null,
      allTakes: mockSession.takes,
      canRecordNewTake: true,
      pausePlayback: jest.fn(async () => undefined),
      discardCapture: jest.fn(async () => undefined),
      playTake: jest.fn(async () => undefined),
      playStitched: jest.fn(async () => undefined),
      seek: jest.fn(async () => undefined),
      seekStitched: jest.fn(async () => undefined),
      selectTake: jest.fn(async () => undefined),
      setCanonical: jest.fn(async () => undefined),
      pause: jest.fn(async () => undefined),
      resume: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
      start: jest.fn(async () => undefined),
    },
    effectiveUnit: 'pericope',
    elapsedMs: 1000,
    setElapsedMs: jest.fn(),
    get captureActive() {
      return mockSession.captureActive;
    },
    syncingMessage: null,
    isTaken: false,
    stageLocked: false,
    drafterCaptureBlocked: false,
    captureDisabled: false,
    pericopeUnavailable: false,
    activeRecordingUnit: null,
    ensureMic: jest.fn(async () => true),
    resetCapture: jest.fn(),
    captureBibleTextId: 1,
  }),
}));

jest.mock('../../../../db/queries', () => ({
  chapterHasUnuploadableSelectedTakes: jest.fn(async () => false),
}));

jest.mock('../../../../services/userOrgGrants', () => ({
  hasProjectObserverGrant: () => false,
}));

jest.mock('../../../../utils/myWorkDraftDownload', () => ({
  hasProjectTranslatorGrant: () => false,
}));

const passage = {
  status: 'ready',
  title: null,
  wholeChapter: true,
  reference: 'Jonah 2',
  verses: [
    { chapterNumber: 2, verseNumber: 1, text: 'From inside', recorded: null },
  ],
  downloaded: true,
  recordedStatus: 'none',
  takes: [],
  assignment: {
    id: 1,
    projectId: 1,
    bibleId: 1,
    bookId: 1,
    bookCode: 'JON',
    chapterNumber: 2,
    sourceLanguageCode: 'eng',
    assignedUserId: 7,
    peerCheckerId: null,
    hasConflict: false,
  },
  chapterVerseCount: 1,
  waitingToSend: false,
} as unknown as Ready;

function take(id: string, n: number): Take {
  return {
    id,
    takeNumber: n,
    granularity: 'pericope',
    isSelected: true,
    durationMs: 1000,
    syncStatus: 'pending',
    createdAt: '2026-11-13T00:00:00Z',
  };
}

describe('useRecorder take envelopes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSession.state = 'idle';
    mockSession.captureActive = false;
    mockSession.takes = [];
    mockSession.db = 0;
    mockSession.meter = null;
    mockSession.deleteTake.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function renderRecorder() {
    return renderHook(
      (props: { passage: Ready }) =>
        useRecorder({
          passage: props.passage,
          userId: 7,
          unit: 'pericope',
          showing: true,
          downloading: false,
          onReload: jest.fn(),
        }),
      { initialProps: { passage } },
    );
  }

  async function recordAndSave(id: string, n: number) {
    mockSession.state = 'recording';
    mockSession.captureActive = true;
    const { result, rerender } = renderRecorder();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => jest.advanceTimersByTime(300));
    mockSession.state = 'saving';
    mockSession.captureActive = false;
    rerender({ passage });
    mockSession.state = 'idle';
    mockSession.takes = [take(id, n)];
    rerender({ passage });
    return { result, rerender };
  }

  it('stores the envelope on the take that was just saved (#904)', async () => {
    const { result } = await recordAndSave('a', 1);
    expect(result.current.footer.take.label).toBe('Passage take 1');
    expect(result.current.footer.take.levels.length).toBeGreaterThan(0);
    expect(result.current.footer.take.levels.every(level => level === 1)).toBe(
      true,
    );
  });

  it('does not give a failed save its wave to a later take (#904)', async () => {
    mockSession.state = 'recording';
    mockSession.captureActive = true;
    const { result, rerender } = renderRecorder();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => jest.advanceTimersByTime(300));
    mockSession.state = 'saving';
    mockSession.captureActive = false;
    rerender({ passage });
    mockSession.state = 'paused';
    rerender({ passage });
    mockSession.state = 'idle';
    mockSession.takes = [take('other', 1)];
    rerender({ passage });

    expect(result.current.footer.take.levels).toEqual([]);
  });

  it('keeps the wave through Undo and drops it when the delete commits (#904)', async () => {
    const { result, rerender } = await recordAndSave('a', 1);
    const saved = result.current.footer.take.levels.slice();

    act(() => result.current.fan.onDelete?.('a'));
    expect(result.current.footer.take.levels).toEqual(saved);

    act(() => result.current.footer.take.onUndo?.());
    expect(result.current.footer.take.levels).toEqual(saved);
    expect(mockSession.deleteTake).not.toHaveBeenCalled();

    act(() => result.current.fan.onDelete?.('a'));
    await act(async () => {
      jest.advanceTimersByTime(UNDO_MS);
    });
    rerender({ passage });

    expect(mockSession.deleteTake).toHaveBeenCalledWith('a');
    expect(result.current.footer.take.levels).toEqual([]);
  });

  it('keeps the wave when the delete fails (#904)', async () => {
    const { result } = await recordAndSave('a', 1);
    const saved = result.current.footer.take.levels.slice();
    mockSession.deleteTake.mockRejectedValueOnce(new Error('db'));

    act(() => result.current.fan.onDelete?.('a'));
    await act(async () => {
      jest.advanceTimersByTime(UNDO_MS);
    });

    expect(mockSession.deleteTake).toHaveBeenCalledWith('a');
    expect(result.current.footer.take.levels).toEqual(saved);
  });

  it("keeps a pending delete's wave when its take leaves the list (#904)", async () => {
    const { result, rerender } = await recordAndSave('a', 1);
    const saved = result.current.footer.take.levels.slice();

    act(() => result.current.fan.onDelete?.('a'));
    mockSession.takes = [take('b', 1)];
    rerender({ passage });
    mockSession.takes = [take('a', 1)];
    rerender({ passage });

    expect(result.current.footer.take.levels).toEqual(saved);
    expect(mockSession.deleteTake).not.toHaveBeenCalled();
  });

  it('keeps a wave across a verse take-list change and drops it for a new chapter (#904)', async () => {
    const { result, rerender } = await recordAndSave('a', 1);
    const saved = result.current.footer.take.levels.slice();

    mockSession.takes = [take('b', 1)];
    rerender({ passage });
    mockSession.takes = [take('a', 1)];
    rerender({ passage });
    expect(result.current.footer.take.levels).toEqual(saved);

    rerender({
      passage: {
        ...passage,
        assignment: { ...passage.assignment, id: 99 },
      },
    });
    expect(result.current.footer.take.levels).toEqual([]);
  });

  it('shows the newest samples live and saves the whole take (#904)', async () => {
    let sample = 0;
    mockSession.meter = () => (sample++ === 0 ? 0 : -32);
    mockSession.state = 'recording';
    mockSession.captureActive = true;
    const { result, rerender } = renderRecorder();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => jest.advanceTimersByTime((LIVE_LEVEL_BARS + 10) * 100));

    expect(result.current.footer.take.levels).toHaveLength(LIVE_LEVEL_BARS);
    expect(result.current.footer.take.levels.includes(1)).toBe(false);

    mockSession.state = 'saving';
    mockSession.captureActive = false;
    rerender({ passage });
    mockSession.state = 'idle';
    mockSession.takes = [take('a', 1)];
    rerender({ passage });

    expect(Math.max(...result.current.footer.take.levels)).toBe(1);
  });
});
