import { act, renderHook } from '@testing-library/react-native';
import type { RecordingWithOwner } from '../../../../types/db/types';
import { useTakeReview, type ReviewAudio } from './useTakeReview';

const mockFileExists = jest.fn(async (_path: string) => true);
const mockFileSize = jest.fn(async (_path: string) => 1000);
jest.mock('../../../../utils/audioStorage', () => ({
  fileExists: (path: string) => mockFileExists(path),
  fileSize: (path: string) => mockFileSize(path),
}));

const take = (over: Partial<RecordingWithOwner>): RecordingWithOwner => ({
  id: 'x',
  bibleTextId: 22,
  recordedByUserId: 7,
  projectUnitId: 3,
  localFilePath: 'file:///x.m4a',
  durationMs: 10000,
  takeNumber: 1,
  isSelected: false,
  isCanonical: false,
  syncStatus: 'uploaded',
  createdAt: '2026-10-19T10:00:00Z',
  updatedAt: '2026-10-19T10:00:00Z',
  granularity: 'pericope',
  startChapter: 14,
  startVerse: 22,
  endChapter: 14,
  endVerse: 25,
  ownerDisplayName: 'Me Drafter',
  ...over,
});

/** As getAllTakesForVerse orders them: by owner id, then take. */
const rows = [
  take({ id: 'mine-1', takeNumber: 1, isSelected: true }),
  take({
    id: 'theirs-1',
    recordedByUserId: 9,
    ownerDisplayName: 'Ruth Reader',
    takeNumber: 1,
    isCanonical: true,
    localFilePath: 'file:///t1.m4a',
    durationMs: 20000,
  }),
  take({
    id: 'theirs-2',
    recordedByUserId: 9,
    ownerDisplayName: 'Ruth Reader',
    takeNumber: 2,
    granularity: 'verse',
    startVerse: 23,
    endVerse: 23,
    localFilePath: 'file:///t2.m4a',
  }),
];

const audioMocks = {
  playTake: jest.fn(async () => {}),
  pausePlayback: jest.fn(async () => {}),
  seek: jest.fn(async () => {}),
  stopPlayback: jest.fn(async () => {}),
};

function makeAudio(over: Partial<ReviewAudio> = {}): ReviewAudio {
  return {
    allTakes: rows,
    hasMultipleRecorders: true,
    playingTakeId: null,
    loadedTakeId: null,
    state: 'recorded',
    playbackStatus: 'idle',
    positionMs: 0,
    durationMs: 0,
    scope: '7:5:pericope:passage',
    errorMessage: null,
    ...audioMocks,
    ...over,
  } as ReviewAudio;
}

type Props = { audio: ReviewAudio; userId: number | null; open: boolean };
function setup(initial: Partial<Props> = {}) {
  return renderHook((props: Props) => useTakeReview(props), {
    initialProps: {
      audio: initial.audio ?? makeAudio(),
      userId: initial.userId === undefined ? 7 : initial.userId,
      open: initial.open ?? true,
    },
  });
}
const find = (
  result: { current: ReturnType<typeof useTakeReview> },
  id: string,
) => result.current.owners.flatMap(o => o.takes).find(t => t.id === id)!;

describe('useTakeReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFileExists.mockImplementation(async () => true);
    mockFileSize.mockImplementation(async () => 1000);
  });

  it('groups every take by owner with its range and official state', () => {
    const { result } = setup();
    expect(result.current.available).toBe(true);
    expect(
      result.current.owners.map(o => ({
        name: o.name,
        takes: o.takes.map(t => [t.label, t.official, t.durationMs]),
      })),
    ).toEqual([
      {
        name: 'Me Drafter (you)',
        takes: [['Take 1 - Pericope - vv. 22-25', false, 10000]],
      },
      {
        name: 'Ruth Reader',
        takes: [
          ['Take 1 - Pericope - vv. 22-25', true, 20000],
          ['Take 2 - Verse - v. 23', false, 10000],
        ],
      },
    ]);
  });

  it("plays the tapped row, including another owner's take", async () => {
    const { result } = setup();
    await act(async () => find(result, 'theirs-2').onPlayPause());
    expect(audioMocks.playTake).toHaveBeenCalledWith(rows[2]);
  });

  it('pauses the row that is playing', async () => {
    const { result } = setup({
      audio: makeAudio({ playingTakeId: 'theirs-1', state: 'playing' }),
    });
    expect(find(result, 'theirs-1').playing).toBe(true);
    await act(async () => find(result, 'theirs-1').onPlayPause());
    expect(audioMocks.pausePlayback).toHaveBeenCalledTimes(1);
    expect(audioMocks.playTake).not.toHaveBeenCalled();
  });

  it('seeks the tapped row on a first scrub with nothing loaded', async () => {
    const { result } = setup();
    await act(async () => find(result, 'theirs-1').onSeek(0.5));
    expect(audioMocks.seek).toHaveBeenCalledWith(10000, rows[1]);
    expect(audioMocks.pausePlayback).not.toHaveBeenCalled();
  });

  it('pauses another take before seeking a different explicit row', async () => {
    const { result } = setup({
      audio: makeAudio({
        playingTakeId: 'mine-1',
        loadedTakeId: 'mine-1',
        state: 'playing',
        durationMs: 10000,
        positionMs: 4000,
      }),
    });
    await act(async () => find(result, 'theirs-1').onSeek(0.25));
    expect(audioMocks.pausePlayback).toHaveBeenCalledTimes(1);
    // Its own length, not the take still in the player.
    expect(audioMocks.seek).toHaveBeenCalledWith(5000, rows[1]);
  });

  it('moves only the row in the player, however the rows are ordered', () => {
    const audio = makeAudio({
      loadedTakeId: 'theirs-2',
      playbackStatus: 'paused',
      durationMs: 10000,
      positionMs: 2500,
    });
    const { result, rerender } = setup({ audio });
    expect(find(result, 'theirs-2').progress).toBe(0.25);
    expect(find(result, 'theirs-1').progress).toBe(0);

    rerender({
      audio: { ...audio, allTakes: [rows[2], rows[0], rows[1]] },
      userId: 7,
      open: true,
    });
    expect(find(result, 'theirs-2').progress).toBe(0.25);
    expect(find(result, 'mine-1').progress).toBe(0);
    expect(find(result, 'theirs-1').progress).toBe(0);
  });

  it('explains audio that is not on this phone, without playing', async () => {
    mockFileExists.mockImplementation(async path => path !== 'file:///t1.m4a');
    const { result } = setup();
    await act(async () => find(result, 'theirs-1').onPlayPause());
    expect(audioMocks.playTake).not.toHaveBeenCalled();
    expect(find(result, 'theirs-1').missing).toBe(true);
    expect(find(result, 'theirs-2').missing).toBe(false);

    await act(async () => find(result, 'theirs-2').onPlayPause());
    expect(audioMocks.playTake).toHaveBeenCalledWith(rows[2]);
  });

  it('treats an empty file as not on this phone', async () => {
    mockFileSize.mockImplementation(async () => 0);
    const { result } = setup();
    await act(async () => find(result, 'theirs-1').onSeek(0.5));
    expect(audioMocks.seek).not.toHaveBeenCalled();
    expect(find(result, 'theirs-1').missing).toBe(true);
  });

  it.each([
    ['closed', { open: false }],
    [
      'switched account',
      { audio: makeAudio({ scope: '8:5:pericope:passage' }) },
    ],
  ])(
    'drops a play that resolves after review was %s',
    async (_name, change) => {
      let resolve!: (v: boolean) => void;
      mockFileExists.mockReturnValueOnce(new Promise(r => (resolve = r)));
      const { result, rerender } = setup();
      act(() => find(result, 'theirs-1').onPlayPause());
      rerender({ audio: makeAudio(), userId: 7, open: true, ...change });
      await act(async () => resolve(true));
      expect(audioMocks.playTake).not.toHaveBeenCalled();
      expect(audioMocks.seek).not.toHaveBeenCalled();
    },
  );

  it('stops the take it played when review closes', async () => {
    const { result, rerender } = setup();
    await act(async () => find(result, 'theirs-1').onPlayPause());
    rerender({
      audio: makeAudio({ playingTakeId: 'theirs-1', state: 'playing' }),
      userId: 7,
      open: false,
    });
    expect(audioMocks.stopPlayback).toHaveBeenCalledTimes(1);
  });

  it('stops the take it played when the account or unit changes', async () => {
    const { result, rerender } = setup();
    await act(async () => find(result, 'theirs-1').onPlayPause());
    rerender({
      audio: makeAudio({ playingTakeId: 'theirs-1', state: 'playing' }),
      userId: 7,
      open: true,
    });
    expect(audioMocks.stopPlayback).not.toHaveBeenCalled();
    rerender({
      audio: makeAudio({
        playingTakeId: 'theirs-1',
        state: 'playing',
        scope: '8:5:pericope:passage',
      }),
      userId: 8,
      open: true,
    });
    expect(audioMocks.stopPlayback).toHaveBeenCalledTimes(1);
  });

  it('stops a take that is no longer one this account may see', async () => {
    const { result, rerender } = setup();
    await act(async () => find(result, 'theirs-1').onPlayPause());
    rerender({
      audio: makeAudio({
        playingTakeId: 'theirs-1',
        state: 'playing',
        allTakes: [rows[0]],
      }),
      userId: 7,
      open: true,
    });
    expect(audioMocks.stopPlayback).toHaveBeenCalledTimes(1);
    expect(result.current.owners.flatMap(o => o.takes.map(t => t.id))).toEqual([
      'mine-1',
    ]);
  });

  it("leaves a take it didn't start playing when it closes", () => {
    const { rerender } = setup({
      audio: makeAudio({ playingTakeId: 'mine-1', state: 'playing' }),
    });
    rerender({
      audio: makeAudio({ playingTakeId: 'mine-1', state: 'playing' }),
      userId: 7,
      open: false,
    });
    expect(audioMocks.stopPlayback).not.toHaveBeenCalled();
  });

  it('is not offered when only this account has takes here', () => {
    const { result } = setup({
      audio: makeAudio({ hasMultipleRecorders: false, allTakes: [rows[0]] }),
    });
    expect(result.current.available).toBe(false);
  });

  describe('a load still running', () => {
    function holdPlay() {
      let resolve!: () => void;
      audioMocks.playTake.mockReturnValueOnce(
        new Promise<void>(r => (resolve = r)),
      );
      return () => resolve();
    }

    it('is stopped when review closes, so it cannot start later', async () => {
      const release = holdPlay();
      const { result, rerender } = setup();
      await act(async () => {
        void find(result, 'theirs-1').onPlayPause();
      });
      expect(audioMocks.playTake).toHaveBeenCalledTimes(1);
      rerender({ audio: makeAudio(), userId: 7, open: false });
      expect(audioMocks.stopPlayback).toHaveBeenCalledTimes(1);
      await act(async () => release());
    });

    it('is stopped when the take is no longer one this account may see', async () => {
      const release = holdPlay();
      const { result, rerender } = setup();
      await act(async () => {
        void find(result, 'theirs-1').onPlayPause();
      });
      rerender({
        audio: makeAudio({ allTakes: [rows[0]] }),
        userId: 7,
        open: true,
      });
      expect(audioMocks.stopPlayback).toHaveBeenCalledTimes(1);
      await act(async () => release());
    });

    it('is stopped for a scrub too', async () => {
      let resolve!: () => void;
      audioMocks.seek.mockReturnValueOnce(
        new Promise<void>(r => (resolve = r)),
      );
      const { result, rerender } = setup();
      await act(async () => {
        void find(result, 'theirs-1').onSeek(0.5);
      });
      expect(audioMocks.seek).toHaveBeenCalledTimes(1);
      rerender({ audio: makeAudio(), userId: 7, open: false });
      expect(audioMocks.stopPlayback).toHaveBeenCalledTimes(1);
      await act(async () => resolve());
    });
  });

  it('leaves a fan take playing after a review take, when review closes', async () => {
    const { result, rerender } = setup();
    await act(async () => find(result, 'theirs-1').onPlayPause());
    // The fan's own Play took the player over.
    rerender({
      audio: makeAudio({
        playingTakeId: 'mine-1',
        loadedTakeId: 'mine-1',
        state: 'playing',
      }),
      userId: 7,
      open: true,
    });
    rerender({
      audio: makeAudio({
        playingTakeId: 'mine-1',
        loadedTakeId: 'mine-1',
        state: 'playing',
      }),
      userId: 7,
      open: false,
    });
    expect(audioMocks.stopPlayback).not.toHaveBeenCalled();
  });

  it('scrubs the row playing without pausing it', async () => {
    const { result } = setup({
      audio: makeAudio({
        playingTakeId: 'theirs-1',
        loadedTakeId: 'theirs-1',
        state: 'playing',
        durationMs: 20000,
      }),
    });
    await act(async () => find(result, 'theirs-1').onSeek(0.5));
    expect(audioMocks.pausePlayback).not.toHaveBeenCalled();
    expect(audioMocks.seek).toHaveBeenCalledWith(10000, rows[1]);
  });

  it('drops a scrub when review closes while another take pauses', async () => {
    let resolve!: () => void;
    audioMocks.pausePlayback.mockReturnValueOnce(
      new Promise<void>(r => (resolve = r)),
    );
    const playing = makeAudio({ playingTakeId: 'mine-1', state: 'playing' });
    const { result, rerender } = setup({ audio: playing });
    await act(async () => {
      void find(result, 'theirs-1').onSeek(0.5);
    });
    expect(audioMocks.pausePlayback).toHaveBeenCalledTimes(1);
    rerender({ audio: playing, userId: 7, open: false });
    await act(async () => resolve());
    expect(audioMocks.seek).not.toHaveBeenCalled();
  });

  it('checks a missing take again on Play, and forgets it on reopening', async () => {
    mockFileExists.mockImplementation(async () => false);
    const { result, rerender } = setup();
    await act(async () => find(result, 'theirs-1').onPlayPause());
    expect(find(result, 'theirs-1').missing).toBe(true);

    // The download landed.
    mockFileExists.mockImplementation(async () => true);
    await act(async () => find(result, 'theirs-1').onPlayPause());
    expect(find(result, 'theirs-1').missing).toBe(false);
    expect(audioMocks.playTake).toHaveBeenCalledTimes(1);

    mockFileExists.mockImplementation(async () => false);
    await act(async () => find(result, 'theirs-2').onPlayPause());
    expect(find(result, 'theirs-2').missing).toBe(true);
    rerender({ audio: makeAudio(), userId: 7, open: false });
    rerender({ audio: makeAudio(), userId: 7, open: true });
    expect(find(result, 'theirs-2').missing).toBe(false);
  });

  it('says when the player could not play the take', async () => {
    const { result, rerender } = setup();
    await act(async () => find(result, 'theirs-1').onPlayPause());
    rerender({
      audio: makeAudio({
        loadedTakeId: 'theirs-1',
        errorMessage: 'play failed',
      }),
      userId: 7,
      open: true,
    });
    expect(find(result, 'theirs-1').failed).toBe(true);
    expect(find(result, 'theirs-2').failed).toBe(false);

    await act(async () => find(result, 'theirs-1').onPlayPause());
    expect(find(result, 'theirs-1').failed).toBe(false);
  });

  it('drops a play for a take that lost access while its file was checked', async () => {
    let resolve!: (v: boolean) => void;
    mockFileExists.mockReturnValueOnce(new Promise(r => (resolve = r)));
    const { result, rerender } = setup();
    act(() => find(result, 'theirs-1').onPlayPause());
    rerender({
      audio: makeAudio({ allTakes: [rows[0]] }),
      userId: 7,
      open: true,
    });
    await act(async () => resolve(true));
    expect(audioMocks.playTake).not.toHaveBeenCalled();
  });

  it('drops a tap from before review was closed and opened again', async () => {
    let resolve!: (v: boolean) => void;
    mockFileExists.mockReturnValueOnce(new Promise(r => (resolve = r)));
    const { result, rerender } = setup();
    act(() => find(result, 'theirs-1').onPlayPause());
    rerender({ audio: makeAudio(), userId: 7, open: false });
    rerender({ audio: makeAudio(), userId: 7, open: true });
    await act(async () => resolve(true));
    expect(audioMocks.playTake).not.toHaveBeenCalled();
  });

  it("doesn't call a pause error a failed take", async () => {
    const { result, rerender } = setup();
    await act(async () => find(result, 'theirs-1').onPlayPause());
    // The fan's take is in the player now; its pause fails.
    rerender({
      audio: makeAudio({
        loadedTakeId: 'mine-1',
        errorMessage: 'pause failed',
      }),
      userId: 7,
      open: true,
    });
    expect(find(result, 'theirs-1').failed).toBe(false);
  });
});
