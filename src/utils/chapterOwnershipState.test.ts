import {
  deriveChapterOwnershipState,
  resolveStageAssigneeId,
} from './chapterOwnershipState';

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

describe('resolveStageAssigneeId', () => {
  it('returns the drafter at Drafting (draft or not_started)', () => {
    expect(resolveStageAssigneeId('draft', 42, 99)).toBe(42);
    expect(resolveStageAssigneeId('not_started', 42, 99)).toBe(42);
  });

  it('returns null at Drafting when no drafter is assigned', () => {
    expect(resolveStageAssigneeId('not_started', null, 99)).toBeNull();
  });

  it('returns the PM-assigned peer checker at Peer Check', () => {
    expect(resolveStageAssigneeId('peer_check', 42, 99)).toBe(99);
  });

  it('returns null/undefined at Peer Check when open/unassigned (#442)', () => {
    expect(resolveStageAssigneeId('peer_check', 42, null)).toBeNull();
    expect(resolveStageAssigneeId('peer_check', 42, undefined)).toBeUndefined();
  });

  it('returns null for stages with no assignee concept', () => {
    expect(resolveStageAssigneeId('community_review', 42, 99)).toBeNull();
    expect(resolveStageAssigneeId('consultant_check', 42, 99)).toBeNull();
    expect(resolveStageAssigneeId('complete', 42, 99)).toBeNull();
  });

  it('returns null for unrecognized or null status', () => {
    expect(resolveStageAssigneeId('some_future_status', 42, 99)).toBeNull();
    expect(resolveStageAssigneeId(null, 42, 99)).toBeNull();
  });
});
