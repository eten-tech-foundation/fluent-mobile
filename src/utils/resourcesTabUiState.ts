export interface ResourcesTabUiState {
  scrollOffset: number;
  openAccordionIds: Set<string>;
}

const DEFAULT_STATE: ResourcesTabUiState = {
  scrollOffset: 0,
  openAccordionIds: new Set(),
};

const stateByUnit = new Map<string, ResourcesTabUiState>();

/**
 * Persist accordion/scroll per drafting unit (#593).
 * Prefer BibleUnit.key (`verse:3`, `pericope:…`) so pericope mode does not
 * share state with the anchor verse alone.
 */
export function resourcesUnitKey(chapterId: number, unitKey: string): string {
  return `${chapterId}:${unitKey}`;
}

function cloneState(state: ResourcesTabUiState): ResourcesTabUiState {
  return {
    scrollOffset: state.scrollOffset,
    openAccordionIds: new Set(state.openAccordionIds),
  };
}

export function getResourcesTabUiState(
  chapterId: number,
  unitKey: string,
): ResourcesTabUiState {
  const existing = stateByUnit.get(resourcesUnitKey(chapterId, unitKey));
  return existing ? cloneState(existing) : cloneState(DEFAULT_STATE);
}

export function setResourcesTabUiState(
  chapterId: number,
  unitKey: string,
  state: ResourcesTabUiState,
): void {
  stateByUnit.set(resourcesUnitKey(chapterId, unitKey), cloneState(state));
}

/** Test helper — clears in-memory UI state between cases. */
export function clearResourcesTabUiState(): void {
  stateByUnit.clear();
}
