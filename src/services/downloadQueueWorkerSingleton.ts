import { DownloadQueueWorker } from './downloadQueueWorker';
import { queuedResourceResolver } from './downloadResourceResolver';

let worker: DownloadQueueWorker | null = null;

export function getSharedDownloadQueueWorker(): DownloadQueueWorker {
  if (!worker) {
    worker = new DownloadQueueWorker(queuedResourceResolver);
  }
  return worker;
}

export function resetSharedDownloadQueueWorkerForTests(): void {
  worker = null;
}
