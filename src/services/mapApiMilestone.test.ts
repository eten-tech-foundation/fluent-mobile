import { mapApiMilestone } from './mapApiMilestone';

describe('mapApiMilestone', () => {
  it('keeps unit id, parent project id, and display name', () => {
    expect(
      mapApiMilestone({
        id: 12,
        name: 'Mark',
        projectId: 3,
        projectName: 'Baka NT',
        milestoneCount: 2,
      }),
    ).toEqual({
      id: 12,
      projectId: 3,
      name: 'Mark',
    });
  });
});
