import { deriveChapterSyncState } from './chapterSyncState';

describe('deriveChapterSyncState', () => {
  it('returns none when there are no recordings and no pending stage', () => {
    expect(deriveChapterSyncState(0, 0)).toBe('none');
    expect(deriveChapterSyncState(0, 0, 0)).toBe('none');
  });

  it('returns deviceOnly when any recording is pending upload', () => {
    expect(deriveChapterSyncState(3, 1)).toBe('deviceOnly');
    expect(deriveChapterSyncState(1, 1)).toBe('deviceOnly');
  });

  it('returns deviceOnly when a stage advance is queued', () => {
    expect(deriveChapterSyncState(2, 0, 1)).toBe('deviceOnly');
    expect(deriveChapterSyncState(0, 0, 1)).toBe('deviceOnly');
  });

  it('returns synced when recordings exist and nothing is pending', () => {
    expect(deriveChapterSyncState(5, 0)).toBe('synced');
    expect(deriveChapterSyncState(1, 0, 0)).toBe('synced');
  });
});
