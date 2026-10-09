const activeOwners = new Set<string>();

/**
 * Marks a take active (recording or paused) for one owner: the recording
 * engine, or the gallery's simulation. Feedback such as haptics stays off
 * while any owner has a take active, so one can't clear another's state.
 */
export function setMicActive(owner: string, active: boolean): void {
  if (active) {
    activeOwners.add(owner);
  } else {
    activeOwners.delete(owner);
  }
}

export function isMicActive(): boolean {
  return activeOwners.size > 0;
}
