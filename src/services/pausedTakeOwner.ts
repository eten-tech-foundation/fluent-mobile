/** Another account paused this take, so this one can't see, resume or replace it. */
export function isPausedTakeForeign(
  marker: { userId?: unknown },
  userId: number | null,
): boolean {
  return typeof marker.userId === 'number' && marker.userId !== userId;
}
