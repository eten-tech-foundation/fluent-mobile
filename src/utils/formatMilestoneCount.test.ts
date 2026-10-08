import { formatMilestoneCount } from './formatMilestoneCount';

describe('formatMilestoneCount', () => {
  it('uses the singular label for one milestone', () => {
    expect(formatMilestoneCount(1)).toBe('1 milestone');
  });

  it('uses the plural label for zero and many milestones', () => {
    expect(formatMilestoneCount(0)).toBe('0 milestones');
    expect(formatMilestoneCount(3)).toBe('3 milestones');
  });
});
