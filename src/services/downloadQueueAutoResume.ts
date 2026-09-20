import { getResumableDownloadItems } from '../db/repository';
import { transportAllowsTransfer } from '../utils/transportPolicy';
import {
  getConnectivitySnapshot,
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

  const evaluate = (
    isOnline: boolean,
    isWifi: boolean,
    connectionType?: string,
  ) => {
    void (async () => {
      if (
        disposed ||
        transportAllowsTransfer({
          isOnline,
          isWifi,
          connectionType,
          uploadOverCellular: getUploadOverCellular(),
        }) !== 'ok'
      ) {
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

  const unsubscribeConnectivity = subscribeToConnectivity(
    (isOnline, isWifi, _isCellular, connectionType) => {
      evaluate(isOnline, isWifi, connectionType);
    },
  );

  const unsubscribePref = subscribeToPreference('uploadOverCellular', () => {
    void (async () => {
      const snapshot = await getConnectivitySnapshot();
      if (disposed) {
        return;
      }
      evaluate(snapshot.isOnline, snapshot.isWifi, snapshot.connectionType);
    })();
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
