import {
  transferInputFromLinkSnapshot,
  transportAllowsTransfer,
} from '../utils/transportPolicy';
import { getTransferTransportSnapshot } from './connectivity';
import { DownloadQueueWorker } from './downloadQueueWorker';
import { queuedResourceResolver } from './downloadResourceResolver';
import { getUploadOverCellular } from './userPreferences';

let worker: DownloadQueueWorker | null = null;

async function sharedTransportAllowsTransfer(): Promise<boolean> {
  const snapshot = await getTransferTransportSnapshot();
  return (
    transportAllowsTransfer(
      transferInputFromLinkSnapshot(snapshot, getUploadOverCellular()),
    ) === 'ok'
  );
}

export function getSharedDownloadQueueWorker(): DownloadQueueWorker {
  if (!worker) {
    worker = new DownloadQueueWorker(
      queuedResourceResolver,
      sharedTransportAllowsTransfer,
    );
  }
  return worker;
}

export function resetSharedDownloadQueueWorkerForTests(): void {
  worker = null;
}
