import { deriveChapterSyncState } from './chapterSyncState';

describe('deriveChapterSyncState', () => {
  it('returns none when there are no recordings', () => {
    expect(deriveChapterSyncState(0, 0)).toBe('none');
  });

  it('returns deviceOnly when any recording is pending upload', () => {
    expect(deriveChapterSyncState(3, 1)).toBe('deviceOnly');
    expect(deriveChapterSyncState(1, 1)).toBe('deviceOnly');
  });

  it('returns synced when recordings exist and none are pending', () => {
    expect(deriveChapterSyncState(5, 0)).toBe('synced');
    expect(deriveChapterSyncState(1, 0)).toBe('synced');
  });
});
