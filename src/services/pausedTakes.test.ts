const mockKv = new Map<string, string>();

jest.mock('./storage', () => ({
  kvStorage: {
    getItemSync: (key: string) => mockKv.get(key) ?? null,
    setItemSync: (key: string, value: string) => {
      mockKv.set(key, value);
    },
    removeItemSync: (key: string) => {
      mockKv.delete(key);
    },
  },
}));

jest.mock('../utils/audioStorage', () => ({
  deleteFile: jest.fn(async () => undefined),
}));

import { deleteFile } from '../utils/audioStorage';

import {
  clearAllPausedTakes,
  clearOrphanedPausedTakes,
  clearPausedTake,
  isPausedTakeOrphaned,
  listPausedTakes,
  PAUSED_TAKES_KV_KEY,
  upsertPausedTake,
  type PausedTakeMarker,
} from './pausedTakes';

describe('pausedTakes (#170)', () => {
  beforeEach(() => {
    mockKv.clear();
    jest.mocked(deleteFile).mockReset();
    jest.mocked(deleteFile).mockResolvedValue(undefined);
  });

  it('detects orphaned markers without verse/chapter', () => {
    const orphan: PausedTakeMarker = {
      sessionKey: 'x',
      segments: ['file:///a.aac'],
      elapsedMs: 1000,
      startedAt: new Date().toISOString(),
    };
    expect(isPausedTakeOrphaned(orphan)).toBe(true);
  });

  it('clears orphaned markers and keeps resolvable ones', async () => {
    upsertPausedTake({
      sessionKey: 'orphan',
      segments: ['file:///o.aac'],
      elapsedMs: 1,
      startedAt: 't0',
    });
    upsertPausedTake({
      sessionKey: 'ok',
      segments: ['file:///ok.aac'],
      elapsedMs: 2,
      startedAt: 't1',
      chapterAssignmentId: 9,
      verseNumber: 3,
    });

    const removed = await clearOrphanedPausedTakes();
    expect(removed).toBe(1);
    expect(listPausedTakes().map(m => m.sessionKey)).toEqual(['ok']);
    expect(mockKv.get(PAUSED_TAKES_KV_KEY)).toContain('ok');
  });

  it('clearAllPausedTakes empties storage', async () => {
    upsertPausedTake({
      sessionKey: 'a',
      segments: [],
      elapsedMs: 0,
      startedAt: 't',
      chapterAssignmentId: 1,
      verseNumber: 1,
    });
    await clearAllPausedTakes();
    expect(listPausedTakes()).toEqual([]);
  });

  it('clearPausedTake removes one session', () => {
    upsertPausedTake({
      sessionKey: 'a',
      segments: [],
      elapsedMs: 0,
      startedAt: 't',
      chapterAssignmentId: 1,
      verseNumber: 1,
    });
    clearPausedTake('a');
    expect(listPausedTakes()).toEqual([]);
  });

  it.each([
    'new session',
    'updated kept session',
    'replaced orphan session',
  ] as const)(
    'preserves a %s written while orphan file cleanup is pending',
    async change => {
      const orphan: PausedTakeMarker = {
        sessionKey: 'orphan',
        segments: ['file:///orphan-old.aac'],
        elapsedMs: 1000,
        startedAt: 'old',
      };
      const kept: PausedTakeMarker = {
        sessionKey: 'kept',
        segments: ['file:///kept-old.aac'],
        elapsedMs: 2000,
        startedAt: 'kept',
        chapterAssignmentId: 7,
        verseNumber: 3,
      };
      upsertPausedTake(orphan);
      upsertPausedTake(kept);
      let finishDeletion!: () => void;
      jest.mocked(deleteFile).mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            finishDeletion = resolve;
          }),
      );

      const cleanup = clearOrphanedPausedTakes();
      expect(deleteFile).toHaveBeenCalledWith('file:///orphan-old.aac');
      const current: PausedTakeMarker = {
        sessionKey:
          change === 'new session'
            ? 'new'
            : change === 'updated kept session'
            ? 'kept'
            : 'orphan',
        segments: ['file:///current.aac'],
        elapsedMs: 3500,
        startedAt: 'current',
        chapterAssignmentId: 7,
        verseNumber: 4,
        capture: {
          bibleTextId: 44,
          granularity: 'verse',
          startChapter: 1,
          startVerse: 4,
          endChapter: 1,
          endVerse: 4,
        },
      };
      // Real JSON marker persistence changes while asynchronous file deletion is blocked.
      upsertPausedTake(current);
      finishDeletion();
      await expect(cleanup).resolves.toBe(1);

      expect(listPausedTakes()).toEqual(
        change === 'updated kept session' ? [current] : [kept, current],
      );
      expect(JSON.parse(mockKv.get(PAUSED_TAKES_KV_KEY)!)).toEqual(
        listPausedTakes(),
      );
      expect(deleteFile).toHaveBeenCalledTimes(1);
      expect(deleteFile).not.toHaveBeenCalledWith('file:///current.aac');
    },
  );
});
