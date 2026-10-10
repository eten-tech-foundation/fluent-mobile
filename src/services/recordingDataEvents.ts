/**
 * Shared "recordings data changed" signal for sync-status UI.
 *
 * Any recording-table mutation that affects pending/failed upload counts
 * (take saved, take deleted) bumps a monotonically increasing version so
 * every mounted `usePendingUploads` instance re-reads its counts from
 * SQLite. This keeps Home, the chapter screen, ViewProject and the Sync
 * page on one shared source instead of per-screen instances that only
 * refreshed on upload session events (#38, #101; audit #530 A.1/A.2/B.3/B.8).
 *
 * Dependency-free by design: `src/db` imports it, so it must not pull in
 * React, expo, or storage modules (same constraint as the lazy
 * `require('../services/storage')` in `recordingsRepository.ts`).
 */

type RecordingDataListener = () => void;

const listeners: RecordingDataListener[] = [];

let version = 0;

/** Monotonic bump counter — changes whenever recording data changes. */
export function getRecordingDataVersion(): number {
  return version;
}

/** Bump the version and notify every subscriber. */
export function emitRecordingDataChanged(): void {
  version += 1;
  // Copy so a listener that unsubscribes mid-emit cannot skip later ones.
  [...listeners].forEach(fn => fn());
}

export function onRecordingDataChanged(fn: RecordingDataListener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx > -1) listeners.splice(idx, 1);
  };
}
