import { getResumableDownloadItems } from '../db/repository';
import {
  transportAllowsTransfer,
  type TransferTransportInput,
} from '../utils/transportPolicy';
import {
  getTransferTransportSnapshot,
  subscribeToConnectivity,
} from './connectivity';
import { getSharedDownloadQueueWorker } from './downloadQueueWorkerSingleton';
import { logger } from '../utils/logger';
import {
  getUploadOverCellular,
  subscribeToPreference,
} from './userPreferences';

const log = logger.create('downloadQueueAutoResume');

export function startDownloadQueueAutoResume(): () => void {
  let disposed = false;

  const evaluate = () => {
    void (async () => {
      if (disposed) {
        return;
      }

      const snapshot = await getTransferTransportSnapshot();
      if (disposed) {
        return;
      }

      const transport: TransferTransportInput = {
        isOnline: snapshot.isOnline,
        isWifi: snapshot.isWifi,
        connectionType: snapshot.connectionType,
        uploadOverCellular: getUploadOverCellular(),
      };

      const gate = transportAllowsTransfer(transport);
      if (gate !== 'ok') {
        return;
      }

      const worker = getSharedDownloadQueueWorker();
      const workerState = worker.getState();

      if (workerState === 'downloading' || workerState === 'paused') {
        return;
      }

      try {
        const items = await getResumableDownloadItems(true);
        if (disposed) {
          return;
        }

        const resumable = items.filter(item =>
          ['queued', 'paused', 'cancelled', 'failed'].includes(item.status),
        );

        if (resumable.length === 0) {
          return;
        }

        log.info(
          'Auto-resuming download queue when transport allows transfer',
          {
            count: resumable.length,
          },
        );
        await worker.start(resumable);
      } catch (error) {
        log.error('Download queue auto-resume failed', { error });
      }
    })();
  };

  const unsubscribeConnectivity = subscribeToConnectivity(() => {
    evaluate();
  });

  const unsubscribePref = subscribeToPreference('uploadOverCellular', () => {
    evaluate();
  });

  return () => {
    disposed = true;
    unsubscribeConnectivity();
    unsubscribePref();
  };
}

export function stopDownloadQueueAutoResume(unsubscribe: (() => void) | null) {
  unsubscribe?.();
}
