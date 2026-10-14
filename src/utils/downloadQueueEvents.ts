/**
 * Lightweight pub/sub for download-queue mutations so mounted consumers
 * (e.g. idle Sync) refresh without remounting or polling while idle.
 */

type DownloadQueueChangeListener = () => void;

const listeners: DownloadQueueChangeListener[] = [];

export function onDownloadQueueChanged(
  fn: DownloadQueueChangeListener,
): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx > -1) listeners.splice(idx, 1);
  };
}

export function emitDownloadQueueChanged(): void {
  [...listeners].forEach(fn => fn());
}
