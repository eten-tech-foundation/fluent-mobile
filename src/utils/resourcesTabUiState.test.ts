import {
  clearResourcesTabUiState,
  getResourcesTabUiState,
  resourcesUnitKey,
  setResourcesTabUiState,
} from './resourcesTabUiState';

describe('resourcesTabUiState', () => {
  beforeEach(() => {
    clearResourcesTabUiState();
  });

  it('builds a chapter:verse unit key', () => {
    expect(resourcesUnitKey(42, 7)).toBe('42:7');
  });

  it('returns default empty state for unseen units', () => {
    const state = getResourcesTabUiState(1, 1);
    expect(state.scrollOffset).toBe(0);
    expect(state.openAccordionIds.size).toBe(0);
  });

  it('persists and restores scroll and open accordion ids per unit', () => {
    setResourcesTabUiState(10, 2, {
      scrollOffset: 120,
      openAccordionIds: new Set(['translationNotes']),
    });

    const restored = getResourcesTabUiState(10, 2);
    expect(restored.scrollOffset).toBe(120);
    expect([...restored.openAccordionIds]).toEqual(['translationNotes']);

    const other = getResourcesTabUiState(10, 3);
    expect(other.scrollOffset).toBe(0);
    expect(other.openAccordionIds.size).toBe(0);
  });

  it('clones sets so callers cannot mutate stored state', () => {
    const open = new Set(['imagesMaps']);
    setResourcesTabUiState(1, 5, { scrollOffset: 0, openAccordionIds: open });
    open.add('translationNotes');

    expect([...getResourcesTabUiState(1, 5).openAccordionIds]).toEqual([
      'imagesMaps',
    ]);
  });
});
