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

  it('builds a chapter:unitKey key (#593)', () => {
    expect(resourcesUnitKey(42, 'verse:7')).toBe('42:verse:7');
    expect(resourcesUnitKey(42, 'pericope:1')).toBe('42:pericope:1');
  });

  it('returns default empty state for unseen units', () => {
    const state = getResourcesTabUiState(1, 'verse:1');
    expect(state.scrollOffset).toBe(0);
    expect(state.openAccordionIds.size).toBe(0);
  });

  it('persists and restores scroll and open accordion ids per unit', () => {
    setResourcesTabUiState(10, 'pericope:1', {
      scrollOffset: 120,
      openAccordionIds: new Set(['translationNotes']),
    });

    const restored = getResourcesTabUiState(10, 'pericope:1');
    expect(restored.scrollOffset).toBe(120);
    expect([...restored.openAccordionIds]).toEqual(['translationNotes']);

    const other = getResourcesTabUiState(10, 'verse:3');
    expect(other.scrollOffset).toBe(0);
    expect(other.openAccordionIds.size).toBe(0);
  });

  it('clones sets so callers cannot mutate stored state', () => {
    const open = new Set(['imagesMaps']);
    setResourcesTabUiState(1, 'verse:5', {
      scrollOffset: 0,
      openAccordionIds: open,
    });
    open.add('translationNotes');

    expect([...getResourcesTabUiState(1, 'verse:5').openAccordionIds]).toEqual([
      'imagesMaps',
    ]);
  });
});
