// Only pulls already in flight when Complete is confirmed are stale. A pull
// started afterwards must remain able to apply an intentional server reversion.
let revision = 0;
const completedAtRevision = new Map<number, number>();

export function getChapterAssignmentPullRevision(): number {
  return revision;
}

export function markChapterCompleteConfirmed(
  chapterAssignmentId: number,
): void {
  completedAtRevision.set(chapterAssignmentId, ++revision);
}

export function chapterCompletedAfterPull(
  chapterAssignmentId: number,
  pullRevision: number,
): boolean {
  return (completedAtRevision.get(chapterAssignmentId) ?? 0) > pullRevision;
}
