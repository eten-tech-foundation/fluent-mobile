import { deriveProjectSyncState } from './projectSyncState';

describe('deriveProjectSyncState', () => {
  it('returns none when there are no recordings and no pending stage', () => {
    expect(deriveProjectSyncState(0, 0)).toBe('none');
  });

  it('returns unsynced when any recording is pending upload', () => {
    expect(deriveProjectSyncState(3, 1)).toBe('unsynced');
    expect(deriveProjectSyncState(1, 1)).toBe('unsynced');
  });

  it('returns unsynced when a stage advance is queued', () => {
    expect(deriveProjectSyncState(2, 0, 1)).toBe('unsynced');
    expect(deriveProjectSyncState(0, 0, 1)).toBe('unsynced');
  });

  it('returns synced when recordings exist and nothing is pending', () => {
    expect(deriveProjectSyncState(5, 0)).toBe('synced');
    expect(deriveProjectSyncState(1, 0, 0)).toBe('synced');
  });
});
