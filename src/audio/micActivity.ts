const activeOwners = new Set<string>();

/**
 * Marks the mic open or closed for one owner (the recording engine, the
 * gallery's simulation). Feedback such as haptics stays off while any owner
 * has it open, so one owner can't clear another's state.
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
