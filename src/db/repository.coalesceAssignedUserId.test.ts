import { coalesceAssignedUserId } from './repository';

describe('coalesceAssignedUserId', () => {
  const known = new Set([10, 20]);

  it('keeps ids present in the local users set', () => {
    expect(coalesceAssignedUserId(10, known)).toBe(10);
  });

  it('nulls ids missing from the local users set', () => {
    expect(coalesceAssignedUserId(999, known)).toBeNull();
  });

  it('nulls null and undefined', () => {
    expect(coalesceAssignedUserId(null, known)).toBeNull();
    expect(coalesceAssignedUserId(undefined, known)).toBeNull();
  });
});
