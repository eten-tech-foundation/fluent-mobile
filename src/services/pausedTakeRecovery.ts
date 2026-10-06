import { isPausedTakeOrphaned, type PausedTakeMarker } from './pausedTakes';

export type RecoveryDecision =
  | { kind: 'prompt'; marker: PausedTakeMarker }
  | {
      kind: 'cleanup';
      marker: PausedTakeMarker;
      reason: 'orphaned' | 'no-segments';
    };

/**
 * Decide what to do with one paused-take marker on launch / verse open (#567).
 *
 * Pure: the caller checks which segment files exist and passes the result in,
 * then acts on the returned decision (show the prompt, or run the #170
 * cleanup). No file system or navigation access here.
 *
 * - Marker can't be navigated to a verse        -> cleanup ('orphaned')
 * - None of its segment files survive           -> cleanup ('no-segments')
 * - Otherwise                                   -> prompt Resume / Discard,
 *   carrying only the segments that still exist
 */
export function decideRecovery(
  marker: PausedTakeMarker,
  existingFiles: ReadonlySet<string>,
): RecoveryDecision {
  if (isPausedTakeOrphaned(marker)) {
    return { kind: 'cleanup', marker, reason: 'orphaned' };
  }

  const surviving = marker.segments.filter(uri => existingFiles.has(uri));
  if (surviving.length === 0) {
    return { kind: 'cleanup', marker, reason: 'no-segments' };
  }

  return { kind: 'prompt', marker: { ...marker, segments: surviving } };
}
