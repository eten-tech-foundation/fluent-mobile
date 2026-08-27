import { deriveChapterOwnershipState } from './chapterOwnershipState';

describe('deriveChapterOwnershipState', () => {
  it('returns unassigned when there is no assigned user', () => {
    expect(deriveChapterOwnershipState(null, 42)).toBe('unassigned');
    expect(deriveChapterOwnershipState(undefined, 42)).toBe('unassigned');
  });

  it('returns mine when the assigned user matches the current user', () => {
    expect(deriveChapterOwnershipState(42, 42)).toBe('mine');
  });

  it('returns other when the assigned user does not match the current user', () => {
    expect(deriveChapterOwnershipState(42, 7)).toBe('other');
    expect(deriveChapterOwnershipState(42, null)).toBe('other');
  });
});
