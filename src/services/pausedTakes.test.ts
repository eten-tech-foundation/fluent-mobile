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
import { kvStorage } from './storage';

jest.mock('../utils/audioStorage', () => ({
  deleteFile: jest.fn(async () => undefined),
}));

describe('pausedTakes (#170)', () => {
  beforeEach(() => {
    kvStorage.removeItemSync(PAUSED_TAKES_KV_KEY);
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
});
