export interface ResourcesTabUiState {
  scrollOffset: number;
  openAccordionIds: Set<string>;
}

const DEFAULT_STATE: ResourcesTabUiState = {
  scrollOffset: 0,
  openAccordionIds: new Set(),
};

const stateByUnit = new Map<string, ResourcesTabUiState>();

export function resourcesUnitKey(
  chapterId: number,
  verseNumber: number,
): string {
  return `${chapterId}:${verseNumber}`;
}

function cloneState(state: ResourcesTabUiState): ResourcesTabUiState {
  return {
    scrollOffset: state.scrollOffset,
    openAccordionIds: new Set(state.openAccordionIds),
  };
}

export function getResourcesTabUiState(
  chapterId: number,
  verseNumber: number,
): ResourcesTabUiState {
  const existing = stateByUnit.get(resourcesUnitKey(chapterId, verseNumber));
  return existing ? cloneState(existing) : cloneState(DEFAULT_STATE);
}

export function setResourcesTabUiState(
  chapterId: number,
  verseNumber: number,
  state: ResourcesTabUiState,
): void {
  stateByUnit.set(resourcesUnitKey(chapterId, verseNumber), cloneState(state));
}

/** Test helper — clears in-memory UI state between cases. */
export function clearResourcesTabUiState(): void {
  stateByUnit.clear();
}
