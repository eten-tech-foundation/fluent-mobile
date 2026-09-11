/**
 * Ordered playlist of local take URIs for cross-granularity playback (#411).
 *
 * Playback-only: nothing is concatenated on disk and no API is involved. The
 * queue is advanced by the caller when the playback engine reports a real
 * end-of-file — see `shouldEndPlaybackOnIdle` in `hooks/playbackStatusGuards`.
 * Advancing on a raw `idle` status would skip segments, because `replace()`
 * unloads the player and briefly reports idle mid-swap (#298).
 */
export type StitchQueue = {
  readonly uris: readonly string[];
  readonly index: number;
};

/** `null` when there is nothing playable, so callers can branch on one value. */
export function createStitchQueue(uris: readonly string[]): StitchQueue | null {
  const playable = uris.filter(uri => uri.length > 0);
  return playable.length > 0 ? { uris: playable, index: 0 } : null;
}

export function currentStitchUri(queue: StitchQueue | null): string | null {
  if (!queue) {
    return null;
  }
  return queue.uris[queue.index] ?? null;
}

/** `null` once the last segment has played — the caller then ends playback. */
export function advanceStitchQueue(
  queue: StitchQueue | null,
): StitchQueue | null {
  if (!queue) {
    return null;
  }
  const nextIndex = queue.index + 1;
  return nextIndex < queue.uris.length
    ? { uris: queue.uris, index: nextIndex }
    : null;
}
