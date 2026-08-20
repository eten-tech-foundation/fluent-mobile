import {
  getMockResourcesForUnit,
  unitHasAnyResources,
} from './mockResourceData';

describe('getMockResourcesForUnit', () => {
  it('returns empty sections for verses divisible by 3', () => {
    const resources = getMockResourcesForUnit(1, 3, 'Mark 14');
    expect(resources.sections).toEqual([]);
    expect(unitHasAnyResources(resources)).toBe(false);
    expect(resources.referenceLabel).toBe('Mark 14:3');
  });

  it('returns notes-only for verses with remainder 1', () => {
    const resources = getMockResourcesForUnit(1, 1, 'Mark 14');
    expect(resources.sections).toEqual(['translationNotes']);
    expect(unitHasAnyResources(resources)).toBe(true);
    expect(resources.passageTitle).toBeUndefined();
  });

  it('returns all three sections for verses with remainder 2', () => {
    const resources = getMockResourcesForUnit(1, 2, 'Mark 14');
    expect(resources.sections).toEqual([
      'translationNotes',
      'translationQuestions',
      'imagesMaps',
    ]);
  });
});
